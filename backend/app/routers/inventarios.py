from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ImportacaoXML, Inventario, InventarioItem, Item
from app.schemas import ImportacaoXMLResponse, InventarioListItem, InventarioListResponse, InventarioResponse

# Campos aceitos no corpo do PATCH, por categoria de item (seção 2.3 do
# document-rest-API.md). Óleos (possui_quebra_estoque_oficina=True) usam
# estoque/oficina; graxas e peças usam quantidade_fisica direta (RN07/RN08).
CAMPOS_COM_QUEBRA = ("estoque", "oficina")
CAMPOS_SEM_QUEBRA = ("quantidade_fisica",)

router = APIRouter()


def erro(codigo: str, mensagem: str, status_code: int):
    return JSONResponse(status_code=status_code, content={"erro": {"codigo": codigo, "mensagem": mensagem}})


def parse_data(data: str) -> Optional[date]:
    try:
        return date.fromisoformat(data)
    except ValueError:
        return None


def contar_resumo(items: List[Dict]) -> Dict[str, int]:
    resumo = {"falta": 0, "sobra": 0, "correto": 0}
    for item in items:
        status = item.get("status")
        if status in resumo:
            resumo[status] += 1
    return resumo


def montar_item(item: Item, inventario_item: Optional[InventarioItem] = None) -> Dict:
    objeto = {
        "item_id": item.id,
        "codigo": item.codigo,
        "descricao": item.descricao,
        "categoria": item.categoria,
        "possui_quebra_estoque_oficina": item.possui_quebra_estoque_oficina,
        "quantidade_fisica": 0,
        "quantidade_sistema": 0,
        "diferenca": 0,
        "status": "correto",
        "observacao": None,
    }

    if item.possui_quebra_estoque_oficina:
        objeto["estoque"] = None
        objeto["oficina"] = None

    if item.unidade:
        objeto["unidade"] = item.unidade

    if item.localizacao_padrao:
        objeto["localizacao"] = item.localizacao_padrao

    if inventario_item is not None:
        objeto.update(
            {
                "quantidade_fisica": inventario_item.quantidade_fisica,
                "quantidade_sistema": inventario_item.quantidade_sistema,
                "diferenca": inventario_item.diferenca,
                "status": inventario_item.status,
                "observacao": inventario_item.observacao,
            }
        )
        if item.possui_quebra_estoque_oficina:
            objeto["estoque"] = inventario_item.quantidade_estoque
            objeto["oficina"] = inventario_item.quantidade_oficina

    return objeto


def catalogo_oleos_graxas(db: Session) -> List[Item]:
    """Catálogo fixo de óleos e graxas (RN27). A tela de Contagem sempre
    mostra todos, tendo o dia linha em `inventario_itens` ou não."""
    return list(
        db.scalars(
            select(Item)
            .where(Item.categoria.in_(["oleo", "graxa"]), Item.ativo == True)
            .order_by(Item.codigo)
        ).all()
    )


def ultimas_quantidades_sistema_fechadas(
    db: Session,
    item_ids: List[int],
    excluir_inventario_id: Optional[int] = None,
) -> Dict[int, int]:
    """RN27: último `quantidade_sistema` fechado de cada item (0 se o item
    nunca apareceu num inventário fechado). Vale tanto para o dia ainda não
    iniciado quanto para itens do catálogo sem linha num dia já existente."""
    if not item_ids:
        return {}

    stmt = (
        select(InventarioItem.item_id, InventarioItem.quantidade_sistema)
        .join(Inventario, Inventario.id == InventarioItem.inventario_id)
        .where(Inventario.status == "fechado", InventarioItem.item_id.in_(item_ids))
        .order_by(Inventario.data.desc())
    )
    if excluir_inventario_id is not None:
        stmt = stmt.where(Inventario.id != excluir_inventario_id)

    ultimo_por_item: Dict[int, int] = {}
    for item_id, quantidade_sistema in db.execute(stmt).all():
        if item_id not in ultimo_por_item:
            ultimo_por_item[item_id] = quantidade_sistema
    return ultimo_por_item


def montar_item_sem_linha(item: Item, quantidade_sistema: int) -> Dict:
    """Item do catálogo que ainda não foi tocado no dia: físico zerado e
    sistema herdado do último fechamento (RN27)."""
    objeto = montar_item(item)
    objeto["quantidade_sistema"] = quantidade_sistema
    objeto["diferenca"] = -quantidade_sistema
    objeto["status"] = "correto" if quantidade_sistema == 0 else "falta"
    return objeto


@router.get("", response_model=InventarioListResponse)
def list_inventarios(
    status: Optional[str] = Query(None, regex="^(rascunho|fechado)$"),
    pagina: int = Query(1, alias="pagina", ge=1),
    tamanho_pagina: int = Query(30, alias="tamanho_pagina", ge=1),
    db: Session = Depends(get_db),
):
    filtro = []
    if status is None:
        filtro.append(Inventario.status == "fechado")
    else:
        filtro.append(Inventario.status == status)

    total = db.scalar(select(func.count()).select_from(Inventario).where(*filtro))
    stmt = select(Inventario).where(*filtro).order_by(Inventario.data.desc()).offset((pagina - 1) * tamanho_pagina).limit(tamanho_pagina)
    inventarios = db.scalars(stmt).all()

    resumo_query = (
        select(
            Inventario.id,
            InventarioItem.status,
            func.count().label("quantidade"),
        )
        .join(InventarioItem, Inventario.id == InventarioItem.inventario_id)
        .where(*filtro)
        .group_by(Inventario.id, InventarioItem.status)
    )

    resumo_rows = db.execute(resumo_query).all()
    resumos: Dict[int, Dict[str, int]] = {}
    for inventario_id, status_value, quantidade in resumo_rows:
        resumos.setdefault(inventario_id, {"falta": 0, "sobra": 0, "correto": 0})
        resumos[inventario_id][status_value] = quantidade

    resultados = [
        {
            "data": inventario.data,
            "status": inventario.status,
            "fechado_em": inventario.fechado_em.isoformat() if inventario.fechado_em else None,
            "resumo": resumos.get(inventario.id, {"falta": 0, "sobra": 0, "correto": 0}),
        }
        for inventario in inventarios
    ]

    return {
        "total": total,
        "pagina": pagina,
        "tamanho_pagina": tamanho_pagina,
        "resultados": resultados,
    }


@router.get("/{data}", response_model=InventarioResponse, response_model_exclude_none=True)
def get_inventario(data: str, db: Session = Depends(get_db)):
    data_obj = parse_data(data)
    if data_obj is None:
        return erro("data_invalida", "Formato de data inválido. Use AAAA-MM-DD.", 400)

    catalogo = catalogo_oleos_graxas(db)

    inventario = db.scalar(select(Inventario).where(Inventario.data == data_obj))
    if inventario is None:
        ultimo_por_item = ultimas_quantidades_sistema_fechadas(
            db, [item.id for item in catalogo]
        )
        oleos = [
            montar_item_sem_linha(item, ultimo_por_item.get(item.id, 0))
            for item in catalogo
        ]

        return {
            "data": data_obj,
            "status": "nao_iniciado",
            "fechado_em": None,
            "resumo_oleos": contar_resumo(oleos),
            "resumo_pecas": {"falta": 0, "sobra": 0, "correto": 0},
            "oleos": oleos,
            "pecas": [],
        }

    inventario_items_query = (
        select(InventarioItem, Item)
        .join(Item, InventarioItem.item_id == Item.id)
        .where(InventarioItem.inventario_id == inventario.id)
    )
    inventario_rows = db.execute(inventario_items_query).all()
    linhas_por_item = {
        inventario_item.item_id: (inventario_item, item)
        for inventario_item, item in inventario_rows
    }

    # Óleos e graxas saem sempre do catálogo fixo: o dia pode ter linha para
    # alguns itens e nenhuma para os outros, e a tela precisa dos 11 mesmo
    # assim. Os que não têm linha herdam o sistema do último fechamento.
    ids_sem_linha = [item.id for item in catalogo if item.id not in linhas_por_item]
    ultimo_por_item = ultimas_quantidades_sistema_fechadas(
        db, ids_sem_linha, excluir_inventario_id=inventario.id
    )

    oleos = []
    for item in catalogo:
        par = linhas_por_item.get(item.id)
        if par is None:
            oleos.append(montar_item_sem_linha(item, ultimo_por_item.get(item.id, 0)))
        else:
            oleos.append(montar_item(item, par[0]))

    # Peças vêm só do que existe no dia (são importadas de XML, RN12/RN13).
    # Óleos/graxas fora do catálogo (item desativado, por exemplo) continuam
    # aparecendo se tiverem linha, para não sumir dado já contado.
    ids_catalogo = {item.id for item in catalogo}
    pecas = []
    for inventario_item, item in inventario_rows:
        if item.categoria in ("oleo", "graxa"):
            if item.id not in ids_catalogo:
                oleos.append(montar_item(item, inventario_item))
        else:
            pecas.append(montar_item(item, inventario_item))

    return {
        "data": inventario.data,
        "status": inventario.status,
        "fechado_em": inventario.fechado_em.isoformat() if inventario.fechado_em else None,
        "resumo_oleos": contar_resumo(oleos),
        "resumo_pecas": contar_resumo(pecas),
        "oleos": oleos,
        "pecas": pecas,
    }


def _ultima_quantidade_sistema_fechada(db: Session, item_id: int) -> int:
    """RN27: semeia quantidade_sistema com o último valor fechado do item
    (0 se o item nunca apareceu em nenhum inventário fechado). Reaproveita a
    mesma lógica usada em `get_inventario` para a resposta "nao_iniciado",
    só que para um único item em vez do catálogo inteiro."""
    valor = db.scalar(
        select(InventarioItem.quantidade_sistema)
        .join(Inventario, Inventario.id == InventarioItem.inventario_id)
        .where(InventarioItem.item_id == item_id, Inventario.status == "fechado")
        .order_by(Inventario.data.desc())
        .limit(1)
    )
    return valor if valor is not None else 0


@router.patch("/{data}/itens/{item_id}")
def patch_item(
    data: str,
    item_id: int,
    payload: Optional[Dict] = Body(default=None),
    db: Session = Depends(get_db),
):
    data_obj = parse_data(data)
    if data_obj is None:
        return erro("data_invalida", "Formato de data inválido. Use AAAA-MM-DD.", 400)

    item = db.get(Item, item_id)
    if item is None:
        return erro("item_nao_encontrado", "Item não encontrado no catálogo.", 404)

    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        return erro("corpo_invalido", "Corpo da requisição deve ser um objeto JSON.", 400)

    tem_quebra = item.possui_quebra_estoque_oficina
    campos_permitidos = CAMPOS_COM_QUEBRA if tem_quebra else CAMPOS_SEM_QUEBRA
    campos_proibidos = CAMPOS_SEM_QUEBRA if tem_quebra else CAMPOS_COM_QUEBRA

    # RNF08 / seção 2.3: rejeita campo incompatível com a categoria do item,
    # mesmo que o valor enviado seja `null` — a simples presença da chave já
    # conta como "tentativa de enviar" o campo errado.
    for campo in campos_proibidos:
        if campo in payload:
            return erro(
                "campo_incompativel",
                f"O campo '{campo}' não é permitido para este item "
                f"(possui_quebra_estoque_oficina={tem_quebra}).",
                422,
            )

    # Valida tipo (400) e não-negatividade (422) dos campos numéricos permitidos.
    valores_numericos: Dict[str, int] = {}
    for campo in campos_permitidos:
        if campo not in payload or payload[campo] is None:
            continue
        valor = payload[campo]
        if isinstance(valor, bool) or not isinstance(valor, int):
            return erro("tipo_invalido", f"O campo '{campo}' deve ser um número inteiro.", 400)
        if valor < 0:
            return erro("quantidade_invalida", f"O campo '{campo}' não pode ser negativo.", 422)
        valores_numericos[campo] = valor

    observacao_enviada = "observacao" in payload
    observacao_valor = payload.get("observacao")
    if observacao_enviada and observacao_valor is not None and not isinstance(observacao_valor, str):
        return erro("tipo_invalido", "O campo 'observacao' deve ser um texto.", 400)

    # RN16: a linha de `inventarios` só nasce na primeira alteração de fato
    # do dia — nunca ao só consultar.
    inventario = db.scalar(select(Inventario).where(Inventario.data == data_obj))
    if inventario is None:
        inventario = Inventario(data=data_obj, status="rascunho")
        db.add(inventario)
        db.flush()

    inventario_item = db.scalar(
        select(InventarioItem).where(
            InventarioItem.inventario_id == inventario.id,
            InventarioItem.item_id == item.id,
        )
    )

    if inventario_item is None:
        # Semeadura RN27: só óleo/graxa herdam o último sistema fechado;
        # peças sempre nascem com sistema 0 (só recebem valor via importação
        # de XML, RN12).
        quantidade_sistema_inicial = 0
        if item.categoria in ("oleo", "graxa"):
            quantidade_sistema_inicial = _ultima_quantidade_sistema_fechada(db, item.id)

        inventario_item = InventarioItem(
            inventario_id=inventario.id,
            item_id=item.id,
            quantidade_fisica=0,
            quantidade_sistema=quantidade_sistema_inicial,
        )
        db.add(inventario_item)
        db.flush()

    # Aplica só os campos enviados (atualização parcial).
    if tem_quebra:
        if "estoque" in valores_numericos:
            inventario_item.quantidade_estoque = valores_numericos["estoque"]
        if "oficina" in valores_numericos:
            inventario_item.quantidade_oficina = valores_numericos["oficina"]
        # RN07: a quantidade física de itens com quebra é sempre a soma
        # estoque + oficina, calculada pela aplicação (banco-de-dados.md
        # seção 4) — nunca digitada diretamente.
        estoque_atual = inventario_item.quantidade_estoque or 0
        oficina_atual = inventario_item.quantidade_oficina or 0
        inventario_item.quantidade_fisica = estoque_atual + oficina_atual
    else:
        if "quantidade_fisica" in valores_numericos:
            inventario_item.quantidade_fisica = valores_numericos["quantidade_fisica"]

    if observacao_enviada:
        inventario_item.observacao = observacao_valor

    db.commit()
    db.refresh(inventario_item)

    return montar_item(item, inventario_item)


@router.get("/{data}/importacoes", response_model=List[ImportacaoXMLResponse])
def list_importacoes(data: str, db: Session = Depends(get_db)):
    data_obj = parse_data(data)
    if data_obj is None:
        return erro("data_invalida", "Formato de data inválido. Use AAAA-MM-DD.", 400)

    inventario = db.scalar(select(Inventario).where(Inventario.data == data_obj))
    if inventario is None:
        return []

    importacoes = db.scalars(
        select(ImportacaoXML)
        .where(ImportacaoXML.inventario_id == inventario.id)
        .order_by(ImportacaoXML.importado_em.asc())
    ).all()

    return [
        {
            "arquivo": item.nome_arquivo,
            "processado_em": item.importado_em.isoformat(),
            "oleos_atualizados": item.itens_conhecidos_atualizados,
            "pecas_novas": item.itens_novos,
            "pecas_atualizadas": item.itens_atualizados,
            "codigos_duplicados": item.codigos_duplicados or [],
        }
        for item in importacoes
    ]

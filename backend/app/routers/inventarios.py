import logging
import re
import xml.etree.ElementTree as ET
from datetime import date
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile
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

# Estrutura do XML de conferência (fluxo-de-telas.md seção 4.2): cada item é
# um elemento <Dados> e os campos vêm em atributos numerados.
ELEMENTO_ITEM_XML = "Dados"
ATRIBUTO_LOCALIZACAO = "Coluna1"
ATRIBUTO_SISTEMA = "Coluna2"
ATRIBUTO_UNIDADE = "Coluna4"
ATRIBUTO_CODIGO = "Coluna6"
ATRIBUTO_DESCRICAO = "Coluna7"

logger = logging.getLogger(__name__)

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


def ranking_sistema_fechado(db: Session, item_ids: List[int]) -> Dict[int, List[Tuple[int, int]]]:
    """Base da herança RN27, em uma única query: para cada item, os dois
    inventários fechados mais recentes que têm linha dele, na forma
    `(inventario_id, quantidade_sistema)` e do mais novo para o mais antigo.

    Dois bastam porque a herança só precisa ignorar *um* inventário (o
    próprio dia que está sendo montado). Guardar o ranking em vez de só o
    primeiro valor permite resolver a herança de vários dias de uma vez,
    sem repetir a consulta por dia (a listagem devolve até 30 dias)."""
    if not item_ids:
        return {}

    stmt = (
        select(
            InventarioItem.item_id,
            InventarioItem.inventario_id,
            InventarioItem.quantidade_sistema,
        )
        .join(Inventario, Inventario.id == InventarioItem.inventario_id)
        .where(Inventario.status == "fechado", InventarioItem.item_id.in_(item_ids))
        .order_by(Inventario.data.desc())
    )

    ranking: Dict[int, List[Tuple[int, int]]] = {}
    for item_id, inventario_id, quantidade_sistema in db.execute(stmt).all():
        entradas = ranking.setdefault(item_id, [])
        if len(entradas) < 2:
            entradas.append((inventario_id, quantidade_sistema))
    return ranking


def heranca_do_ranking(
    ranking: Dict[int, List[Tuple[int, int]]],
    excluir_inventario_id: Optional[int] = None,
) -> Dict[int, int]:
    """RN27: último `quantidade_sistema` fechado de cada item, ignorando o
    inventário informado (um dia já fechado não pode herdar de si mesmo).
    Item ausente do dicionário nunca apareceu num inventário fechado."""
    herdado: Dict[int, int] = {}
    for item_id, entradas in ranking.items():
        for inventario_id, quantidade_sistema in entradas:
            if excluir_inventario_id is not None and inventario_id == excluir_inventario_id:
                continue
            herdado[item_id] = quantidade_sistema
            break
    return herdado


def ultimas_quantidades_sistema_fechadas(
    db: Session,
    item_ids: List[int],
    excluir_inventario_id: Optional[int] = None,
) -> Dict[int, int]:
    """RN27: último `quantidade_sistema` fechado de cada item (0 se o item
    nunca apareceu num inventário fechado). Vale tanto para o dia ainda não
    iniciado quanto para itens do catálogo sem linha num dia já existente."""
    return heranca_do_ranking(
        ranking_sistema_fechado(db, item_ids), excluir_inventario_id
    )


def montar_item_sem_linha(item: Item, quantidade_sistema: int) -> Dict:
    """Item do catálogo que ainda não foi tocado no dia: físico zerado e
    sistema herdado do último fechamento (RN27)."""
    objeto = montar_item(item)
    objeto["quantidade_sistema"] = quantidade_sistema
    objeto["diferenca"] = -quantidade_sistema
    objeto["status"] = "correto" if quantidade_sistema == 0 else "falta"
    return objeto


def montar_oleos_e_pecas(
    catalogo: List[Item],
    linhas: List[Tuple[InventarioItem, Item]],
    heranca: Dict[int, int],
) -> Tuple[List[Dict], List[Dict]]:
    """Monta as duas listas de um dia que já existe em `inventarios`.

    Óleos e graxas saem sempre do catálogo fixo: o dia pode ter linha para
    alguns itens e nenhuma para os outros, e a contagem precisa dos 11 mesmo
    assim — os sem linha herdam o sistema do último fechamento (RN27).
    Peças vêm só do que existe no dia (são importadas de XML, RN12/RN13).
    Óleos/graxas fora do catálogo (item desativado, por exemplo) continuam
    aparecendo se tiverem linha, para não sumir dado já contado.

    Compartilhada pelo detalhe do dia e pelo resumo da listagem, para que os
    dois nunca divirjam."""
    linhas_por_item = {inventario_item.item_id: inventario_item for inventario_item, _ in linhas}
    ids_catalogo = {item.id for item in catalogo}

    oleos: List[Dict] = []
    for item in catalogo:
        inventario_item = linhas_por_item.get(item.id)
        if inventario_item is None:
            oleos.append(montar_item_sem_linha(item, heranca.get(item.id, 0)))
        else:
            oleos.append(montar_item(item, inventario_item))

    pecas: List[Dict] = []
    for inventario_item, item in linhas:
        if item.categoria in ("oleo", "graxa"):
            if item.id not in ids_catalogo:
                oleos.append(montar_item(item, inventario_item))
        else:
            pecas.append(montar_item(item, inventario_item))

    return oleos, pecas


def somar_resumos(*resumos: Dict[str, int]) -> Dict[str, int]:
    total = {"falta": 0, "sobra": 0, "correto": 0}
    for resumo in resumos:
        for chave in total:
            total[chave] += resumo.get(chave, 0)
    return total


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

    # O `resumo` da listagem tem que ser exatamente
    # `resumo_oleos + resumo_pecas` do `GET /inventarios/{data}` do mesmo dia
    # (seção 2.1 do document-rest-API.md). Por isso ele é montado pelos mesmos
    # helpers, e não por um COUNT sobre `inventario_itens` — que ignoraria os
    # óleos do catálogo ainda sem linha no dia.
    ids_pagina = [inventario.id for inventario in inventarios]
    catalogo = catalogo_oleos_graxas(db)

    linhas_por_inventario: Dict[int, List[Tuple[InventarioItem, Item]]] = {}
    if ids_pagina:
        linhas_rows = db.execute(
            select(InventarioItem, Item)
            .join(Item, InventarioItem.item_id == Item.id)
            .where(InventarioItem.inventario_id.in_(ids_pagina))
        ).all()
        for inventario_item, item in linhas_rows:
            linhas_por_inventario.setdefault(inventario_item.inventario_id, []).append(
                (inventario_item, item)
            )

    # Uma única consulta de herança RN27 para a página inteira: o ranking é
    # resolvido em memória por dia, evitando N+1.
    ranking = ranking_sistema_fechado(db, [item.id for item in catalogo])

    resumos: Dict[int, Dict[str, int]] = {}
    for inventario in inventarios:
        oleos, pecas = montar_oleos_e_pecas(
            catalogo,
            linhas_por_inventario.get(inventario.id, []),
            heranca_do_ranking(ranking, excluir_inventario_id=inventario.id),
        )
        resumos[inventario.id] = somar_resumos(contar_resumo(oleos), contar_resumo(pecas))

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
    ids_com_linha = {inventario_item.item_id for inventario_item, _ in inventario_rows}

    ids_sem_linha = [item.id for item in catalogo if item.id not in ids_com_linha]
    ultimo_por_item = ultimas_quantidades_sistema_fechadas(
        db, ids_sem_linha, excluir_inventario_id=inventario.id
    )

    oleos, pecas = montar_oleos_e_pecas(catalogo, inventario_rows, ultimo_por_item)

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


def _atributo(elemento: ET.Element, nome: str) -> str:
    return (elemento.get(nome) or "").strip()


def _inteiro_do_inicio(texto: str) -> int:
    """Mesma leitura tolerante do protótipo (`parseInt(raw, 10) || 0`): usa o
    inteiro do início da string e cai para 0 quando não há nenhum. Evita que
    um campo com lixo ("12 UN", "", "-") derrube a importação inteira."""
    correspondencia = re.match(r"-?\d+", texto)
    return int(correspondencia.group()) if correspondencia else 0


def extrair_itens_xml(conteudo: bytes) -> List[Dict]:
    """Percorre os elementos <Dados> do arquivo e lê Coluna1/2/4/6/7
    (fluxo-de-telas.md seção 4.2). Itens sem código são descartados, como no
    protótipo — sem código não há identidade (RN04). Levanta `ET.ParseError`
    se o arquivo não for um XML bem formado (tratado como 422 pela rota)."""
    raiz = ET.fromstring(conteudo)

    itens: List[Dict] = []
    for elemento in raiz.iter():
        # `rsplit` descarta o namespace ({uri}Dados), caso o relatório venha
        # com um — o protótipo casava só pelo nome local.
        if elemento.tag.rsplit("}", 1)[-1] != ELEMENTO_ITEM_XML:
            continue

        codigo = _atributo(elemento, ATRIBUTO_CODIGO)
        if not codigo:
            continue

        itens.append(
            {
                "codigo": codigo,
                "descricao": _atributo(elemento, ATRIBUTO_DESCRICAO),
                "unidade": _atributo(elemento, ATRIBUTO_UNIDADE),
                "localizacao": _atributo(elemento, ATRIBUTO_LOCALIZACAO),
                "quantidade_sistema": _inteiro_do_inicio(_atributo(elemento, ATRIBUTO_SISTEMA)),
            }
        )
    return itens


def deduplicar_por_codigo(itens: List[Dict]) -> Tuple[List[Dict], List[str]]:
    """RN14: se um código aparece mais de uma vez no mesmo arquivo, vale o
    último valor encontrado e o código entra na lista de avisos."""
    por_codigo: Dict[str, Dict] = {}
    duplicados: List[str] = []

    for item in itens:
        codigo = item["codigo"]
        if codigo in por_codigo and codigo not in duplicados:
            duplicados.append(codigo)
        por_codigo[codigo] = item

    return list(por_codigo.values()), duplicados


def _garantir_linha_do_item(db: Session, inventario: Inventario, item: Item) -> InventarioItem:
    linha = db.scalar(
        select(InventarioItem).where(
            InventarioItem.inventario_id == inventario.id,
            InventarioItem.item_id == item.id,
        )
    )
    if linha is None:
        linha = InventarioItem(
            inventario_id=inventario.id,
            item_id=item.id,
            quantidade_fisica=0,
            quantidade_sistema=0,
        )
        db.add(linha)
        db.flush()
    return linha


def _semear_oleos_do_dia(db: Session, inventario: Inventario) -> None:
    """Passo 4.5.1 do fluxo: ao importar, os óleos e graxas que NÃO vierem no
    XML precisam já constar no dia com o último sistema fechado conhecido, e
    não com zero (RN27)."""
    catalogo = catalogo_oleos_graxas(db)
    existentes = set(
        db.scalars(
            select(InventarioItem.item_id).where(InventarioItem.inventario_id == inventario.id)
        ).all()
    )

    faltantes = [item for item in catalogo if item.id not in existentes]
    if not faltantes:
        return

    ultimos = ultimas_quantidades_sistema_fechadas(
        db, [item.id for item in faltantes], excluir_inventario_id=inventario.id
    )
    for item in faltantes:
        db.add(
            InventarioItem(
                inventario_id=inventario.id,
                item_id=item.id,
                quantidade_fisica=0,
                quantidade_sistema=ultimos.get(item.id, 0),
            )
        )
    db.flush()


def _aplicar_importacao(
    db: Session,
    data_obj: date,
    nome_arquivo: str,
    itens_xml: List[Dict],
    codigos_duplicados: List[str],
    conteudo: bytes,
) -> Dict:
    """Passos 4.4 a 4.7 do fluxo. Sem commit: quem chama decide confirmar ou
    desfazer, para que a importação seja tudo-ou-nada (4.8)."""
    catalogo_por_codigo: Dict[str, Item] = {}
    codigos = [item["codigo"] for item in itens_xml]
    if codigos:
        for item in db.scalars(select(Item).where(Item.codigo.in_(codigos))).all():
            catalogo_por_codigo[item.codigo] = item

    # RN16: junto com o PATCH, a importação é a outra rota que pode dar à luz
    # o inventário do dia.
    inventario = db.scalar(select(Inventario).where(Inventario.data == data_obj))
    if inventario is None:
        inventario = Inventario(data=data_obj, status="rascunho")
        db.add(inventario)
        db.flush()

    _semear_oleos_do_dia(db, inventario)

    oleos_atualizados = 0
    pecas_novas = 0
    pecas_atualizadas = 0

    for dados in itens_xml:
        item = catalogo_por_codigo.get(dados["codigo"])

        if item is not None and item.categoria in ("oleo", "graxa"):
            # RN11: óleo/graxa conhecido só tem o sistema atualizado. A
            # quantidade física é sempre contagem manual — a importação
            # nunca encosta nela.
            linha = _garantir_linha_do_item(db, inventario, item)
            linha.quantidade_sistema = dados["quantidade_sistema"]
            oleos_atualizados += 1
            continue

        if item is None:
            # RN12: código desconhecido nasce como peça no catálogo.
            item = Item(
                codigo=dados["codigo"],
                descricao=dados["descricao"] or dados["codigo"],
                unidade=dados["unidade"] or None,
                categoria="peca",
                possui_quebra_estoque_oficina=False,
                localizacao_padrao=dados["localizacao"] or None,
            )
            db.add(item)
            db.flush()
            pecas_novas += 1
        else:
            # Peça já vista antes: só descrição/localização/unidade se vieram
            # preenchidas no arquivo (RN04, RN12).
            if dados["descricao"]:
                item.descricao = dados["descricao"]
            if dados["localizacao"]:
                item.localizacao_padrao = dados["localizacao"]
            if dados["unidade"]:
                item.unidade = dados["unidade"]
            pecas_atualizadas += 1

        # RN13: upsert que preserva a quantidade física já digitada — é isso
        # que torna seguro reimportar o mesmo arquivo.
        linha = _garantir_linha_do_item(db, inventario, item)
        linha.quantidade_sistema = dados["quantidade_sistema"]

    # RN15 / passo 4.7: registro de auditoria, que sobrevive até a uma
    # "Nova contagem" posterior (RN21), porque essa não apaga o inventário.
    registro = ImportacaoXML(
        inventario_id=inventario.id,
        nome_arquivo=nome_arquivo,
        itens_conhecidos_atualizados=oleos_atualizados,
        itens_novos=pecas_novas,
        itens_atualizados=pecas_atualizadas,
        codigos_duplicados=codigos_duplicados or None,
        conteudo_arquivo=conteudo.decode("utf-8", errors="replace"),
    )
    db.add(registro)
    db.flush()
    db.refresh(registro)

    return {
        "arquivo": registro.nome_arquivo,
        "processado_em": registro.importado_em.isoformat(),
        "oleos_atualizados": oleos_atualizados,
        "pecas_novas": pecas_novas,
        "pecas_atualizadas": pecas_atualizadas,
        "codigos_duplicados": codigos_duplicados,
    }


@router.post("/{data}/importar-xml", response_model=ImportacaoXMLResponse)
async def importar_xml(
    data: str,
    arquivo: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
):
    """Importa o XML de conferência do dia (RF07–RF15, RN10–RN15, RN27).

    Todo o processamento roda numa única transação: ou a importação inteira
    é aplicada, ou nada dela é (fluxo-de-telas.md seção 4.8)."""
    data_obj = parse_data(data)
    if data_obj is None:
        return erro("data_invalida", "Formato de data inválido. Use AAAA-MM-DD.", 400)

    if arquivo is None:
        return erro("arquivo_ausente", "Envie o arquivo XML no campo 'arquivo' do formulário.", 400)

    conteudo = await arquivo.read()
    if not conteudo.strip():
        return erro("arquivo_ausente", "O arquivo enviado está vazio.", 400)

    # Passo 4.1: valida antes de tocar no banco.
    try:
        itens_xml = extrair_itens_xml(conteudo)
    except ET.ParseError:
        return erro(
            "xml_invalido",
            "Não foi possível ler esse arquivo XML. Verifique se o arquivo é válido.",
            422,
        )

    itens_xml, codigos_duplicados = deduplicar_por_codigo(itens_xml)

    try:
        resumo = _aplicar_importacao(
            db, data_obj, arquivo.filename or "arquivo.xml", itens_xml, codigos_duplicados, conteudo
        )
        db.commit()
    except Exception:
        # Passo 4.8: qualquer falha desfaz a transação inteira — nunca fica
        # meia importação gravada.
        db.rollback()
        logger.exception("Falha ao importar XML do dia %s", data)
        return erro(
            "falha_importacao",
            "Falha ao processar a importação. Nenhuma alteração foi gravada.",
            500,
        )

    return resumo


@router.post("/{data}/fechar")
def fechar_inventario(data: str, db: Session = Depends(get_db)):
    """Botão "Salvar contagem do dia" (RF18, RF19, RN17–RN20).

    Não cria registro novo: só muda o status para `fechado`. Re-fechar um dia
    já fechado (depois de uma correção, RN19) preserva o `fechado_em` do
    primeiro fechamento (RN18)."""
    data_obj = parse_data(data)
    if data_obj is None:
        return erro("data_invalida", "Formato de data inválido. Use AAAA-MM-DD.", 400)

    inventario = db.scalar(select(Inventario).where(Inventario.data == data_obj))
    if inventario is None:
        return erro(
            "inventario_nao_encontrado",
            "Não existe contagem para essa data — nada a fechar.",
            404,
        )

    inventario.status = "fechado"
    # RN18: só grava o horário no primeiro fechamento. Num re-fechamento o
    # valor original é preservado, e é ele que volta na resposta.
    if inventario.fechado_em is None:
        inventario.fechado_em = func.now()

    db.commit()
    db.refresh(inventario)

    return {
        "data": inventario.data.isoformat(),
        "status": inventario.status,
        "fechado_em": inventario.fechado_em.isoformat() if inventario.fechado_em else None,
    }


@router.delete("/{data}/itens", response_model=InventarioResponse, response_model_exclude_none=True)
def limpar_itens(data: str, db: Session = Depends(get_db)):
    """Botão "Nova contagem" (RF22, RN21).

    Não é uma exclusão geral (seção 2.6 do document-rest-API.md): óleos e
    graxas só têm os campos físicos zerados, mantendo `quantidade_sistema`
    (RN27); as linhas de peças são apagadas, porque a lista de peças do dia
    é reconstruída pela próxima importação de XML (RN12). Só a data
    selecionada é afetada (RN21)."""
    data_obj = parse_data(data)
    if data_obj is None:
        return erro("data_invalida", "Formato de data inválido. Use AAAA-MM-DD.", 400)

    inventario = db.scalar(select(Inventario).where(Inventario.data == data_obj))
    if inventario is None:
        return erro(
            "inventario_nao_encontrado",
            "Não existe contagem para essa data — nada a limpar.",
            404,
        )

    linhas = db.execute(
        select(InventarioItem, Item)
        .join(Item, InventarioItem.item_id == Item.id)
        .where(InventarioItem.inventario_id == inventario.id)
    ).all()

    for inventario_item, item in linhas:
        if item.categoria in ("oleo", "graxa"):
            inventario_item.quantidade_fisica = 0
            inventario_item.quantidade_estoque = None
            inventario_item.quantidade_oficina = None
            inventario_item.observacao = None
        else:
            db.delete(inventario_item)

    # Decisão do usuário (2026-08-03): limpar um dia já fechado não o reabre —
    # o status e o `fechado_em` original são preservados. Ver SPRINTS.md.
    db.commit()

    return get_inventario(data, db)


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

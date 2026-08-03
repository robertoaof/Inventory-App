from datetime import date
from typing import Dict, List, Optional

from pydantic import BaseModel


class Resumo(BaseModel):
    falta: int
    sobra: int
    correto: int


class ItemBase(BaseModel):
    item_id: int
    codigo: str
    descricao: str
    categoria: str
    possui_quebra_estoque_oficina: bool
    quantidade_fisica: int
    quantidade_sistema: int
    diferenca: int
    status: str
    observacao: Optional[str] = None

    class Config:
        orm_mode = True


class ItemOleo(ItemBase):
    estoque: Optional[int] = None
    oficina: Optional[int] = None


class ItemPeca(ItemBase):
    unidade: Optional[str] = None
    localizacao: Optional[str] = None


class InventarioResponse(BaseModel):
    data: date
    status: str
    fechado_em: Optional[str] = None
    resumo_oleos: Resumo
    resumo_pecas: Resumo
    oleos: List[ItemOleo]
    pecas: List[ItemPeca]


class InventarioListItem(BaseModel):
    data: date
    status: str
    fechado_em: Optional[str] = None
    resumo: Resumo

    class Config:
        orm_mode = True


class InventarioListResponse(BaseModel):
    total: int
    pagina: int
    tamanho_pagina: int
    resultados: List[InventarioListItem]


class ImportacaoXMLResponse(BaseModel):
    arquivo: str
    processado_em: str
    oleos_atualizados: int
    pecas_novas: int
    pecas_atualizadas: int
    codigos_duplicados: List[str]


class PatchInventarioItem(BaseModel):
    estoque: Optional[int]
    oficina: Optional[int]
    quantidade_fisica: Optional[int]
    observacao: Optional[str]

    class Config:
        orm_mode = True

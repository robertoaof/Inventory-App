from sqlalchemy import (
    BIGINT,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    TIMESTAMP,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from .database import Base


def now_timestamp():
    return text("now()")


class Item(Base):
    __tablename__ = "itens"

    id = Column(BIGINT, primary_key=True)
    codigo = Column(String(50), nullable=False, unique=True)
    descricao = Column(String(255), nullable=False)
    unidade = Column(String(20), nullable=True)
    categoria = Column(String(10), nullable=False, default="peca")
    possui_quebra_estoque_oficina = Column(Boolean, nullable=False, default=False)
    localizacao_padrao = Column(String(50), nullable=True)
    ativo = Column(Boolean, nullable=False, default=True)
    criado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())
    atualizado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())

    __table_args__ = (
        CheckConstraint("categoria IN ('oleo', 'graxa', 'peca')", name="ck_itens_categoria"),
    )


class Inventario(Base):
    __tablename__ = "inventarios"

    id = Column(BIGINT, primary_key=True)
    data = Column(Date, nullable=False, unique=True)
    status = Column(String(10), nullable=False, server_default="rascunho")
    fechado_em = Column(TIMESTAMP(timezone=True), nullable=True)
    observacao_geral = Column(Text, nullable=True)
    criado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())
    atualizado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())

    __table_args__ = (
        CheckConstraint("status IN ('rascunho', 'fechado')", name="ck_inventarios_status"),
    )


class InventarioItem(Base):
    __tablename__ = "inventario_itens"

    id = Column(BIGINT, primary_key=True)
    inventario_id = Column(BIGINT, ForeignKey("inventarios.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(BIGINT, ForeignKey("itens.id"), nullable=False)
    quantidade_estoque = Column(Integer, nullable=True)
    quantidade_oficina = Column(Integer, nullable=True)
    quantidade_fisica = Column(Integer, nullable=False, server_default="0")
    quantidade_sistema = Column(Integer, nullable=False, server_default="0")
    diferenca = Column(Integer, nullable=False, server_default="0")
    status = Column(String(10), nullable=False, server_default="correto")
    observacao = Column(Text, nullable=True)
    criado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())
    atualizado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())

    __table_args__ = (
        CheckConstraint("status IN ('correto', 'sobra', 'falta')", name="ck_inventario_itens_status"),
    )


class ImportacaoXML(Base):
    __tablename__ = "importacoes_xml"

    id = Column(BIGINT, primary_key=True)
    inventario_id = Column(BIGINT, ForeignKey("inventarios.id", ondelete="CASCADE"), nullable=False)
    nome_arquivo = Column(String(255), nullable=False)
    importado_em = Column(TIMESTAMP(timezone=True), nullable=False, server_default=now_timestamp())
    itens_conhecidos_atualizados = Column(Integer, nullable=False, server_default="0")
    itens_novos = Column(Integer, nullable=False, server_default="0")
    itens_atualizados = Column(Integer, nullable=False, server_default="0")
    codigos_duplicados = Column(ARRAY(Text), nullable=True)
    conteudo_arquivo = Column(Text, nullable=True)

"""Initial tables

Revision ID: 0001_initial
Revises: 
Create Date: 2026-07-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
default_branch = None
deploy_revision = None


def upgrade():
    op.create_table(
        "itens",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("codigo", sa.String(length=50), nullable=False, unique=True),
        sa.Column("descricao", sa.String(length=255), nullable=False),
        sa.Column("unidade", sa.String(length=20), nullable=True),
        sa.Column("categoria", sa.String(length=10), nullable=False, server_default="peca"),
        sa.Column("possui_quebra_estoque_oficina", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("localizacao_padrao", sa.String(length=50), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("criado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("categoria IN ('oleo', 'graxa', 'peca')", name="ck_itens_categoria"),
    )

    op.create_table(
        "inventarios",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("data", sa.Date(), nullable=False, unique=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="rascunho"),
        sa.Column("fechado_em", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("observacao_geral", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('rascunho', 'fechado')", name="ck_inventarios_status"),
    )

    op.create_table(
        "inventario_itens",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("inventario_id", sa.BigInteger(), sa.ForeignKey("inventarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.BigInteger(), sa.ForeignKey("itens.id"), nullable=False),
        sa.Column("quantidade_estoque", sa.Integer(), nullable=True),
        sa.Column("quantidade_oficina", sa.Integer(), nullable=True),
        sa.Column("quantidade_fisica", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quantidade_sistema", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("diferenca", sa.Integer(), sa.Computed("quantidade_fisica - quantidade_sistema", persisted=True), nullable=False),
        sa.Column(
            "status",
            sa.String(length=10),
            sa.Computed(
                "CASE WHEN quantidade_fisica - quantidade_sistema = 0 THEN 'correto' "
                "WHEN quantidade_fisica - quantidade_sistema > 0 THEN 'sobra' "
                "ELSE 'falta' END",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("inventario_id", "item_id", name="uq_inventario_item"),
        sa.CheckConstraint("status IN ('correto', 'sobra', 'falta')", name="ck_inventario_itens_status"),
    )

    op.create_table(
        "importacoes_xml",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("inventario_id", sa.BigInteger(), sa.ForeignKey("inventarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome_arquivo", sa.String(length=255), nullable=False),
        sa.Column("importado_em", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("itens_conhecidos_atualizados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("itens_novos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("itens_atualizados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("codigos_duplicados", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("conteudo_arquivo", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_table("importacoes_xml")
    op.drop_table("inventario_itens")
    op.drop_table("inventarios")
    op.drop_table("itens")

import os
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@db:5432/scania")

# Em runtime serverless (Vercel) cada invocação é um processo curto e
# isolado: manter um pool de conexões não reaproveita nada entre
# requisições e ainda consome o limite de conexões do Supabase. Além
# disso, o pooler do Supabase em modo "transaction" (porta 6543) não
# suporta prepared statements, que o psycopg 3 usa por padrão — daí o
# prepare_threshold=None. Sem isso a falha é intermitente
# (`prepared statement "_pg3_0" already exists`), só sob concorrência.
#
# A flag fica desligada por padrão para não mudar o comportamento em
# desenvolvimento nem num processo de longa duração (Docker/VPS), onde o
# pool é justamente o que se quer. Ver docs/deploy-vercel-supabase.md,
# seção 3.
_MODO_SERVERLESS = os.getenv("DB_MODO_SERVERLESS", "").lower() in ("1", "true", "sim")

if _MODO_SERVERLESS:
    engine = create_engine(
        DATABASE_URL,
        future=True,
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
    )
else:
    engine = create_engine(DATABASE_URL, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

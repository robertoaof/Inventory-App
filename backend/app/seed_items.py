from sqlalchemy import select
from app.database import SessionLocal, engine
from app.models import Base, Item

FIXED_ITEMS = [
    {"codigo": "45-3247280", "descricao": "E7", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2388304", "descricao": "LDF3", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-3142034", "descricao": "LDF4", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-3020476", "descricao": "LDF5", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2003072", "descricao": "STO MINERAL 85W140", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2003048", "descricao": "STO SINTÉTICO 80W90", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2741955", "descricao": "MTF 75W80", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2805163", "descricao": "STO 75W90", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2125324", "descricao": "STO2 75W140", "categoria": "oleo", "possui_quebra_estoque_oficina": True},
    {"codigo": "45-2428584", "descricao": "GRAXA CARDAN", "categoria": "graxa", "possui_quebra_estoque_oficina": False},
    {"codigo": "45-2453971", "descricao": "GRAXA USO GERAL", "categoria": "graxa", "possui_quebra_estoque_oficina": False},
]


def seed():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        for item_data in FIXED_ITEMS:
            stmt = select(Item).where(Item.codigo == item_data["codigo"])
            existing = session.execute(stmt).scalar_one_or_none()
            if existing is None:
                item = Item(**item_data)
                session.add(item)
        session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    seed()
    print("Seed completo: catálogo fixo inserido.")

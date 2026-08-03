import os
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .routers import inventarios

app = FastAPI(title="Scania Inventário API")


def _erro_envelope(status_code: int, codigo: str, mensagem: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"erro": {"codigo": codigo, "mensagem": mensagem}})


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    # Toda resposta de erro segue o mesmo envelope { "erro": { "codigo", "mensagem" } },
    # inclusive falhas de validação nativas do FastAPI/Pydantic que não
    # passam pelas checagens manuais dos routers (ex: JSON malformado,
    # parâmetro de path com tipo errado). document-rest-API.md seção 4.
    return _erro_envelope(422, "erro_validacao", "Requisição inválida: " + str(exc.errors()))


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and "erro" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return _erro_envelope(exc.status_code, "erro_http", str(exc.detail))


origins_str = os.getenv("CORS_ORIGINS", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins_str.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"] ,
)

app.include_router(inventarios.router, prefix="/api/v1/inventarios", tags=["inventarios"])


@app.get("/api/v1/health")
def health_check():
    return {"status": "ok"}

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY . .

# Usuário não-root: boa prática de produção, não muda comportamento da
# aplicação (não requer escrita em /app em runtime).
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Healthcheck usando apenas a stdlib (urllib) para evitar instalar curl
# só para isso — reaproveita o endpoint GET /api/v1/health já existente
# em app/main.py.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/api/v1/health', timeout=3)" || exit 1

# Número de workers não está definido em docs/docker-compose.md — não
# inventamos um valor aqui. Se/quando isso for decidido, ajustar o CMD
# abaixo (ex.: --workers N) ou introduzir gunicorn+uvicorn workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

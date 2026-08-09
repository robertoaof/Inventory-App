#!/bin/sh
# Roda dentro do serviço `backup` (docker-compose.prod.yml), usando a
# imagem postgres:16 (tem pg_dump). POSTGRES_USER/POSTGRES_PASSWORD/
# POSTGRES_DB já chegam como variáveis de ambiente via env_file (.env).
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-7}"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
ARQUIVO="$BACKUP_DIR/invcontra_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

export PGPASSWORD="$POSTGRES_PASSWORD"
pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$ARQUIVO"
echo "Backup salvo em $ARQUIVO"

# Retenção: apaga backups mais antigos que RETENCAO_DIAS dias.
find "$BACKUP_DIR" -name 'invcontra_*.sql.gz' -mtime "+${RETENCAO_DIAS}" -delete

# Para restaurar um backup:
#   docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" # confirma que o banco está de pé
#   gunzip -c /caminho/para/invcontra_AAAA-MM-DD_HHMMSS.sql.gz | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

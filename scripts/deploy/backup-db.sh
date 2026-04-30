#!/bin/sh
# Script de backup manual/automatico do PostgreSQL
# Uso: ./scripts/deploy/backup-db.sh
# Cron: 0 2 * * * /opt/quayer/scripts/deploy/backup-db.sh >> /var/log/quayer-backup.log 2>&1

set -e

APP_DIR="/opt/quayer"
BACKUP_DIR="$APP_DIR/backups"
RETENTION_DAYS=7

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERRO: .env nao encontrado"
  exit 1
fi

DB_USER=$(grep '^DB_USER=' .env | cut -d= -f2 | tr -d '"')
DB_NAME=$(grep '^DB_NAME=' .env | cut -d= -f2 | tr -d '"')
DB_USER=${DB_USER:-quayer}
DB_NAME=${DB_NAME:-quayer}

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/scheduled-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "$(date): Iniciando backup de $DB_NAME..."

if ! docker inspect quayer-postgres > /dev/null 2>&1; then
  echo "$(date): ERRO - quayer-postgres nao esta rodando"
  exit 1
fi

docker exec quayer-postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "$(date): Backup criado: $BACKUP_FILE ($(du -sh $BACKUP_FILE | cut -f1))"

# Remover backups mais antigos que RETENTION_DAYS dias
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "$(date): Backups antigos removidos (retencao: ${RETENTION_DAYS} dias)"

TOTAL=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
echo "$(date): Total de backups mantidos: $TOTAL"

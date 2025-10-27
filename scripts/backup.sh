#!/bin/bash

# ===========================================
# 💾 QUAYER - BACKUP SCRIPT
# ===========================================
# Backup do banco de dados PostgreSQL
# Uso: ./scripts/backup.sh [output_dir]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

OUTPUT_DIR=${1:-./backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="quayer_backup_$TIMESTAMP.sql"

echo "=========================================="
echo "💾 QUAYER - DATABASE BACKUP"
echo "=========================================="
echo ""

# Create backup directory
if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    echo -e "${GREEN}✅ Created backup directory: $OUTPUT_DIR${NC}"
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo -e "${RED}❌ Docker não está rodando!${NC}"
    exit 1
fi

# Check if PostgreSQL container is running
CONTAINER_NAME="quayer-postgres"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep postgres | head -n 1)
    if [ -z "$CONTAINER_NAME" ]; then
        echo -e "${RED}❌ PostgreSQL container não encontrado!${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}📦 Container: $CONTAINER_NAME${NC}"
echo -e "${BLUE}📁 Output: $OUTPUT_DIR/$BACKUP_FILE${NC}"
echo ""

# Create backup
echo -e "${BLUE}💾 Creating backup...${NC}"

docker exec "$CONTAINER_NAME" pg_dump -U "${DB_USER:-docker}" "${DB_NAME:-docker}" > "$OUTPUT_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    # Compress backup
    echo -e "${BLUE}🗜️  Compressing backup...${NC}"
    gzip "$OUTPUT_DIR/$BACKUP_FILE"

    COMPRESSED_FILE="$OUTPUT_DIR/${BACKUP_FILE}.gz"
    FILE_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)

    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo ""
    echo "File: $COMPRESSED_FILE"
    echo "Size: $FILE_SIZE"
    echo ""

    # List recent backups
    echo "📋 Recent backups:"
    ls -lh "$OUTPUT_DIR" | grep quayer_backup | tail -n 5

    echo ""

    # Cleanup old backups (keep last 7 days)
    echo -e "${BLUE}🧹 Cleaning old backups (keeping last 7 days)...${NC}"
    find "$OUTPUT_DIR" -name "quayer_backup_*.sql.gz" -mtime +7 -delete
    echo -e "${GREEN}✅ Cleanup completed${NC}"

else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo "💾 BACKUP INFO"
echo "=========================================="
echo ""
echo "Timestamp: $TIMESTAMP"
echo "Database: ${DB_NAME:-docker}"
echo "File: $COMPRESSED_FILE"
echo "Size: $FILE_SIZE"
echo ""
echo "To restore:"
echo "  gunzip $COMPRESSED_FILE"
echo "  docker exec -i $CONTAINER_NAME psql -U ${DB_USER:-docker} ${DB_NAME:-docker} < $OUTPUT_DIR/$BACKUP_FILE"
echo ""
echo "=========================================="

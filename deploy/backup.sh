#!/usr/bin/env bash
# Günlük yedek: veritabanı (pg_dump, sıkıştırılmış) + yüklenen dosyalar. 14 gün saklanır.
# Cron örneği (her gece 03:15):  15 3 * * * /opt/esnaf-tedarik/deploy/backup.sh >> /var/log/esnaf-backup.log 2>&1
# Yedekleri sunucu dışına da kopyalayın (ör. rclone ile nesne depolamaya).
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/esnaf-tedarik}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -n "${DATABASE_URL:-}" ]; then
  # Doğrudan bağlantı (docker kullanılmayan kurulum)
  pg_dump --format=custom --no-owner "${DATABASE_URL%%\?*}" > "$BACKUP_DIR/db-$STAMP.dump.tmp"
else
  docker compose exec -T db pg_dump -U esnaf --format=custom --no-owner esnaf_tedarik > "$BACKUP_DIR/db-$STAMP.dump.tmp"
fi
mv "$BACKUP_DIR/db-$STAMP.dump.tmp" "$BACKUP_DIR/db-$STAMP.dump"  # yarım kalan döküm yedek sayılmaz

if [ -n "${UPLOAD_DIR:-}" ] && [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$UPLOAD_DIR" .
else
  docker compose run --rm --no-deps -T -v "$BACKUP_DIR:/backup" app tar -czf "/backup/uploads-$STAMP.tar.gz" -C /data/uploads .
fi

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) yedek tamam: $BACKUP_DIR/*-$STAMP.*"
# Geri yükleme: pg_restore --clean --no-owner -d "postgresql://…/esnaf_tedarik" (?schema=… olmadan) db-XXXX.dump  ve  tar -xzf uploads-XXXX.tar.gz -C <UPLOAD_DIR>

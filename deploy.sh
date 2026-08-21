#!/bin/bash
set -e
APP=/var/www/vhosts/movi.digital/lector.movi.digital/app
git config --global --add safe.directory "$APP"
cd $APP
git pull origin main
./venv/bin/pip install -r requirements.txt --quiet
cd web && npm ci --silent && npm run build && cd ..
systemctl restart lector-polizas.service

# Cron de limpieza (idempotente: reemplaza la línea existente por script en
# vez de duplicarla en cada deploy, aunque cambie la hora en el futuro).
CRON_LOTE="0 3 * * * cd $APP && python3 limpiar_lote_entrenamiento.py >> storage/logs/limpieza_lote.log 2>&1"
CRON_PDFS="15 3 * * * cd $APP && python3 limpiar_pdfs_entrenamiento.py >> storage/logs/limpieza_pdfs.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "limpiar_lote_entrenamiento.py" ; echo "$CRON_LOTE" ) | crontab -
( crontab -l 2>/dev/null | grep -vF "limpiar_pdfs_entrenamiento.py" ; echo "$CRON_PDFS" ) | crontab -

echo "Deploy OK: $(date)"

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
#
# limpiar_lote_entrenamiento.py YA NO se agenda aquí (Fase 1 de "PDFs
# Entrenados"): borraba pólizas de polizas_entrenamiento sin importar si
# ya se les había dado "Terminar", por criterio de uso (no de antigüedad)
# ajeno al nuevo flag `entrenado`. El script se deja en el repo como
# herramienta manual a demanda, no como automatismo. La entrada de cron
# que ya exista en el servidor de una corrida anterior de este deploy.sh
# NO se borra sola con este cambio — hay que quitarla a mano una vez (ver
# instrucciones de despliegue).
CRON_PDFS="15 3 * * * cd $APP && python3 limpiar_pdfs_entrenamiento.py >> storage/logs/limpieza_pdfs.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "limpiar_pdfs_entrenamiento.py" ; echo "$CRON_PDFS" ) | crontab -

echo "Deploy OK: $(date)"

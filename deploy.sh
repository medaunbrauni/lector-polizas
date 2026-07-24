#!/bin/bash
set -e
APP=/var/www/vhosts/movi.digital/lector.movi.digital/app
git config --global --add safe.directory "$APP"
cd $APP
git pull origin main
./venv/bin/pip install -r requirements.txt --quiet
cd web && npm ci --silent && npm run build && cd ..
systemctl restart lector-polizas.service
echo "Deploy OK: $(date)"

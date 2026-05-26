@echo off
title Lector de Polizas — Launcher
chcp 65001 >nul 2>&1

echo.
echo ===================================================
echo   Lector de Polizas — Iniciando servidores
echo ===================================================
echo.

REM Verificar que estamos en la carpeta correcta
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] No se encontro el entorno virtual.
    echo Ejecuta este archivo desde la carpeta lector-polizas.
    pause
    exit /b 1
)

REM ---- Iniciar servidores en ventanas separadas ----
echo >> Iniciando API  (FastAPI en :8003)...
start "API - FastAPI :8003" cmd /k "cd /d %~dp0 && venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8003 --reload"

echo >> Iniciando Web  (Vite en :5173)...
start "Web - Vite :5173" cmd /k "cd /d %~dp0\web && npm run dev"

REM ---- Esperar y abrir Chrome ----
echo.
echo Esperando 12 segundos a que los servidores inicien...
timeout /t 4 /nobreak >nul
echo   Paso 1/3...
timeout /t 4 /nobreak >nul
echo   Paso 2/3...
timeout /t 4 /nobreak >nul
echo   Paso 3/3 - Abriendo Chrome...

start chrome "http://localhost:5173"

echo.
echo ===================================================
echo   Servidores corriendo. Cierra esta ventana.
echo   Para detener: cierra las ventanas de API y Web.
echo ===================================================
pause

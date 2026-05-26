"""
Lector de Pólizas — Launcher
Inicia API (FastAPI/uvicorn en :8003) y Web (Vite en :5173),
espera a que ambos respondan y abre Chrome.
"""
import os
import sys
import subprocess
import time
import urllib.request
import urllib.error

# ── Rutas base ────────────────────────────────────────────────────────────────
# Funciona tanto ejecutándose como .py (base = directorio del script)
# como .exe compilado con PyInstaller --onefile (base = directorio del exe).
if getattr(sys, "frozen", False):
    BASE = os.path.dirname(sys.executable)
else:
    BASE = os.path.dirname(os.path.abspath(__file__))

VENV_PYTHON = os.path.join(BASE, "venv", "Scripts", "python.exe")
WEB_DIR     = os.path.join(BASE, "web")

API_URL = "http://127.0.0.1:8003/docs"
WEB_URL = "http://localhost:5173"

POLL_INTERVAL = 1.0   # segundos entre intentos
TIMEOUT       = 90    # segundos máximo de espera por servidor

# ── Helpers ───────────────────────────────────────────────────────────────────
def banner(msg: str):
    print(f"\n{'='*55}\n  {msg}\n{'='*55}")

def poll(url: str, label: str) -> bool:
    """Espera hasta que `url` responda o se agote el timeout."""
    deadline = time.time() + TIMEOUT
    dots = 0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3):
                print(f"\r[OK] {label} listo{' '*20}")
                return True
        except Exception:
            dots = (dots + 1) % 4
            print(f"\r  Esperando {label}{'.'*dots}{' '*(4-dots)}", end="", flush=True)
            time.sleep(POLL_INTERVAL)
    print(f"\r[ERROR] {label} no respondio en {TIMEOUT}s")
    return False

def open_chrome(url: str):
    """Abre Chrome; si no está en PATH intenta rutas típicas de Windows."""
    chrome_paths = [
        "chrome",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for chrome in chrome_paths:
        try:
            subprocess.Popen([chrome, url])
            print(f"[OK] Chrome abierto en {url}")
            return
        except FileNotFoundError:
            continue
    # Fallback: deja que Windows elija el navegador predeterminado
    os.startfile(url)
    print(f"[OK] Navegador predeterminado abierto en {url}")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    banner("Lector de Polizas — Iniciando servidores")

    if not os.path.isfile(VENV_PYTHON):
        print(f"[ERROR] No se encontro el entorno virtual en:\n  {VENV_PYTHON}")
        print("Asegurate de ejecutar este archivo desde la carpeta lector-polizas.")
        input("\nPresiona Enter para cerrar...")
        sys.exit(1)

    # Ventanas de consola separadas para ver logs de cada servidor
    CREATE_NEW_CONSOLE = 0x00000010  # flag de Windows

    print("\n>> Iniciando API  (FastAPI en :8003)...")
    api_proc = subprocess.Popen(
        [VENV_PYTHON, "-m", "uvicorn", "api.main:app",
         "--host", "127.0.0.1", "--port", "8003", "--reload"],
        cwd=BASE,
        creationflags=CREATE_NEW_CONSOLE,
    )

    print(">> Iniciando Web  (Vite en :5173)...")
    web_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=WEB_DIR,
        creationflags=CREATE_NEW_CONSOLE,
        shell=True,
    )

    print("\nEsperando a que los servidores esten listos...\n")

    api_ok = poll(API_URL, "API  (FastAPI :8003)")
    web_ok = poll(WEB_URL, "Web  (Vite   :5173)")

    if api_ok and web_ok:
        banner("Todo listo — Abriendo Chrome")
        open_chrome(WEB_URL)
    else:
        print("\n[ADVERTENCIA] Uno o mas servidores no iniciaron correctamente.")
        print("Revisa las ventanas de consola de cada servidor para ver los errores.")

    print("\nMantén abiertas las ventanas de los servidores.")
    print("Cierra esta ventana para terminar (los servidores seguiran corriendo).")
    input("\nPresiona Enter para cerrar este launcher...")

if __name__ == "__main__":
    main()

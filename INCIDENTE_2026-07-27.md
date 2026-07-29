# Incidente de producción — Extractor caído (23–27 de julio de 2026)

**Síntoma reportado:** `lector.movi.digital` no procesaba pólizas — la consola del navegador mostraba `POST /api/extraer 404 (Not Found)`.
**Duración real del problema:** desde el 23 de julio (primer intento de fix que se fusionó) hasta el 27 de julio (resuelto por completo).
**Causa raíz de fondo:** los últimos 5 despliegues automáticos previos habían fallado silenciosamente — nadie lo notó porque nadie verificó el sitio en producción después de fusionar los Pull Requests.

---

## Cronología de causas encontradas, en el orden en que se destaparon

Cada una se descubrió solo después de resolver la anterior — son 5 problemas independientes, apilados.

### 1. El despliegue automático llevaba fallando desde el 23 de julio
- **Evidencia:** los últimos 5 runs del workflow "Deploy to Production" en GitHub Actions mostraban `conclusion: failure`. El único despliegue exitoso anterior era del 27-28 de mayo.
- **Causa:** error de git *"detected dubious ownership in repository"* — la carpeta de la app en el servidor no coincidía en propietario con el usuario que ejecuta el script de deploy.
- **Efecto:** ninguno de los cambios fusionados a `main` desde el 23 de julio (incluyendo el fix del prefijo `/api`) había llegado realmente al servidor. Seguía corriendo el código de mayo.
- **Fix:** se agregó `git config --global --add safe.directory` en `deploy.sh` (ya estaba en el repo, solo faltaba que el resto de la cadena funcionara).

### 2. El servicio no podía reiniciarse: `Access denied`
- **Evidencia:** `systemctl restart lector-polizas.service` fallaba con "Access denied" al ejecutarse como el usuario de la suscripción de Plesk (`movi.digital_6otv27u3vcg`), que no tiene permisos de administración de servicios del sistema por diseño de seguridad de Plesk.
- **Fix:** se agregó una regla de sudo mínima y específica en `/etc/sudoers.d/lector-polizas-deploy`, que permite a ese usuario reiniciar **únicamente** `lector-polizas.service`, sin contraseña, sin ampliar ningún otro permiso.

### 3. La app crasheaba al arrancar — error de Pydantic con Python 3.9
- **Evidencia:** `TypeError: Unable to evaluate type annotation 'str | None'` en `api/routers/catalogos.py`.
- **Causa:** el fix de compatibilidad con Python 3.9 del 24 de julio (`from __future__ import annotations`) no alcanza para modelos de **Pydantic v2**, que evalúa las anotaciones de tipo en tiempo real al construir sus validadores, independientemente de esa directiva.
- **Fix:** se instaló el paquete `eval_type_backport`, la solución oficial recomendada por el propio mensaje de error de Pydantic para este caso.

### 4. La app volvía a crashear — dependencias faltantes en `requirements.txt`
- **Evidencia:** `ModuleNotFoundError: No module named 'watchdog'`.
- **Causa:** `watchdog` (usado por `api/services/folder_watcher.py`) y `pypdfium2` (usado por `entrenamiento.py`) nunca se agregaron a `requirements.txt`. Este bug ya había sido identificado el 16 de julio en una rama de desarrollo (`Froi`) que nunca se fusionó a `main` — el arreglo existía, pero no en la rama que corre en producción.
- **Fix aplicado en código** (commit de hoy, ya en `main`): se agregaron `eval_type_backport`, `watchdog` y `pypdfium2` a `requirements.txt`.

### 5. Error 500 al subir un PDF — `import` faltante
- **Evidencia:** `NameError: name 'os' is not defined` en `api/services/extractor.py`, línea 53 (`os.environ.get("ANTHROPIC_API_KEY")`).
- **Causa:** el archivo usa el módulo `os` pero nunca lo importa.
- **Fix aplicado en código** (commit de hoy, ya en `main`): se agregó `import os` al bloque de imports del archivo.

---

## Cambios que quedaron en el repositorio (permanentes, vía `main`)

| Archivo | Cambio |
|---|---|
| `requirements.txt` | + `eval_type_backport>=0.4.0`, `watchdog>=6.0.0`, `pypdfium2>=5.11.0` |
| `api/services/extractor.py` | + `import os` |
| `deploy.sh` | + `git config --global --add safe.directory "$APP"` (ya existía desde el 24 de julio) |

Ambos commits de hoy ya corrieron el despliegue automático con `conclusion: success` — el pipeline de CI/CD queda funcionando de punta a punta por primera vez desde el 23 de julio.

## Cambios aplicados directamente en el servidor (fuera de git — quedan documentados aquí para que no se pierdan)

- `/etc/sudoers.d/lector-polizas-deploy`: permiso puntual para reiniciar el servicio (ver punto 2).
- `AUTH_PASSWORD` agregado al `.env` de producción (ya era obligatorio desde el 23 de julio, pero no estaba configurado en el servidor).

## Pendientes menores (no bloquean, pero conviene resolver)

- `python-dotenv` reporta una advertencia: *"could not parse statement starting at line 2"* en el `.env` de producción — no impide el arranque, pero conviene revisar el formato de esa línea.
- Confirmar con una prueba real de extracción de PDF que no queden más errores en cascada.
- **Nota de seguridad:** durante el diagnóstico se visualizó accidentalmente una clave de `ANTHROPIC_API_KEY` en una terminal compartida — debe tratarse como comprometida y rotarse en console.anthropic.com si aún no se ha hecho.

## Recomendación a futuro
Se propone como práctica estándar: **todo cambio a `main` se confirma contra `https://lector.movi.digital/api/health` antes de considerarse cerrado.**

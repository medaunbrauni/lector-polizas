"""
Genera api/data/catalogo_cp.json a partir del TXT plano del Catálogo
Nacional de Códigos Postales de Correos de México (SEPOMEX) — se corre
una sola vez (o cuando Correos de México publique una versión nueva del
catálogo), no en cada extracción.

Uso:
    python scripts/build_catalogo_cp.py "C:\\ruta\\a\\CPdescarga.txt"

Formato de entrada (pipe-delimited, latin-1, con 2 líneas de encabezado
antes de los datos):
    d_codigo|d_asenta|d_tipo_asenta|D_mnpio|d_estado|d_ciudad|d_CP|...

Se indexa por C.P. (d_codigo) para lookup O(1) en tiempo de extracción,
en vez de reparsear el TXT (15+ MB) por cada PDF. Un mismo C.P. agrupa
varias colonias, pero prácticamente siempre un solo Municipio/Estado —
se valida ese supuesto y se avisa si algún C.P. lo rompe.
"""
import json
import sys
from collections import OrderedDict
from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / "api" / "data" / "catalogo_cp.json"


def construir(ruta_txt: str) -> dict:
    catalogo: dict[str, dict] = OrderedDict()
    inconsistencias = 0

    with open(ruta_txt, encoding="latin-1") as f:
        next(f)  # aviso legal
        next(f)  # encabezado de columnas
        for linea in f:
            partes = linea.rstrip("\r\n").split("|")
            if len(partes) < 5:
                continue
            cp, colonia, _tipo, municipio, estado = partes[0], partes[1], partes[2], partes[3], partes[4]
            if not cp or not colonia:
                continue

            entrada = catalogo.get(cp)
            if entrada is None:
                catalogo[cp] = {"municipio": municipio, "estado": estado, "colonias": [colonia]}
                continue

            if entrada["municipio"] != municipio or entrada["estado"] != estado:
                inconsistencias += 1
            if colonia not in entrada["colonias"]:
                entrada["colonias"].append(colonia)

    if inconsistencias:
        print(f"Aviso: {inconsistencias} filas con Municipio/Estado distinto al ya "
              f"registrado para su mismo C.P. (se conservó el primero visto).",
              file=sys.stderr)
    return catalogo


def main():
    if len(sys.argv) != 2:
        print(f"Uso: python {sys.argv[0]} <ruta_al_CPdescarga.txt>", file=sys.stderr)
        sys.exit(1)

    catalogo = construir(sys.argv[1])
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(catalogo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(catalogo)} códigos postales -> {SALIDA} ({SALIDA.stat().st_size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    main()

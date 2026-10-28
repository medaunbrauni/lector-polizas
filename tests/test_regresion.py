"""Pruebas de regresión (unittest, sin dependencias nuevas): python -m unittest discover tests"""
import os
import tempfile
import unittest
from types import SimpleNamespace

_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_dir}/t.db"
os.environ["STORAGE_PATH"] = _dir

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api.database import SessionLocal, init_db  # noqa: E402
from api.extractores_especializados.ana import extraer_vigencia  # noqa: E402
from api.models.db_models import (  # noqa: E402
    Compania, Ramo, Subramo, ReglaExtraccion, CampoExtraido, Extraccion, PolizaEntrenamiento, UsoIA,
)
from api.routers import entrenamiento, metricas  # noqa: E402
from api.services.ai_utils import ClienteMedido, parse_claude_json  # noqa: E402
from api.services.batch_trainer import cobertura_lote, probar_regex_en_lote  # noqa: E402


class Puros(unittest.TestCase):
    def test_vigencia_ana(self):
        r = extraer_vigencia("x\nD10 M03 A2026 D10 M03 A2026 D10 M03 A2027\ny")
        self.assertEqual(r, {"desde": "10/MAR/2026", "hasta": "10/MAR/2027"})
        self.assertEqual(extraer_vigencia("sin fechas"), {})

    def test_regex_exige_el_valor_correcto(self):
        ps = [SimpleNamespace(id=1, nombre_archivo="a", texto_pdf="Poliza: 123"),
              SimpleNamespace(id=2, nombre_archivo="b", texto_pdf="Poliza: 999")]
        m = probar_regex_en_lote(r"Poliza:\s*(\d+)", ps, {1: "123", 2: "000"})
        self.assertEqual([x["coincide"] for x in m], [True, False])
        self.assertEqual(cobertura_lote(m), 1)

    def test_parse_json_con_fences(self):
        self.assertEqual(parse_claude_json('```json\n{"a": 1}\n```'), {"a": 1})


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        app = FastAPI()
        app.include_router(entrenamiento.router)
        app.include_router(metricas.router)
        cls.c = TestClient(app)
        with SessionLocal() as db:
            co = Compania(nombre="Test"); db.add(co); db.flush()
            ra = Ramo(nombre="Autos", compania_id=co.id); db.add(ra); db.flush()
            sub = Subramo(nombre="Individual", ramo_id=ra.id); db.add(sub); db.flush()
            cls.sub = sub.id
            r1 = ReglaExtraccion(subramo_id=sub.id, nombre_campo="rfc", patron_regex="a", activo=False)
            r2 = ReglaExtraccion(subramo_id=sub.id, nombre_campo="rfc", patron_regex="b", activo=True)
            db.add_all([r1, r2]); db.flush()
            cls.vieja, cls.activa = r1.id, r2.id
            ex = Extraccion(nombre_archivo="x.pdf", exitoso=True); db.add(ex); db.flush()
            for m in ("regla", "regla", "no_encontrado"):
                db.add(CampoExtraido(extraccion_id=ex.id, nombre_campo="rfc", metodo=m, regla_id=r2.id))
            db.commit()

    def test_restaurar_deja_una_sola_activa(self):
        self.assertTrue(self.c.post(f"/entrenamiento/reglas-lote/{self.vieja}/restaurar").json()["ok"])
        with SessionLocal() as db:
            act = [r.id for r in db.query(ReglaExtraccion).filter_by(subramo_id=self.sub, nombre_campo="rfc", activo=True)]
        self.assertEqual(act, [self.vieja])

    def test_metricas_reglas_produccion(self):
        filas = self.c.get("/metricas/reglas?minimo=3").json()
        self.assertEqual((filas[0]["aciertos"], filas[0]["intentos"]), (2, 3))

    def test_uso_ia_se_registra(self):
        class Fake:
            class messages:
                @staticmethod
                def create(**kw):
                    return SimpleNamespace(usage=SimpleNamespace(input_tokens=10, output_tokens=5))
        ClienteMedido(Fake, "prueba").messages.create(model="m")
        fila = [f for f in self.c.get("/metricas/ia").json() if f["origen"] == "prueba"][0]
        self.assertEqual((fila["llamadas"], fila["tokens_in"], fila["tokens_out"]), (1, 10, 5))

    def test_duplicados_protege_trabajo_del_usuario(self):
        with SessionLocal() as db:
            for i, ent in enumerate((True, False, False)):
                db.add(PolizaEntrenamiento(subramo_id=self.sub, nombre_archivo=f"d{i}", ruta_archivo="/no/existe",
                                           texto_pdf="mismo", sha256="h", entrenado=ent))
            db.commit()
        r = self.c.post(f"/entrenamiento/subramos/{self.sub}/limpiar-duplicados").json()
        self.assertEqual(r, {"borradas": 1, "requieren_revision": 1})


if __name__ == "__main__":
    unittest.main()

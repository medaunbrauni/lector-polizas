import { useEffect, useState } from 'react';
import { BarChart3, Cpu } from 'lucide-react';
import { getMetricasIA, getMetricasReglas } from '../lib/api';
import type { UsoIAFila, ReglaProduccion } from '../lib/api';
import { SkeletonFilas } from '../components/ui/Skeleton';
import EstadoVacio from '../components/ui/EstadoVacio';

const DIAS = [7, 30, 90];
const fmt = (n: number) => n.toLocaleString('es-MX');

function Seccion({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{titulo}</h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{nota}</p>
      </div>
      {children}
    </section>
  );
}

const TH = 'text-left text-[10px] font-semibold uppercase text-[var(--color-text-secondary)] pb-1 pr-4';
const TD = 'py-1.5 pr-4 border-t border-[var(--color-border)]';

export default function Metricas() {
  const [dias, setDias] = useState(30);
  const [ia, setIa] = useState<UsoIAFila[] | null>(null);
  const [reglas, setReglas] = useState<ReglaProduccion[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setIa(null);
    getMetricasIA(dias).then(setIa).catch(() => setError(true));
  }, [dias]);
  useEffect(() => { getMetricasReglas().then(setReglas).catch(() => setError(true)); }, []);

  const totIn = ia?.reduce((a, f) => a + f.tokens_in, 0) ?? 0;
  const totOut = ia?.reduce((a, f) => a + f.tokens_out, 0) ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-[1100px] mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Métricas</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Gasto de IA y desempeño real de las reglas en producción.</p>
      </div>
      {error && <p className="text-xs text-red-500">No se pudieron cargar algunas métricas.</p>}

      <Seccion titulo="Gasto de IA" nota="Llamadas y tokens a la API de Anthropic por origen y modelo (no incluye dólares: solo consumo).">
        <div className="flex gap-1.5">
          {DIAS.map((d) => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border border-[var(--color-border)] ${dias === d ? 'bg-[var(--color-brand-blue)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'}`}>
              {d} días
            </button>
          ))}
        </div>
        {!ia ? <SkeletonFilas filas={3} alto="h-8" /> : ia.length === 0 ? (
          <EstadoVacio icono={Cpu} texto="Sin llamadas a la IA en este periodo." className="py-6" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-[var(--color-text-primary)]">
              <thead><tr><th className={TH}>Origen</th><th className={TH}>Modelo</th><th className={TH}>Llamadas</th><th className={TH}>Tokens entrada</th><th className={TH}>Tokens salida</th></tr></thead>
              <tbody>
                {ia.map((f) => (
                  <tr key={`${f.origen}-${f.modelo}`}>
                    <td className={TD}>{f.origen}</td><td className={`${TD} font-mono`}>{f.modelo}</td>
                    <td className={TD}>{fmt(f.llamadas)}</td><td className={TD}>{fmt(f.tokens_in)}</td><td className={TD}>{fmt(f.tokens_out)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={TD} colSpan={3}>Total</td><td className={TD}>{fmt(totIn)}</td><td className={TD}>{fmt(totOut)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Reglas en producción" nota="Reglas activas con al menos 5 usos reales, de la que más falla a la que menos. Las del tope son las que conviene reentrenar.">
        {!reglas ? <SkeletonFilas filas={4} alto="h-8" /> : reglas.length === 0 ? (
          <EstadoVacio icono={BarChart3} texto="Aún no hay reglas con suficientes usos reales." className="py-6" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-[var(--color-text-primary)]">
              <thead><tr><th className={TH}>Subramo</th><th className={TH}>Campo</th><th className={TH}>Aciertos</th><th className={TH}>Tasa</th></tr></thead>
              <tbody>
                {reglas.map((r) => (
                  <tr key={r.regla_id}>
                    <td className={TD}>{r.subramo}</td><td className={`${TD} font-mono`}>{r.campo}</td>
                    <td className={TD}>{r.aciertos}/{r.intentos}</td>
                    <td className={`${TD} font-semibold ${r.tasa < 0.7 ? 'text-red-500' : r.tasa < 0.9 ? 'text-amber-500' : 'text-emerald-500'}`}>{Math.round(r.tasa * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

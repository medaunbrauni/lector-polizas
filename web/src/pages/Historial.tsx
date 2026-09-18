import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHistorial } from '../lib/api';
import { CheckCircle2, AlertCircle, Cpu, Zap, Eye, FileX } from 'lucide-react';

const POR_PAGINA = 50;

export default function Historial() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(0); // 0-indexed

  useEffect(() => {
    setLoading(true);
    getHistorial(pagina * POR_PAGINA, POR_PAGINA).then((d) => {
      setItems(d.items || []);
      setTotal(d.total || 0);
    }).finally(() => setLoading(false));
  }, [pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : pagina * POR_PAGINA + 1;
  const hasta = Math.min(total, (pagina + 1) * POR_PAGINA);

  function linkVerReentrenar(item: any) {
    if (!item.compania_id || !item.ramo_id || !item.subramo_id) return null;
    const params = new URLSearchParams({
      companiaId: String(item.compania_id),
      ramoId: String(item.ramo_id),
      subramoId: String(item.subramo_id),
    });
    if (item.poliza_entrenamiento_id && item.archivo_disponible) {
      params.set('polizaId', String(item.poliza_entrenamiento_id));
    }
    return `/reglas?${params.toString()}`;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Historial de Extracciones</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{total} PDFs procesados en total</p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-[var(--color-text-secondary)]">
          <p className="text-sm">Aún no hay extracciones. Sube un PDF para comenzar.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
                {['Archivo', 'Compañía', 'Ramo', 'Subramo', 'Regla', 'IA', 'No enc.', 'Estado', 'Fecha', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--color-bg-secondary)]">
                  <td className="px-3 py-2.5 text-xs font-medium text-[var(--color-text-primary)] max-w-[160px] truncate">{item.archivo}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">{item.compania || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">{item.ramo || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">{item.subramo || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success-text)] font-medium">
                      <Zap className="w-3 h-3" />{item.campos_por_regla}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-info-text)] font-medium">
                      <Cpu className="w-3 h-3" />{item.campos_por_ia}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">{item.campos_no_encontrados}</td>
                  <td className="px-3 py-2.5">
                    {item.exitoso
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium"><CheckCircle2 className="w-3 h-3" />OK</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium"><AlertCircle className="w-3 h-3" />Error</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                    {item.created_at ? new Date(item.created_at).toLocaleString('es-MX') : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {linkVerReentrenar(item) ? (
                      <Link
                        to={linkVerReentrenar(item)!}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-brand-blue)] hover:opacity-80 hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
                        title={item.archivo_disponible ? 'Ver / Reentrenar' : 'El PDF ya no está disponible, pero puedes revisar los datos'}
                      >
                        {item.poliza_entrenamiento_id && item.archivo_disponible
                          ? <Eye className="w-3.5 h-3.5" />
                          : <FileX className="w-3.5 h-3.5" />}
                        Ver/Reentrenar
                      </Link>
                    ) : (
                      <span className="text-xs text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginación */}
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {desde}–{hasta} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg disabled:opacity-40 hover:bg-[var(--color-bg-secondary)] transition-colors"
              >Anterior</button>
              <span className="text-xs text-[var(--color-text-secondary)]">Página {pagina + 1} de {totalPaginas}</span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg disabled:opacity-40 hover:bg-[var(--color-bg-secondary)] transition-colors"
              >Siguiente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

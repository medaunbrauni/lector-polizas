import { useEffect, useState } from 'react';
import { getCompanias, getRamos, getSubramos, getReglas, getCampos, crearRegla, probarRegla } from '../lib/api';
import type { Compania, Ramo, Subramo, Regla, Campo } from '../lib/types';
import { Zap, Plus, CheckCircle2, XCircle } from 'lucide-react';

export default function Reglas() {
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [subramos, setSubramos] = useState<Subramo[]>([]);
  const [campos, setCampos] = useState<Campo[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);

  const [selCompania, setSelCompania] = useState('');
  const [selRamo, setSelRamo] = useState('');
  const [selSubramo, setSelSubramo] = useState('');

  // Formulario nueva regla
  const [form, setForm] = useState({ nombre_campo: '', patron_regex: '', contexto_antes: '', contexto_despues: '' });
  const [testTexto, setTestTexto] = useState('');
  const [testResult, setTestResult] = useState<{ coincidencia: string | null; encontrado: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { getCompanias().then(setCompanias); }, []);

  useEffect(() => {
    if (selCompania) getRamos(Number(selCompania)).then(setRamos);
    setSelRamo(''); setSelSubramo('');
  }, [selCompania]);

  useEffect(() => {
    if (selRamo) getSubramos(Number(selRamo)).then(setSubramos);
    setSelSubramo('');
  }, [selRamo]);

  useEffect(() => {
    if (selSubramo) {
      getCampos(Number(selSubramo)).then(setCampos);
      getReglas(Number(selSubramo)).then(setReglas);
    }
  }, [selSubramo]);

  async function handleProbar() {
    if (!form.patron_regex || !testTexto) return;
    const r = await probarRegla(form.patron_regex, testTexto);
    setTestResult(r);
  }

  async function handleGuardar() {
    if (!selSubramo || !form.nombre_campo || !form.patron_regex) return;
    setGuardando(true);
    try {
      await crearRegla({ subramo_id: Number(selSubramo), ...form });
      getReglas(Number(selSubramo)).then(setReglas);
      setForm({ nombre_campo: '', patron_regex: '', contexto_antes: '', contexto_despues: '' });
      setTestResult(null);
    } finally {
      setGuardando(false);
    }
  }

  const camposConRegla = new Set(reglas.map(r => r.nombre_campo));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Reglas de Extracción</h1>
        <p className="text-sm text-gray-500 mt-1">Define patrones regex por Compañía · Ramo · Subramo · Campo</p>
      </div>

      {/* Selector de módulo */}
      <div className="flex gap-3">
        {[
          { label: 'Compañía', value: selCompania, onChange: setSelCompania, options: companias.map(c => ({ id: c.id, nombre: c.nombre })) },
          { label: 'Ramo', value: selRamo, onChange: setSelRamo, options: ramos.map(r => ({ id: r.id, nombre: r.nombre })) },
          { label: 'Subramo', value: selSubramo, onChange: setSelSubramo, options: subramos.map(s => ({ id: s.id, nombre: (s as any).nombre })) },
        ].map(({ label, value, onChange, options }) => (
          <select
            key={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{label}…</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        ))}
      </div>

      {selSubramo && (
        <div className="grid grid-cols-2 gap-6">
          {/* Campos y cobertura */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Campos del módulo</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {campos.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-gray-800">{c.label}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{c.nombre}</p>
                  </div>
                  {camposConRegla.has(c.nombre)
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium"><CheckCircle2 className="w-3 h-3" />Con regla</span>
                    : <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full text-[10px]">Sin regla</span>
                  }
                </li>
              ))}
            </ul>
          </div>

          {/* Constructor de regla */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <Plus className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700">Nueva regla</h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Campo</label>
                <select
                  value={form.nombre_campo}
                  onChange={(e) => setForm(f => ({ ...f, nombre_campo: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar campo…</option>
                  {campos.map(c => <option key={c.id} value={c.nombre}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Patrón Regex</label>
                <input
                  value={form.patron_regex}
                  onChange={(e) => setForm(f => ({ ...f, patron_regex: e.target.value }))}
                  placeholder="ej. N[uú]mero de P[oó]liza[:\s]+([A-Z0-9\-]+)"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Texto de prueba</label>
                <textarea
                  value={testTexto}
                  onChange={(e) => setTestTexto(e.target.value)}
                  rows={3}
                  placeholder="Pega aquí un fragmento del PDF para probar el patrón…"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  testResult.encontrado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {testResult.encontrado
                    ? <><CheckCircle2 className="w-4 h-4" /> Encontrado: <strong>{testResult.coincidencia}</strong></>
                    : <><XCircle className="w-4 h-4" /> Sin coincidencia</>
                  }
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleProbar}
                  disabled={!form.patron_regex || !testTexto}
                  className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  Probar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={guardando || !form.nombre_campo || !form.patron_regex}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {guardando ? 'Guardando…' : 'Guardar regla'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!selSubramo && (
        <div className="text-center py-20 text-gray-400">
          <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona Compañía → Ramo → Subramo para ver y crear reglas</p>
        </div>
      )}
    </div>
  );
}

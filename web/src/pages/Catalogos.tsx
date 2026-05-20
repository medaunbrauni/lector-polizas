import { useEffect, useRef, useState } from 'react';
import { getCompanias, getRamos, getSubramos, patchAlias } from '../lib/api';
import type { Compania, Ramo, Subramo } from '../lib/types';
import { ChevronRight, Building2, Tag, Layers, Pencil, Check, X, ArrowRight } from 'lucide-react';

function PrioridadBadge({ prioridad }: { prioridad: number | null }) {
  if (!prioridad) return null;
  const cls =
    prioridad <= 3 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    prioridad <= 10 ? 'bg-blue-100 text-blue-700 border-blue-200' :
    prioridad <= 20 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
    'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${cls}`}>
      P{prioridad}
    </span>
  );
}

function AliasEditor({
  id, nivel, nombreActual, aliasActual,
  onSaved,
}: {
  id: number;
  nivel: 'companias' | 'ramos' | 'subramos';
  nombreActual: string;
  aliasActual: string | null;
  onSaved: (nuevoAlias: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(aliasActual ?? '');
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function abrir() {
    setValor(aliasActual ?? '');
    setEditando(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  async function guardar() {
    setGuardando(true);
    try {
      await patchAlias(nivel, id, valor.trim() || null);
      onSaved(valor.trim() || null);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  function cancelar() {
    setEditando(false);
    setValor(aliasActual ?? '');
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1 mt-1">
        <input
          ref={inputRef}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar(); }}
          placeholder={`Nombre exportación (default: ${nombreActual})`}
          className="flex-1 text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={guardar} disabled={guardando} className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-40">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={cancelar} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-0.5">
      {aliasActual ? (
        <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium">
          <ArrowRight className="w-3 h-3" />
          <span className="font-mono">{aliasActual}</span>
        </span>
      ) : (
        <span className="text-[10px] text-gray-300">sin alias</span>
      )}
      <button onClick={abrir} className="ml-1 p-0.5 text-gray-300 hover:text-gray-500 transition-colors">
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function Catalogos() {
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [subramos, setSubramos] = useState<Subramo[]>([]);
  const [selCompania, setSelCompania] = useState<number | null>(null);
  const [selRamo, setSelRamo] = useState<number | null>(null);

  useEffect(() => { getCompanias().then(setCompanias); }, []);

  useEffect(() => {
    if (selCompania) getRamos(selCompania).then(setRamos);
    else setRamos([]);
    setSelRamo(null);
    setSubramos([]);
  }, [selCompania]);

  useEffect(() => {
    if (selRamo) getSubramos(selRamo).then(setSubramos);
    else setSubramos([]);
  }, [selRamo]);

  const compSelObj = companias.find((c) => c.id === selCompania);

  function updateCompAlias(id: number, alias: string | null) {
    setCompanias((prev) => prev.map((c) => c.id === id ? { ...c, nombre_exportacion: alias } : c));
  }
  function updateRamoAlias(id: number, alias: string | null) {
    setRamos((prev) => prev.map((r) => r.id === id ? { ...r, nombre_exportacion: alias } : r));
  }
  function updateSubramoAlias(id: number, alias: string | null) {
    setSubramos((prev) => prev.map((s) => s.id === id ? { ...s, nombre_exportacion: alias } : s));
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Catálogos</h1>
        <p className="text-sm text-gray-500 mt-1">Compañías · Ramos · Subramos — Click en <Pencil className="w-3 h-3 inline" /> para configurar nombre de exportación</p>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="font-medium">Prioridad:</span>
          {[
            { label: 'P1–P3 Alta', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
            { label: 'P4–P10 Media', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
            { label: 'P11–P20 Normal', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
            { label: 'P21+ Baja', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
          ].map(({ label, cls }) => (
            <span key={label} className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>{label}</span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-indigo-600 border border-indigo-200 rounded px-2 py-0.5">
          <ArrowRight className="w-3 h-3" />
          Nombre de exportación a mesa de control
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* Compañías */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Building2 className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Compañías ({companias.length})</h2>
          </div>
          <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
            {companias.map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                <button
                  onClick={() => setSelCompania(selCompania === c.id ? null : c.id)}
                  className={`w-full flex items-center justify-between text-sm text-left transition-colors rounded px-1 -mx-1 ${
                    selCompania === c.id ? 'text-blue-700 font-medium' : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PrioridadBadge prioridad={c.prioridad} />
                    <span className="truncate">{c.nombre}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {c.porcentaje_docs != null && (
                      <span className="text-[10px] text-gray-400">{(c.porcentaje_docs * 100).toFixed(1)}%</span>
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${selCompania === c.id ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                <AliasEditor
                  id={c.id} nivel="companias"
                  nombreActual={c.nombre} aliasActual={c.nombre_exportacion}
                  onSaved={(a) => updateCompAlias(c.id, a)}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Ramos */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Tag className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              {selCompania ? `Ramos de ${compSelObj?.nombre ?? ''} (${ramos.length})` : 'Ramos'}
            </h2>
          </div>
          {!selCompania ? (
            <p className="px-4 py-8 text-xs text-gray-400 text-center">Selecciona una compañía</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {ramos.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <button
                    onClick={() => setSelRamo(selRamo === r.id ? null : r.id)}
                    className={`w-full flex items-center justify-between text-sm text-left transition-colors rounded px-1 -mx-1 ${
                      selRamo === r.id ? 'text-blue-700 font-medium' : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    <span>{r.nombre}</span>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${selRamo === r.id ? 'rotate-90' : ''}`} />
                  </button>
                  <AliasEditor
                    id={r.id} nivel="ramos"
                    nombreActual={r.nombre} aliasActual={r.nombre_exportacion}
                    onSaved={(a) => updateRamoAlias(r.id, a)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Subramos */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Layers className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              {selRamo ? `Subramos (${subramos.length})` : 'Subramos'}
            </h2>
          </div>
          {!selRamo ? (
            <p className="px-4 py-8 text-xs text-gray-400 text-center">Selecciona un ramo</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {subramos.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <PrioridadBadge prioridad={s.prioridad} />
                      <span className="text-sm text-gray-700 truncate">{s.nombre}</span>
                    </div>
                    <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      s.cobertura.porcentaje === 100 ? 'bg-emerald-100 text-emerald-700' :
                      s.cobertura.porcentaje > 0 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {s.cobertura.porcentaje}% reglas
                    </span>
                  </div>
                  <AliasEditor
                    id={s.id} nivel="subramos"
                    nombreActual={s.nombre} aliasActual={s.nombre_exportacion}
                    onSaved={(a) => updateSubramoAlias(s.id, a)}
                  />
                  {s.porcentaje_docs != null && s.porcentaje_docs > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded-full"
                          style={{ width: `${Math.min(100, s.porcentaje_docs * 100 / 0.4)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {(s.porcentaje_docs * 100).toFixed(2)}% docs
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {s.cobertura.campos_con_regla}/{s.cobertura.total_campos} campos con regla
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

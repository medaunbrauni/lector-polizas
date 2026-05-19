import { useEffect, useState } from 'react';
import { getCompanias, getRamos, getSubramos } from '../lib/api';
import type { Compania, Ramo, Subramo } from '../lib/types';
import { ChevronRight, Building2, Tag, Layers } from 'lucide-react';

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

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Catálogos</h1>
        <p className="text-sm text-gray-500 mt-1">Compañías · Ramos · Subramos · Campos definidos</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Compañías */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Building2 className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Compañías ({companias.length})</h2>
          </div>
          <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {companias.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelCompania(selCompania === c.id ? null : c.id)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                    selCompania === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span>{c.nombre}</span>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${selCompania === c.id ? 'rotate-90' : ''}`} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Ramos */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Tag className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              {selCompania ? `Ramos (${ramos.length})` : 'Ramos'}
            </h2>
          </div>
          {!selCompania ? (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">Selecciona una compañía</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {ramos.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelRamo(selRamo === r.id ? null : r.id)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                      selRamo === r.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span>{r.nombre}</span>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${selRamo === r.id ? 'rotate-90' : ''}`} />
                  </button>
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
            <p className="px-4 py-6 text-xs text-gray-400 text-center">Selecciona un ramo</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {subramos.map((s) => (
                <li key={s.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{s.nombre}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      s.cobertura.porcentaje === 100
                        ? 'bg-emerald-100 text-emerald-700'
                        : s.cobertura.porcentaje > 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.cobertura.porcentaje}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        s.cobertura.porcentaje === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${s.cobertura.porcentaje}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
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

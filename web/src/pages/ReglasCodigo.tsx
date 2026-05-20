import { useEffect, useState } from 'react';
import { getReglasConJerarquia, getCodigoDeteccion } from '../lib/api';
import { Copy, Check, Code2, ChevronDown, ChevronRight, Shield, Search } from 'lucide-react';

interface ReglaConJerarquia {
  id: number;
  compania: string;
  ramo: string;
  subramo: string;
  nombre_campo: string;
  patron_regex: string;
  confianza: number;
  creado_por: string;
  updated_at: string | null;
}

interface SubramoDeteccion {
  id: number;
  nombre: string;
  keywords: string[];
  patrones_deteccion: string[];
}

interface RamoDeteccion {
  id: number;
  nombre: string;
  keywords: string[];
  patrones_deteccion: string[];
  subramos: SubramoDeteccion[];
}

interface CompaniaDeteccion {
  id: number;
  nombre: string;
  keywords: string[];
  patrones_deteccion: string[];
  ramos: RamoDeteccion[];
}

type Agrupado = Record<string, Record<string, Record<string, ReglaConJerarquia[]>>>;

function agrupar(reglas: ReglaConJerarquia[]): Agrupado {
  const result: Agrupado = {};
  for (const r of reglas) {
    if (!result[r.compania]) result[r.compania] = {};
    if (!result[r.compania][r.ramo]) result[r.compania][r.ramo] = {};
    if (!result[r.compania][r.ramo][r.subramo]) result[r.compania][r.ramo][r.subramo] = [];
    result[r.compania][r.ramo][r.subramo].push(r);
  }
  return result;
}

function generarCodigoReglas(reglas: ReglaConJerarquia[]): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const agrupado = agrupar(reglas);
  const lines: string[] = [
    `# Reglas de Extracción — Lector de Pólizas`,
    `# Exportado: ${hoy}  |  Total: ${reglas.length} reglas`,
    `# Este archivo es de referencia. Las reglas se gestionan desde la UI.`,
    ``,
    `REGLAS = {`,
  ];

  for (const [comp, ramos] of Object.entries(agrupado)) {
    lines.push(`    "${comp}": {`);
    for (const [ramo, subramos] of Object.entries(ramos)) {
      lines.push(`        "${ramo}": {`);
      for (const [subramo, regs] of Object.entries(subramos)) {
        lines.push(`            "${subramo}": [`);
        for (const r of regs) {
          lines.push(`                {`);
          lines.push(`                    "campo": "${r.nombre_campo}",`);
          lines.push(`                    "patron": r"${r.patron_regex.replace(/"/g, '\\"')}",`);
          lines.push(`                    "confianza": ${r.confianza.toFixed(2)},`);
          lines.push(`                    "creado_por": "${r.creado_por}",`);
          lines.push(`                },`);
        }
        lines.push(`            ],`);
      }
      lines.push(`        },`);
    }
    lines.push(`    },`);
  }

  lines.push(`}`);
  return lines.join('\n');
}

function pyStr(s: string) {
  return `r"${s.replace(/"/g, '\\"')}"`;
}

function pyList(items: string[], indent: string): string {
  if (items.length === 0) return `[]`;
  if (items.length === 1) return `[${pyStr(items[0])}]`;
  const inner = items.map((s) => `${indent}    ${pyStr(s)},`).join('\n');
  return `[\n${inner}\n${indent}]`;
}

function generarCodigoDeteccion(companias: CompaniaDeteccion[]): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Patrones de Detección — Lector de Pólizas`,
    `# Exportado: ${hoy}`,
    `# Usado por detector.py para identificar compañía/ramo/subramo sin IA.`,
    `# Patrones regex: 3 pts/match  |  Keywords: 1 pt/match`,
    ``,
    `PATRONES_DETECCION = {`,
  ];

  for (const c of companias) {
    const hasComp = c.keywords.length > 0 || c.patrones_deteccion.length > 0 ||
      c.ramos.some(r => r.keywords.length > 0 || r.patrones_deteccion.length > 0 ||
        r.subramos.some(s => s.keywords.length > 0 || s.patrones_deteccion.length > 0));
    if (!hasComp) continue;

    lines.push(`    "${c.nombre}": {`);
    lines.push(`        "keywords": ${pyList(c.keywords, '        ')},`);
    lines.push(`        "patrones": ${pyList(c.patrones_deteccion, '        ')},`);
    lines.push(`        "ramos": {`);

    for (const r of c.ramos) {
      const hasRamo = r.keywords.length > 0 || r.patrones_deteccion.length > 0 ||
        r.subramos.some(s => s.keywords.length > 0 || s.patrones_deteccion.length > 0);
      if (!hasRamo) continue;

      lines.push(`            "${r.nombre}": {`);
      lines.push(`                "keywords": ${pyList(r.keywords, '                ')},`);
      lines.push(`                "patrones": ${pyList(r.patrones_deteccion, '                ')},`);
      lines.push(`                "subramos": {`);

      for (const s of r.subramos) {
        if (s.keywords.length === 0 && s.patrones_deteccion.length === 0) continue;
        lines.push(`                    "${s.nombre}": {`);
        lines.push(`                        "keywords": ${pyList(s.keywords, '                        ')},`);
        lines.push(`                        "patrones": ${pyList(s.patrones_deteccion, '                        ')},`);
        lines.push(`                    },`);
      }

      lines.push(`                },`);
      lines.push(`            },`);
    }

    lines.push(`        },`);
    lines.push(`    },`);
  }

  lines.push(`}`);
  return lines.join('\n');
}

function totalPatrones(c: CompaniaDeteccion): number {
  let n = c.patrones_deteccion.length + c.keywords.length;
  for (const r of c.ramos) {
    n += r.patrones_deteccion.length + r.keywords.length;
    for (const s of r.subramos) {
      n += s.patrones_deteccion.length + s.keywords.length;
    }
  }
  return n;
}

function PatronBadge({ tipo, valor }: { tipo: 'regex' | 'keyword'; valor: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono break-all ${
      tipo === 'regex' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
    }`}>
      <span className="font-sans font-bold opacity-60">{tipo === 'regex' ? 'rx' : 'kw'}</span>
      {valor}
    </span>
  );
}

export default function ReglasCodigo() {
  const [reglas, setReglas] = useState<ReglaConJerarquia[]>([]);
  const [deteccion, setDeteccion] = useState<CompaniaDeteccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [tab, setTab] = useState<'extraccion' | 'deteccion'>('extraccion');
  const [vista, setVista] = useState<'arbol' | 'codigo'>('arbol');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([getReglasConJerarquia(), getCodigoDeteccion()])
      .then(([r, d]) => { setReglas(r); setDeteccion(d); })
      .finally(() => setCargando(false));
  }, []);

  const codigoReglas = generarCodigoReglas(reglas);
  const codigoDeteccion = generarCodigoDeteccion(deteccion);
  const codigoActual = tab === 'extraccion' ? codigoReglas : codigoDeteccion;
  const agrupado = agrupar(reglas);

  function toggleNodo(key: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function copiarCodigo() {
    navigator.clipboard.writeText(codigoActual);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (cargando) {
    return <div className="p-8 text-sm text-gray-400">Cargando…</div>;
  }

  const companiasSinPatrones = deteccion.filter((c) => totalPatrones(c) === 0);

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Código de Reglas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tab === 'extraccion'
              ? `${reglas.length} regla${reglas.length !== 1 ? 's' : ''} activa${reglas.length !== 1 ? 's' : ''}`
              : `${deteccion.length} compañía${deteccion.length !== 1 ? 's' : ''} · patrones de identificación automática`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-200 rounded-xl overflow-hidden text-sm">
            <button
              onClick={() => setVista('arbol')}
              className={`px-4 py-2 font-medium transition-colors ${vista === 'arbol' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Árbol
            </button>
            <button
              onClick={() => setVista('codigo')}
              className={`px-4 py-2 font-medium transition-colors ${vista === 'codigo' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Code2 className="w-4 h-4 inline mr-1.5" />Código
            </button>
          </div>
          <button
            onClick={copiarCodigo}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {copiado ? <><Check className="w-4 h-4" />Copiado</> : <><Copy className="w-4 h-4" />Copiar código</>}
          </button>
        </div>
      </div>

      {/* Tabs extracción / detección */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('extraccion')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'extraccion' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="w-4 h-4" />
          Extracción de campos
          <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{reglas.length}</span>
        </button>
        <button
          onClick={() => setTab('deteccion')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'deteccion' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="w-4 h-4" />
          Detección automática
          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            tab === 'deteccion' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
          }`}>{deteccion.length}</span>
        </button>
      </div>

      {/* ── EXTRACCIÓN ── */}
      {tab === 'extraccion' && (
        <>
          {reglas.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Code2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay reglas activas. Créalas en la sección Reglas.</p>
            </div>
          ) : vista === 'codigo' ? (
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 rounded-2xl p-6 text-xs font-mono leading-relaxed overflow-auto max-h-[75vh] whitespace-pre">
                {codigoReglas}
              </pre>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(agrupado).map(([comp, ramos]) => {
                const compKey = comp;
                const totalComp = Object.values(ramos).flatMap(Object.values).flat().length;
                return (
                  <div key={comp} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleNodo(compKey)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {abiertos.has(compKey) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="font-semibold text-gray-900 text-sm">{comp}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">{totalComp} regla{totalComp !== 1 ? 's' : ''}</span>
                    </button>

                    {abiertos.has(compKey) && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {Object.entries(ramos).map(([ramo, subramos]) => {
                          const ramoKey = `${comp}::${ramo}`;
                          const totalRamo = Object.values(subramos).flat().length;
                          return (
                            <div key={ramo}>
                              <button
                                onClick={() => toggleNodo(ramoKey)}
                                className="w-full flex items-center justify-between px-8 py-2.5 hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  {abiertos.has(ramoKey) ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                  <span className="text-sm text-gray-700 font-medium">{ramo}</span>
                                </div>
                                <span className="text-xs text-gray-400">{totalRamo} regla{totalRamo !== 1 ? 's' : ''}</span>
                              </button>

                              {abiertos.has(ramoKey) && (
                                <div className="divide-y divide-gray-50">
                                  {Object.entries(subramos).map(([subramo, regs]) => {
                                    const subKey = `${comp}::${ramo}::${subramo}`;
                                    return (
                                      <div key={subramo}>
                                        <button
                                          onClick={() => toggleNodo(subKey)}
                                          className="w-full flex items-center justify-between px-12 py-2 hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex items-center gap-2">
                                            {abiertos.has(subKey) ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                            <span className="text-xs text-gray-600 font-medium">{subramo}</span>
                                          </div>
                                          <span className="text-[10px] text-gray-400">{regs.length} campo{regs.length !== 1 ? 's' : ''}</span>
                                        </button>

                                        {abiertos.has(subKey) && (
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                                                <th className="pl-16 pr-3 py-2 text-left font-medium">Campo</th>
                                                <th className="px-3 py-2 text-left font-medium">Patrón Regex</th>
                                                <th className="px-3 py-2 text-left font-medium w-20">Confianza</th>
                                                <th className="px-3 py-2 text-left font-medium w-16">Origen</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                              {regs.map((r) => (
                                                <tr key={r.id} className="hover:bg-gray-50">
                                                  <td className="pl-16 pr-3 py-2 font-mono text-blue-700 font-medium">{r.nombre_campo}</td>
                                                  <td className="px-3 py-2 font-mono text-gray-700 max-w-xs">
                                                    <code className="block truncate" title={r.patron_regex}>{r.patron_regex}</code>
                                                  </td>
                                                  <td className="px-3 py-2 text-gray-500">{Math.round(r.confianza * 100)}%</td>
                                                  <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                      r.creado_por === 'ia' ? 'bg-purple-100 text-purple-700'
                                                      : r.creado_por === 'visual' ? 'bg-blue-100 text-blue-700'
                                                      : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                      {r.creado_por}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── DETECCIÓN ── */}
      {tab === 'deteccion' && (
        <>
          {companiasSinPatrones.length > 0 && vista === 'arbol' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              <strong>{companiasSinPatrones.map(c => c.nombre).join(', ')}</strong> no tienen patrones de detección configurados.
              Súbeles un PDF en la sección Reglas y usa «Generar patrones regex» para generarlos automáticamente.
            </div>
          )}

          {vista === 'codigo' ? (
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 rounded-2xl p-6 text-xs font-mono leading-relaxed overflow-auto max-h-[75vh] whitespace-pre">
                {codigoDeteccion}
              </pre>
            </div>
          ) : (
            <div className="space-y-3">
              {deteccion.map((c) => {
                const compKey = `det::${c.nombre}`;
                const totalC = totalPatrones(c);
                return (
                  <div key={c.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleNodo(compKey)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {abiertos.has(compKey) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="font-semibold text-gray-900 text-sm">{c.nombre}</span>
                        {totalC === 0 && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">sin patrones</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {c.patrones_deteccion.length > 0 && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">{c.patrones_deteccion.length} regex</span>
                        )}
                        {c.keywords.length > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{c.keywords.length} kw</span>
                        )}
                      </div>
                    </button>

                    {abiertos.has(compKey) && (
                      <div className="border-t border-gray-100">
                        {/* Compañía patterns */}
                        {(c.keywords.length > 0 || c.patrones_deteccion.length > 0) && (
                          <div className="px-5 py-3 bg-gray-50 flex flex-wrap gap-1.5">
                            {c.keywords.map((kw) => <PatronBadge key={kw} tipo="keyword" valor={kw} />)}
                            {c.patrones_deteccion.map((p) => <PatronBadge key={p} tipo="regex" valor={p} />)}
                          </div>
                        )}

                        {/* Ramos */}
                        <div className="divide-y divide-gray-50">
                          {c.ramos.map((r) => {
                            const ramoKey = `det::${c.nombre}::${r.nombre}`;
                            return (
                              <div key={r.id}>
                                <button
                                  onClick={() => toggleNodo(ramoKey)}
                                  className="w-full flex items-center justify-between px-8 py-2.5 hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    {abiertos.has(ramoKey) ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                    <span className="text-sm text-gray-700 font-medium">{r.nombre}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {r.patrones_deteccion.length > 0 && (
                                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{r.patrones_deteccion.length} regex</span>
                                    )}
                                    {r.keywords.length > 0 && (
                                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{r.keywords.length} kw</span>
                                    )}
                                  </div>
                                </button>

                                {abiertos.has(ramoKey) && (
                                  <div>
                                    {(r.keywords.length > 0 || r.patrones_deteccion.length > 0) && (
                                      <div className="px-12 py-2 bg-gray-50 flex flex-wrap gap-1.5">
                                        {r.keywords.map((kw) => <PatronBadge key={kw} tipo="keyword" valor={kw} />)}
                                        {r.patrones_deteccion.map((p) => <PatronBadge key={p} tipo="regex" valor={p} />)}
                                      </div>
                                    )}

                                    {/* Subramos */}
                                    {r.subramos.map((s) => {
                                      const subKey = `det::${c.nombre}::${r.nombre}::${s.nombre}`;
                                      return (
                                        <div key={s.id} className="border-t border-gray-50">
                                          <button
                                            onClick={() => toggleNodo(subKey)}
                                            className="w-full flex items-center justify-between px-12 py-2 hover:bg-gray-50 transition-colors"
                                          >
                                            <div className="flex items-center gap-2">
                                              {abiertos.has(subKey) ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                              <span className="text-xs text-gray-600 font-medium">{s.nombre}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              {s.patrones_deteccion.length > 0 && (
                                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{s.patrones_deteccion.length} regex</span>
                                              )}
                                              {s.keywords.length > 0 && (
                                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{s.keywords.length} kw</span>
                                              )}
                                              {s.patrones_deteccion.length === 0 && s.keywords.length === 0 && (
                                                <span className="text-[10px] text-gray-300">sin patrones</span>
                                              )}
                                            </div>
                                          </button>

                                          {abiertos.has(subKey) && (s.keywords.length > 0 || s.patrones_deteccion.length > 0) && (
                                            <div className="px-16 py-2 bg-gray-50 flex flex-wrap gap-1.5">
                                              {s.keywords.map((kw) => <PatronBadge key={kw} tipo="keyword" valor={kw} />)}
                                              {s.patrones_deteccion.map((p) => <PatronBadge key={p} tipo="regex" valor={p} />)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getReglasConJerarquia, getCodigoDeteccion, getReglasNivel1, probarRegla } from '../lib/api';
import { Copy, Check, Code2, ChevronDown, ChevronRight, Shield, Search, Lock, FlaskConical, X, Wrench, Database } from 'lucide-react';

const COMPANIAS_NIVEL1 = ['GNP Seguros', 'Quálitas'];

interface ReglaNivel1 {
  campo: string;
  funcion: string | null;
  patrones: string[];
  archivo: string;
  linea: number;
  fuente?: string | null;
}

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

function ModalProbarRegla({ patron, onClose }: { patron: string; onClose: () => void }) {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<{ encontrado: boolean; coincidencia: string | null } | null>(null);
  const [probando, setProbando] = useState(false);

  async function probar() {
    setProbando(true);
    try {
      const r = await probarRegla(patron, texto);
      setResultado(r);
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />Probar regla
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <code className="block text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 break-all">{patron}</code>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pega aquí un texto de ejemplo (ej. texto extraído de un PDF)…"
          className="w-full h-32 text-xs font-mono border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={probar}
          disabled={!texto || probando}
          className="w-full py-2 bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {probando ? 'Probando…' : 'Probar'}
        </button>
        {resultado && (
          <div className={`text-xs rounded-lg px-3 py-2 border ${
            resultado.encontrado ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {resultado.encontrado
              ? <>Coincidencia encontrada: <code className="font-mono font-semibold">{resultado.coincidencia}</code></>
              : 'Sin coincidencia.'}
          </div>
        )}
      </div>
    </div>
  );
}

function SeccionNivel1({ compania }: { compania: string }) {
  const [abierto, setAbierto] = useState(false);
  const [reglas, setReglas] = useState<ReglaNivel1[] | null>(null);
  const [probando, setProbando] = useState<string | null>(null);

  useEffect(() => {
    if (abierto && reglas === null) {
      getReglasNivel1(compania).then(setReglas);
    }
  }, [abierto, compania, reglas]);

  return (
    <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-amber-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {abierto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="font-semibold text-gray-900 text-sm">{compania}</span>
          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
            <Lock className="w-2.5 h-2.5" />extractor dedicado · solo lectura
          </span>
        </div>
        {reglas && <span className="text-xs text-gray-400 font-medium">{reglas.length} campo{reglas.length !== 1 ? 's' : ''}</span>}
      </button>

      {abierto && (
        <div className="border-t border-amber-100">
          <div className="px-5 py-2.5 bg-amber-50 text-[11px] text-amber-800">
            Estas reglas viven como regex en código Python (no en la base de datos) y se ejecutan
            <strong> antes</strong> del motor de reglas de abajo. Se muestran de solo lectura, reconstruidas
            automáticamente a partir del código fuente — no se editan desde aquí.
          </div>
          {reglas === null ? (
            <div className="px-5 py-4 text-xs text-gray-400">Cargando…</div>
          ) : reglas.length === 0 ? (
            <div className="px-5 py-4 text-xs text-gray-400">No se pudieron detectar reglas.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                  <th className="pl-5 pr-3 py-2 text-left font-medium">Campo</th>
                  <th className="px-3 py-2 text-left font-medium">Función / patrones</th>
                  <th className="px-3 py-2 text-left font-medium w-40">Ubicación</th>
                  <th className="px-3 py-2 text-left font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reglas.map((r) => (
                  <tr key={r.campo} className="hover:bg-gray-50 align-top">
                    <td className="pl-5 pr-3 py-2 font-mono text-blue-700 font-medium whitespace-nowrap">{r.campo}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="font-mono text-gray-500 mb-1">{r.funcion ?? '—'}</div>
                      {r.patrones.length === 0 ? (
                        <span className="text-gray-300">sin regex directo detectado</span>
                      ) : (
                        <div className="space-y-1">
                          {r.patrones.map((p) => (
                            <div key={p} className="flex items-center gap-1.5">
                              <code className="block truncate max-w-xs font-mono text-gray-700" title={p}>{p}</code>
                              <button
                                onClick={() => setProbando(p)}
                                title="Probar esta regla"
                                className="shrink-0 p-1 rounded hover:bg-blue-50 text-blue-600"
                              >
                                <FlaskConical className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{r.archivo}:{r.linea}</td>
                    <td className="px-3 py-2"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {probando && <ModalProbarRegla patron={probando} onClose={() => setProbando(null)} />}
    </div>
  );
}

export default function ReglasCodigo() {
  const [reglas, setReglas] = useState<ReglaConJerarquia[]>([]);
  const [deteccion, setDeteccion] = useState<CompaniaDeteccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [tab, setTab] = useState<'extraccion' | 'deteccion'>('extraccion');
  const [subTabExtraccion, setSubTabExtraccion] = useState<'nivel1' | 'nivel2'>('nivel2');
  const [vista, setVista] = useState<'arbol' | 'codigo'>('arbol');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [probandoNivel2, setProbandoNivel2] = useState<string | null>(null);

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
              ? subTabExtraccion === 'nivel1'
                ? `${COMPANIAS_NIVEL1.length} aseguradora${COMPANIAS_NIVEL1.length !== 1 ? 's' : ''} con extractor dedicado`
                : `${reglas.length} regla${reglas.length !== 1 ? 's' : ''} activa${reglas.length !== 1 ? 's' : ''}`
              : `${deteccion.length} compañía${deteccion.length !== 1 ? 's' : ''} · patrones de identificación automática`
            }
          </p>
        </div>
        {!(tab === 'extraccion' && subTabExtraccion === 'nivel1') && (
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
        )}
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
          {/* Mini-tabs: extractor dedicado (nivel 1) vs. entrenador/BD (nivel 2) */}
          <div className="flex gap-1 -mt-1">
            <button
              onClick={() => setSubTabExtraccion('nivel1')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                subTabExtraccion === 'nivel1' ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />Extractor dedicado
              <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full font-bold">{COMPANIAS_NIVEL1.length}</span>
            </button>
            <button
              onClick={() => setSubTabExtraccion('nivel2')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                subTabExtraccion === 'nivel2' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Database className="w-3.5 h-3.5" />Entrenador / Reglas BD
              <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full font-bold">{reglas.length}</span>
            </button>
          </div>

          {subTabExtraccion === 'nivel1' && (
            <div className="space-y-3">
              {COMPANIAS_NIVEL1.map((c) => <SeccionNivel1 key={c} compania={c} />)}
            </div>
          )}

          {subTabExtraccion === 'nivel2' && (reglas.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Code2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay reglas activas. Créalas en la sección Entrenador PDFs.</p>
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
                const tieneNivel1 = COMPANIAS_NIVEL1.includes(comp);
                return (
                  <div key={comp} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleNodo(compKey)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {abiertos.has(compKey) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="font-semibold text-gray-900 text-sm">{comp}</span>
                        {tieneNivel1 && (
                          <span
                            title="Esta compañía también tiene reglas en el mini-tab «Extractor dedicado»"
                            className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium"
                          >
                            <Wrench className="w-2.5 h-2.5" />también en extractor dedicado
                          </span>
                        )}
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
                                                <th className="px-3 py-2 text-left font-medium w-10"></th>
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
                                                  <td className="px-3 py-2">
                                                    <button
                                                      onClick={() => setProbandoNivel2(r.patron_regex)}
                                                      title="Probar esta regla"
                                                      className="p-1 rounded hover:bg-blue-50 text-blue-600"
                                                    >
                                                      <FlaskConical className="w-3.5 h-3.5" />
                                                    </button>
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
          ))}
        </>
      )}

      {/* ── DETECCIÓN ── */}
      {tab === 'deteccion' && (
        <>
          {companiasSinPatrones.length > 0 && vista === 'arbol' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              <strong>{companiasSinPatrones.map(c => c.nombre).join(', ')}</strong> no tienen patrones de detección configurados.
              Súbeles un PDF en la sección Entrenador PDFs y usa «Generar patrones regex» para generarlos automáticamente.
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

      {probandoNivel2 && <ModalProbarRegla patron={probandoNivel2} onClose={() => setProbandoNivel2(null)} />}
    </div>
  );
}

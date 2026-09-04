import { useEffect, useState } from 'react';
import { getReglasConJerarquia, getCodigoDeteccion, getReglasNivel1, probarRegla, getPolizasDeCompania, getTextoPdf } from '../lib/api';
import { Copy, Check, Code2, ChevronDown, ChevronRight, Shield, Search, Lock, FlaskConical, X, Wrench, Database, FileStack, Inbox, Loader2, FileText } from 'lucide-react';
import type { PolizaEntrenamiento } from '../lib/types';

const COMPANIAS_NIVEL1 = ['GNP Seguros', 'Quálitas'];

interface ReglaNivel1 {
  campo: string;
  funcion: string | null;
  patrones: string[];
  archivo: string;
  linea: number;
  fuente?: string | null;
  /** Presente cuando patrones=[] pero NO es simplemente "no se detectó
   * nada": explica por qué (100% posicional/bbox sin regex de respaldo, o
   * un regex que existe en el código pero solo como validador dentro de
   * una ventana acotada — no es un extractor de valor autocontenible). */
  nota?: string | null;
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

/** Panel derecho del modal "Probar regla": carrusel vertical de pólizas ya
 * guardadas de la aseguradora en cuestión (todos sus subramos), para elegir
 * un texto en vez de tener que pegarlo a mano. Reutiliza el mismo endpoint
 * que alimenta el listado del lote en Entrenador PDFs — solo agregado por
 * aseguradora — y, al elegir una, pide su texto con el mismo endpoint que ya
 * usa el botón "Texto extraído" de esa pestaña. */
function PanelTextosGuardados({ compania, companiaId, onElegir, onClose }: {
  compania: string;
  companiaId?: number;
  onElegir: (texto: string) => void;
  onClose: () => void;
}) {
  const [polizas, setPolizas] = useState<PolizaEntrenamiento[] | null>(null);
  const [cargandoId, setCargandoId] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getPolizasDeCompania(compania).then(setPolizas).catch(() => setError(true));
  }, [compania]);

  async function elegir(polizaId: number) {
    setCargandoId(polizaId);
    try {
      const texto = await getTextoPdf(polizaId);
      onElegir(texto);
    } finally {
      setCargandoId(null);
    }
  }

  // Alto ajustado a la cantidad real de tarjetas (hasta ~11 visibles sin
  // scroll) en vez de un tamaño fijo — así una aseguradora con pocos PDFs
  // guardados no deja un hueco vacío grande, y una con muchos no se queda
  // corta. ~3.6rem por tarjeta (contenido + gap) + header/padding.
  const cantidadVisible = polizas ? Math.max(1, Math.min(polizas.length, 11)) : 6;
  const altoPx = cantidadVisible * 3.6 + 3.5;

  return (
    <div
      className="bg-white rounded-2xl shadow-xl w-80 flex flex-col overflow-hidden"
      style={{ height: `${altoPx}rem`, maxHeight: '85vh' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <FileStack className="w-4 h-4 text-blue-600" />Textos guardados
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {error ? (
          <div className="text-center py-10 text-gray-400">
            <Inbox className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-xs">No se pudo cargar el listado.</p>
          </div>
        ) : polizas === null ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : polizas.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Inbox className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-xs">No hay pólizas guardadas para esta aseguradora.</p>
            {companiaId != null && (
              <a
                href={`/reglas?companiaId=${companiaId}`}
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Subir un PDF en Entrenador PDFs
              </a>
            )}
          </div>
        ) : (
          polizas.map((p) => (
            <button
              key={p.id}
              onClick={() => elegir(p.id)}
              disabled={cargandoId !== null}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-xs font-medium text-gray-800 truncate">{p.nombre_archivo}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1 pl-5.5">
                {p.paginas != null ? `${p.paginas} pág. · ` : ''}
                {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                {cargandoId === p.id && <span className="ml-1">Cargando…</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Nº de líneas a reservar para la caja de patrones: suma las líneas que
 * ocupa cada uno de los primeros 5 patrones (estimado a ~58 caracteres por
 * línea, font-mono text-xs) — así se ven entre 4 y 5 completos sin scroll
 * por defecto, un campo con menos patrones no deja hueco vacío (solo suma
 * los que hay), y un patrón muy largo sigue contando sus líneas de más en
 * vez de quedar cortado. Tope de 14 líneas con scroll propio más allá de
 * eso (patrones extra, o wraps muy largos) para no volver el modal gigante. */
const CAJA_PATRONES_ALTO_REM = 6.15; // referencia: "documento" (GNP, 2 patrones)

function CajaPatrones({ patrones, seleccionados, onToggle, resaltarIndex }: {
  patrones: string[];
  seleccionados: Set<number>;
  onToggle: (i: number) => void;
  resaltarIndex?: number | null;
}) {
  const seleccionable = patrones.length > 1;
  return (
    <div
      className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg overflow-y-auto divide-y divide-gray-100"
      style={{ height: `${CAJA_PATRONES_ALTO_REM}rem` }}
    >
      {patrones.map((p, i) => (
        <label
          key={i}
          className={`flex items-start gap-2 px-3 py-1.5 break-all cursor-pointer ${
            resaltarIndex === i ? 'bg-green-50 text-green-800 font-semibold' : 'text-gray-700 hover:bg-gray-100'
          } ${!seleccionable ? 'cursor-default' : ''}`}
        >
          {seleccionable && (
            <input
              type="checkbox"
              checked={seleccionados.has(i)}
              onChange={() => onToggle(i)}
              className="mt-0.5 shrink-0"
            />
          )}
          <span>
            {patrones.length > 1 && <span className="text-gray-400 mr-1.5 select-none">#{i + 1}</span>}
            {p}
          </span>
        </label>
      ))}
    </div>
  );
}

function ModalProbarRegla({ campo, patrones, preseleccionado, nota, onClose, compania, companiaId }: {
  campo: string;
  /** Todos los patrones del campo, en el mismo orden en que el extractor
   * real los intenta (extraer_por_lineas_regex en gnp.py y el patrón
   * equivalente en qualitas.py: probar en orden, quedarse con el primer
   * match) — el backend replica exactamente esa lógica en /reglas/probar.
   * Un array de 1 elemento es "probar un solo patrón" (nivel 2, o un
   * campo de nivel 1 con un único regex detectado). Vacío + `nota` ->
   * campo sin regex probable (ver más abajo). */
  patrones: string[];
  /** Si se da, el modal arranca con solo ese patrón marcado (equivalente al
   * viejo "probar este patrón" de la lista) — el usuario puede sumar más
   * patrones desde los checkboxes. Sin esto, arrancan todos marcados. */
  preseleccionado?: number;
  /** Campos sin patrones probables (ReglaNivel1.nota): en vez de la caja
   * de patrones/textarea/botón "Probar", el modal muestra solo esta
   * explicación de por qué (100% posicional, o un regex que en el código
   * real es solo un validador dentro de una ventana acotada). */
  nota?: string | null;
  onClose: () => void;
  /** Solo se pasa desde el modal de reglas nivel 1 (extractor dedicado) —
   * habilita el botón "Elegir texto guardado". El modal de reglas nivel 2
   * sigue igual que antes, sin este panel. */
  compania?: string;
  companiaId?: number;
}) {
  if (nota) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600" />
              Sin regex probable
              <span className="font-mono font-normal text-gray-400">· {campo}</span>
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{nota}</span>
          </div>
        </div>
      </div>
    );
  }
  return <ModalProbarPatrones {...{ campo, patrones, preseleccionado, onClose, compania, companiaId }} />;
}

function ModalProbarPatrones({ campo, patrones, preseleccionado, onClose, compania, companiaId }: {
  campo: string;
  patrones: string[];
  preseleccionado?: number;
  onClose: () => void;
  compania?: string;
  companiaId?: number;
}) {
  const [texto, setTexto] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<number>>(
    () => new Set(preseleccionado != null ? [preseleccionado] : patrones.map((_, i) => i))
  );
  const [resultado, setResultado] = useState<{
    encontrado: boolean; coincidencia: string | null; indiceGlobal: number | null; patron: string | null;
  } | null>(null);
  const [probando, setProbando] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(false);

  function toggle(i: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next.size > 0 ? next : prev; // no permitir dejar cero seleccionados
    });
  }

  async function probar() {
    const indices = [...seleccionados].sort((a, b) => a - b);
    const subset = indices.map((i) => patrones[i]);
    setProbando(true);
    try {
      const r = await probarRegla(subset.length === 1 ? subset[0] : subset, texto);
      setResultado({
        encontrado: r.encontrado,
        coincidencia: r.coincidencia,
        patron: r.patron ?? (r.encontrado ? subset[0] : null),
        // patron_index que devuelve el backend es relativo al subconjunto probado —
        // se traduce de vuelta al índice real dentro de TODOS los patrones del campo.
        indiceGlobal: r.encontrado ? indices[r.patron_index ?? 0] : null,
      });
    } finally {
      setProbando(false);
    }
  }

  const todosSeleccionados = seleccionados.size === patrones.length;
  const tituloBoton = patrones.length === 1
    ? 'Probar'
    : todosSeleccionados
      ? `Probar ${patrones.length} patrones`
      : `Probar seleccionados (${seleccionados.size})`;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-stretch justify-center z-50 p-4"
      onClick={() => (panelAbierto ? setPanelAbierto(false) : onClose())}
    >
      {/* Cada columna centra su propio contenido verticalmente por su
          cuenta (items-center en cada wrapper) en vez de compartir un
          único eje del row -- así "Probar patrones" y "Textos guardados"
          quedan centrados cada uno en su espacio aunque tengan alturas
          distintas, en vez de top-alineados entre sí. */}
      <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center">
        <div
          className={`bg-white rounded-2xl shadow-xl w-[36rem] max-w-xl p-6 space-y-3.5 transition-transform duration-300 ${panelAbierto ? '-translate-x-1' : ''}`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-blue-600" />
              {patrones.length > 1 ? `Probar patrones (${patrones.length})` : 'Probar regla'}
              <span className="font-mono font-normal text-gray-400">· {campo}</span>
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <CajaPatrones
            patrones={patrones}
            seleccionados={seleccionados}
            onToggle={toggle}
            resaltarIndex={resultado?.encontrado ? resultado.indiceGlobal : null}
          />
          <div className="relative">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pega aquí un texto de ejemplo (ej. texto extraído de un PDF)…"
              className="w-full h-48 text-xs font-mono border border-gray-200 rounded-lg p-3 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {compania && (
            <button
              onClick={() => setPanelAbierto((v) => !v)}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                panelAbierto ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileStack className="w-3.5 h-3.5" />Elegir texto guardado
            </button>
          )}
          <button
            onClick={probar}
            disabled={!texto || probando}
            className="w-full py-2 bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {probando ? 'Probando…' : tituloBoton}
          </button>
          {resultado && (
            <div className={`text-xs rounded-lg px-3 py-2 border ${
              resultado.encontrado ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {resultado.encontrado ? (
                <>
                  {patrones.length > 1 && (
                    <>Matcheó con el patrón <strong>#{(resultado.indiceGlobal ?? 0) + 1}</strong>: <code className="font-mono">{resultado.patron}</code><br /></>
                  )}
                  Valor extraído: <code className="font-mono font-semibold">{resultado.coincidencia}</code>
                </>
              ) : (
                patrones.length > 1 && todosSeleccionados
                  ? 'Ningún patrón de este campo encontró coincidencia.'
                  : patrones.length > 1
                    ? 'Ningún patrón seleccionado encontró coincidencia.'
                    : 'Sin coincidencia.'
              )}
            </div>
          )}
        </div>
        </div>

        {panelAbierto && compania && (
          <div className="flex items-center">
            <PanelTextosGuardados
              compania={compania}
              companiaId={companiaId}
              onClose={() => setPanelAbierto(false)}
              onElegir={(t) => { setTexto(t); setPanelAbierto(false); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ObjetivoPrueba {
  campo: string;
  patrones: string[];
  /** Índice del patrón a dejar preseleccionado al abrir el modal (ej. al
   * hacer clic en el ícono de un patrón individual dentro de la lista) —
   * si no se da, arrancan todos seleccionados ("probar el campo completo"). */
  preseleccionado?: number;
  /** Campos sin patrones probables (ver ReglaNivel1.nota): el modal
   * muestra este texto en vez de la caja de patrones/textarea. */
  nota?: string | null;
}

function SeccionNivel1({ compania, companiaId }: { compania: string; companiaId?: number }) {
  const [abierto, setAbierto] = useState(false);
  const [reglas, setReglas] = useState<ReglaNivel1[] | null>(null);
  const [probando, setProbando] = useState<ObjetivoPrueba | null>(null);

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
                    <td className="pl-5 pr-3 py-2 whitespace-nowrap">
                      {r.patrones.length > 0 ? (
                        <button
                          onClick={() => setProbando({ campo: r.campo, patrones: r.patrones })}
                          title={r.patrones.length > 1
                            ? `Probar los ${r.patrones.length} patrones de este campo, en el mismo orden que usa el extractor`
                            : 'Probar esta regla'}
                          className="font-mono text-blue-700 font-medium hover:underline decoration-dotted underline-offset-2"
                        >
                          {r.campo}
                        </button>
                      ) : r.nota ? (
                        <button
                          onClick={() => setProbando({ campo: r.campo, patrones: [], nota: r.nota })}
                          title="Ver por qué este campo no se prueba por regex"
                          className="font-mono text-blue-700 font-medium hover:underline decoration-dotted underline-offset-2"
                        >
                          {r.campo}
                        </button>
                      ) : (
                        <span className="font-mono text-blue-700 font-medium">{r.campo}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="font-mono text-gray-500 mb-1">{r.funcion ?? '—'}</div>
                      {r.patrones.length === 0 ? (
                        r.nota ? (
                          <button
                            onClick={() => setProbando({ campo: r.campo, patrones: [], nota: r.nota })}
                            className="flex items-center gap-1.5 text-amber-700 hover:text-amber-800 hover:underline"
                          >
                            <Lock className="w-3 h-3 shrink-0" />
                            <span className="text-[11px]">Sin regex utilizado aún</span>
                          </button>
                        ) : (
                          <span className="text-gray-300">sin regex directo detectado</span>
                        )
                      ) : (
                        <div className="space-y-1">
                          {r.patrones.map((p, i) => (
                            <div key={p} className="flex items-center gap-1.5">
                              {r.patrones.length > 1 && <span className="text-gray-300 text-[10px] shrink-0">#{i + 1}</span>}
                              <code className="block truncate max-w-xs font-mono text-gray-700" title={p}>{p}</code>
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
      {probando && (
        <ModalProbarRegla
          campo={probando.campo}
          patrones={probando.patrones}
          preseleccionado={probando.preseleccionado}
          nota={probando.nota}
          onClose={() => setProbando(null)}
          compania={compania}
          companiaId={companiaId}
        />
      )}
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
  const [probandoNivel2, setProbandoNivel2] = useState<ObjetivoPrueba | null>(null);

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
              {COMPANIAS_NIVEL1.map((c) => (
                <SeccionNivel1 key={c} compania={c} companiaId={deteccion.find((d) => d.nombre === c)?.id} />
              ))}
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
                                                      onClick={() => setProbandoNivel2({ campo: r.nombre_campo, patrones: [r.patron_regex] })}
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

      {probandoNivel2 && (
        <ModalProbarRegla
          campo={probandoNivel2.campo}
          patrones={probandoNivel2.patrones}
          onClose={() => setProbandoNivel2(null)}
        />
      )}
    </div>
  );
}

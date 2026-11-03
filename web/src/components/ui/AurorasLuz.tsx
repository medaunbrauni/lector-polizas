import { useEffect, useState } from 'react';
import './AurorasLuz.css';

export const DEFAULT_RING_COLOR = '#D8E8FF';

// Aros "garabato" — círculos irregulares dibujados a mano vía Bézier, no
// geometría perfecta. Radio y fase distintos entre sí para que el conjunto
// se vea orgánico, no un patrón repetido escalado.
// Duraciones bajas a propósito (2.5s-6.5s) — la rotación debe sentirse
// notoriamente rápida, no una vuelta lenta de fondo. Se mantiene el
// desfase relativo entre aros (ninguno es múltiplo exacto de otro) para
// que sigan sin verse sincronizados.
export const RINGS = [
  { path: 'M100,32 C122,30 142,42 158,60 C172,76 170,98 160,116 C148,138 128,152 104,156 C80,158 58,148 44,130 C30,112 28,88 40,68 C52,48 74,34 100,32 Z', duration: '3.5s', direction: 'normal' as const },
  { path: 'M100,24 C128,20 152,34 166,58 C180,80 176,106 162,126 C148,148 122,164 96,162 C70,160 46,144 34,122 C22,100 26,74 42,54 C58,36 78,26 100,24 Z', duration: '5s', direction: 'reverse' as const },
  { path: 'M102,14 C134,10 160,28 176,54 C190,78 186,108 168,130 C150,154 120,170 90,166 C60,162 34,144 22,118 C10,92 16,62 36,42 C54,24 78,16 102,14 Z', duration: '6.5s', direction: 'normal' as const },
  { path: 'M100,40 C118,38 134,48 144,62 C154,76 152,92 144,104 C134,118 118,126 100,124 C82,122 66,112 58,98 C50,84 52,68 62,54 C72,42 86,42 100,40 Z', duration: '2.5s', direction: 'reverse' as const },
];

export function randomHslColor() {
  return `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`;
}

const COLORES_BLANCOS = RINGS.map(() => DEFAULT_RING_COLOR);
const CAMBIO_COLOR_MS = 1100;

interface Props {
  /** Login: con el cursor encima, los aros usan `colors`. */
  hovered?: boolean;
  colors?: string[];
  /** Loader: los aros cambian de color solos, sin depender del hover. */
  cargando?: boolean;
  /** Anula el tamaño por defecto (ancho y alto CSS). */
  tamano?: string;
}

export default function AurorasLuz({ hovered = false, colors = COLORES_BLANCOS, cargando = false, tamano }: Props) {
  const [coloresAuto, setColoresAuto] = useState<string[]>(COLORES_BLANCOS);

  useEffect(() => {
    if (!cargando || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nuevos = () => setColoresAuto(RINGS.map(() => randomHslColor()));
    nuevos();
    const id = setInterval(nuevos, CAMBIO_COLOR_MS);
    return () => clearInterval(id);
  }, [cargando]);

  const activos = cargando ? coloresAuto : hovered ? colors : COLORES_BLANCOS;

  return (
    <div className="login-rings" aria-hidden="true" style={tamano ? { width: tamano, height: tamano } : undefined}>
      <svg viewBox="0 0 200 200" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
        {RINGS.map((ring, i) => (
          <g
            key={i}
            className="login-ring"
            style={{ animationDuration: ring.duration, animationDirection: ring.direction }}
          >
            <path d={ring.path} fill="none" strokeWidth={3.5} style={{ stroke: activos[i], color: activos[i] }} />
          </g>
        ))}
      </svg>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

interface Star {
  id: number;
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
}

function Starfield({ count = 120 }: { count?: number }) {
  // useMemo: las estrellas se generan una sola vez por montaje, no en cada
  // render (si no, "parpadearían" saltando de posición en vez de solo opacidad).
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: count }, (_, id) => ({
        id,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 2 + 1,
        duration: 2 + Math.random() * 3,
        delay: Math.random() * 5,
      })),
    [count],
  );

  return (
    <div className="login-stars" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.id}
          className="login-star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const DEFAULT_RING_COLOR = '#D8E8FF';

// Aros "garabato" — círculos irregulares dibujados a mano vía Bézier, no
// geometría perfecta. Radio y fase distintos entre sí para que el conjunto
// se vea orgánico, no un patrón repetido escalado.
// Duraciones bajas a propósito (2.5s-6.5s) — la rotación debe sentirse
// notoriamente rápida, no una vuelta lenta de fondo. Se mantiene el
// desfase relativo entre aros (ninguno es múltiplo exacto de otro) para
// que sigan sin verse sincronizados.
const RINGS = [
  { path: 'M100,32 C122,30 142,42 158,60 C172,76 170,98 160,116 C148,138 128,152 104,156 C80,158 58,148 44,130 C30,112 28,88 40,68 C52,48 74,34 100,32 Z', duration: '3.5s', direction: 'normal' as const },
  { path: 'M100,24 C128,20 152,34 166,58 C180,80 176,106 162,126 C148,148 122,164 96,162 C70,160 46,144 34,122 C22,100 26,74 42,54 C58,36 78,26 100,24 Z', duration: '5s', direction: 'reverse' as const },
  { path: 'M102,14 C134,10 160,28 176,54 C190,78 186,108 168,130 C150,154 120,170 90,166 C60,162 34,144 22,118 C10,92 16,62 36,42 C54,24 78,16 102,14 Z', duration: '6.5s', direction: 'normal' as const },
  { path: 'M100,40 C118,38 134,48 144,62 C154,76 152,92 144,104 C134,118 118,126 100,124 C82,122 66,112 58,98 C50,84 52,68 62,54 C72,42 86,42 100,40 Z', duration: '2.5s', direction: 'reverse' as const },
];

function randomHslColor() {
  return `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`;
}

function LoginRings({ hovered, colors }: { hovered: boolean; colors: string[] }) {
  return (
    <div className="login-rings" aria-hidden="true">
      <svg viewBox="0 0 200 200" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
        {RINGS.map((ring, i) => (
          <g
            key={i}
            className="login-ring"
            style={{ animationDuration: ring.duration, animationDirection: ring.direction }}
          >
            <path
              d={ring.path}
              fill="none"
              strokeWidth={3.5}
              style={{ stroke: hovered ? colors[i] : DEFAULT_RING_COLOR, color: hovered ? colors[i] : DEFAULT_RING_COLOR }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Al quitar el cursor los aros vuelven a blanco (reset explícito) en vez de
  // quedarse con el último color aleatorio — más predecible para el usuario
  // y evita que el login quede con un color "pegado" tras pasar el mouse.
  const [hovered, setHovered] = useState(false);
  const [ringColors, setRingColors] = useState<string[]>(RINGS.map(() => DEFAULT_RING_COLOR));

  const handleRingsEnter = () => {
    setRingColors(RINGS.map(() => randomHslColor()));
    setHovered(true);
  };
  const handleRingsLeave = () => setHovered(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(password);
      if (res.ok) {
        const from = (location.state as { from?: Location })?.from?.pathname || '/';
        navigate(from, { replace: true });
      } else {
        setError(res.error ?? 'Contraseña incorrecta');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" onMouseEnter={handleRingsEnter} onMouseLeave={handleRingsLeave}>
      <Starfield />
      {/* Aros centrados en la página completa (no acotados al recuadro de
          la card) — así pueden crecer mucho más allá de la card sin que
          un contenedor angosto los recorte. */}
      <LoginRings hovered={hovered} colors={ringColors} />

      <div className="login-card-wrapper">
        <div className="login-card">
          <h1 className="text-xl font-bold text-white text-center mb-1">Lector de Pólizas</h1>
          <p className="text-xs text-center mb-6 text-white/50">Acceso interno</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-white/70 mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#1973B8] focus:border-transparent"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #072146, #1973B8)' }}
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

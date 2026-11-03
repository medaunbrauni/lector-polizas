import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AurorasLuz, { RINGS, DEFAULT_RING_COLOR, randomHslColor } from '../components/ui/AurorasLuz';
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

export default function LoginPage() {
  const { login, finTransicion } = useAuth();
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
        finTransicion();
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
      <AurorasLuz hovered={hovered} colors={ringColors} />

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

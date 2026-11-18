import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { verifySession, loginRequest, logoutRequest } from '../lib/api';
import { limpiarTandas } from '../lib/extractorPersistence';
import TransicionSesion, { TRANSICION_FADE_MS, TRANSICION_MIN_MS } from '../components/ui/TransicionSesion';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  checkSession: () => Promise<void>;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Login: la página ya navegó a la app; arranca el fade-out del overlay. */
  finTransicion: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const dosFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
// Si el login salió bien pero la página nunca avisa, el overlay no se queda pegado.
const WATCHDOG_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [transicion, setTransicion] = useState<{ texto: string; activa: boolean } | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout>>();
  const ocupado = useRef(false); // evita doble disparo (doble clic) mientras dura la transición

  const checkSession = async () => {
    setIsAuthenticated(await verifySession());
  };

  useEffect(() => {
    checkSession().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cerrarOverlay = useCallback(() => {
    clearTimeout(watchdog.current);
    ocupado.current = false;
    setTransicion((t) => (t ? { ...t, activa: false } : t));
  }, []);

  const login = async (password: string) => {
    if (ocupado.current) return { ok: false, error: 'Ya se está iniciando sesión' };
    ocupado.current = true;
    setTransicion({ texto: 'Iniciando sesión…', activa: true });
    const t0 = Date.now();
    try {
      const [res] = await Promise.all([loginRequest(password), sleep(TRANSICION_FADE_MS)]);
      if (!res.ok) { cerrarOverlay(); return res; }
      await sleep(Math.max(0, TRANSICION_MIN_MS - (Date.now() - t0)));
      setIsAuthenticated(true);
      watchdog.current = setTimeout(cerrarOverlay, WATCHDOG_MS);
      return res;
    } catch {
      cerrarOverlay();
      return { ok: false, error: 'No se pudo conectar con el servidor' };
    }
  };

  const finTransicion = async () => {
    await dosFrames(); // la app ya está montada antes de revelar
    cerrarOverlay();
  };

  const logout = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    setTransicion({ texto: 'Cerrando sesión…', activa: true });
    const t0 = Date.now();
    await Promise.all([logoutRequest().catch(() => {}), sleep(TRANSICION_FADE_MS)]);
    limpiarTandas(); // los resultados del Extractor no sobreviven a cerrar sesión
    await sleep(Math.max(0, TRANSICION_MIN_MS - (Date.now() - t0)));
    setIsAuthenticated(false); // ProtectedRoute redirige a /login
    await dosFrames();
    cerrarOverlay();
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, checkSession, login, logout, finTransicion }}>
      {children}
      {transicion && (
        <TransicionSesion texto={transicion.texto} activa={transicion.activa} onFin={() => setTransicion(null)} />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

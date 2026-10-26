import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/ui/Layout';
import ProtectedRoute from './components/ui/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import LectorPolizas from './pages/LectorPolizas';
import Historial from './pages/Historial';
import Catalogos from './pages/Catalogos';
import Reglas from './pages/Reglas';
import ReglasCodigo from './pages/ReglasCodigo';
import TicketsMovi from './pages/TicketsMovi';

function RedirigirEntrenador() {
  const { search } = useLocation();
  return <Navigate to={`/entrenador${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/"             element={<LectorPolizas />} />
                  <Route path="/historial"    element={<Historial />} />
                  <Route path="/catalogos"    element={<Catalogos />} />
                  <Route path="/entrenador"   element={<Reglas />} />
                  <Route path="/reglas"       element={<RedirigirEntrenador />} />
                  <Route path="/trainer"      element={<RedirigirEntrenador />} />
                  <Route path="/reglas/codigo" element={<ReglasCodigo />} />
                  <Route path="/clasificador/tickets" element={<TicketsMovi />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

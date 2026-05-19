import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/ui/Layout';
import LectorPolizas from './pages/LectorPolizas';
import Historial from './pages/Historial';
import Catalogos from './pages/Catalogos';
import Reglas from './pages/Reglas';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"          element={<LectorPolizas />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/catalogos" element={<Catalogos />} />
          <Route path="/reglas"    element={<Reglas />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

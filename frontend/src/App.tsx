import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Chat from './pages/Chat';
import Login from './pages/Login';
import Configuracoes from './pages/Configuracoes';
import Campanhas from './pages/Campanhas';
import Vendedores from './pages/Vendedores';
import ConfigMensagens from './pages/ConfigMensagens';
import GestaoVisitas from './pages/GestaoVisitas';
import Reativacao from './pages/Reativacao';
import Rotas from './pages/Rotas';
import AnaliseCNPJ from './pages/AnaliseCNPJ';
import AnaliseIE from './pages/AnaliseIE';
import Catalogo from './pages/Catalogo';
import Geolocalizacao from './pages/Geolocalizacao';
import Prospeccao from './pages/Prospeccao';
import SAC from './pages/SAC';
import LogIdentificacao from './pages/LogIdentificacao';
import Objetivos from './pages/Objetivos';
import ProtectedRoute from './components/ProtectedRoute';
import { SocketProvider } from './contexts/SocketContext';

import { CartProvider } from './contexts/CartContext';
import { PrivacyProvider } from './contexts/PrivacyContext';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Rotas Protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route element={
            <SocketProvider>
              <PrivacyProvider>
                <CartProvider>
                  <RootLayout />
                </CartProvider>
              </PrivacyProvider>
            </SocketProvider>
          }>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/campanhas" element={<Campanhas />} />
            <Route path="/vendedores" element={<Vendedores />} />
            <Route path="/mensagens" element={<ConfigMensagens />} />
            <Route path="/visitas" element={<GestaoVisitas />} />
            <Route path="/inativos" element={<Reativacao />} />
            <Route path="/rotas" element={<Rotas />} />
            <Route path="/analisecnpj" element={<AnaliseCNPJ />} />
            <Route path="/analise-ie" element={<AnaliseIE />} />
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/geolocalizacao" element={<Geolocalizacao />} />
            <Route path="/prospeccao" element={<Prospeccao />} />
            <Route path="/sac" element={<SAC />} />
            <Route path="/logs-identificacao" element={<LogIdentificacao />} />
            <Route path="/objetivos" element={<Objetivos />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;


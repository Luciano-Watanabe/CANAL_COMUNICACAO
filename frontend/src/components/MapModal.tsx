import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { X, Check } from 'lucide-react';

// Correção do ícone padrão do Leaflet no React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  dia: string;
  clientes: any[];
  vendedor?: any;
  onApplyRoute: (novaOrdem: any[]) => void;
}

export function MapModal({ isOpen, onClose, dia, clientes, vendedor, onApplyRoute }: MapModalProps) {
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState('Iniciando...');
  const [optimizedRoute, setOptimizedRoute] = useState<any[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && clientes.length > 0) {
      calculateOptimizedRoute();
    }
  }, [isOpen, clientes]);

  const calculateOptimizedRoute = async () => {
    setLoading(true);
    setStatusText('Buscando coordenadas (geocoding)...');
    try {
      let geocodedClients = [...clientes];
      
      // Inject seller as starting point if available
      if (vendedor) {
        geocodedClients.unshift({
          ...vendedor,
          isVendedor: true,
          codcli: 'VENDEDOR',
          razaosocial: 'Ponto de Partida (Você)',
        });
      }

      for (let i = 0; i < geocodedClients.length; i++) {
        const c = geocodedClients[i];
        if (!c.lat || !c.lng) {
          const address = [c.endereco, c.municipio, c.cep].filter(Boolean).join(', ');
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
            const data = await res.json();
            if (data && data.length > 0) {
              c.lat = data[0].lat;
              c.lng = data[0].lon;
            } else {
              console.warn('Endereço não encontrado:', address);
            }
            // Evitar rate limit (1req/sec)
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) {
            console.error('Erro no geocoding:', e);
          }
        }
      }

      const validClients = geocodedClients.filter(c => c.lat && c.lng);
      if (validClients.length < 2) {
        setStatusText('Muitos clientes sem endereço válido para roteirizar.');
        setLoading(false);
        return;
      }

      setStatusText('Calculando rota mais curta (OSRM)...');
      
      const coords = validClients.map(c => `${c.lng},${c.lat}`).join(';');
      const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&destination=last&geometries=geojson`;
      
      const routeRes = await fetch(url);
      const routeData = await routeRes.json();

      if (routeData.code !== 'Ok') {
        setStatusText('Erro ao calcular rota.');
        setLoading(false);
        return;
      }

      // Adiciona o index original antes de ordenar
      let mappedWaypoints = routeData.waypoints.map((wp: any, index: number) => ({ ...wp, original_index: index }));
      
      // Ordena pela sequencia ideal do TSP
      mappedWaypoints.sort((a: any, b: any) => a.waypoint_index - b.waypoint_index);
      
      // Mapeia de volta para os clientes originais
      let newOrder = mappedWaypoints.map((wp: any) => validClients[wp.original_index]);
      
      const invalidClients = geocodedClients.filter(c => !c.lat || !c.lng);
      
      setOptimizedRoute([...newOrder, ...invalidClients]);
      setMarkers(newOrder);
      setRouteGeometry(routeData.trips[0].geometry.coordinates.map((c: any) => [c[1], c[0]]));
      setLoading(false);
    } catch (err) {
      console.error(err);
      setStatusText('Erro inesperado.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/70 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Rota Otimizada: {dia}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 z-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400 font-medium">{statusText}</p>
              <p className="text-xs text-slate-400 mt-2">Isso pode levar alguns segundos dependendo da quantidade de clientes.</p>
            </div>
          ) : (
            <MapContainer 
              center={markers.length > 0 ? [parseFloat(markers[0].lat), parseFloat(markers[0].lng)] : [-23.5505, -46.6333]} 
              zoom={13} 
              className="w-full h-full z-0"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              {markers.map((c, index) => (
                <Marker key={c.codcli} position={[parseFloat(c.lat), parseFloat(c.lng)]}>
                  <Popup>
                    <strong>{c.isVendedor ? 'Ponto de Partida' : `${index}º Parada`}</strong><br/>
                    {c.razaosocial}<br/>
                    {c.endereco}
                  </Popup>
                </Marker>
              ))}
              {routeGeometry && (
                <Polyline positions={routeGeometry} color="blue" weight={5} opacity={0.7} />
              )}
            </MapContainer>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-white rounded-lg transition-colors font-medium">
            Cancelar
          </button>
          <button 
            onClick={() => onApplyRoute(optimizedRoute.filter(c => !c.isVendedor))}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium shadow-md shadow-blue-500/20"
          >
            <Check size={18} />
            Aplicar Rota Otimizada
          </button>
        </div>
      </div>
    </div>
  );
}

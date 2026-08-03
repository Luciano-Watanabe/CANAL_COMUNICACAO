import { useState, useEffect } from 'react';
import { MapPin, RefreshCw, Play, UploadCloud, AlertTriangle, CheckCircle, Database } from 'lucide-react';
import clsx from 'clsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface FilaStatus {
  pendentes: number;
  processados_ok: number;
  erros: number;
  total: number;
}

export default function Geolocalizacao() {
  const [status, setStatus] = useState<FilaStatus>({ pendentes: 0, processados_ok: 0, erros: 0, total: 0 });
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch(`${API_URL}/geolocalizacao/status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success && data.data) {
        setStatus({
          pendentes: data.data.PENDENTES || 0,
          processados_ok: data.data.PROCESSADOS_OK || 0,
          erros: data.data.ERROS || 0,
          total: data.data.TOTAL || 0
        });
      }
    } catch (err) {
      console.error('Erro ao buscar status', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Atualiza a cada 30 segundos
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (endpoint: string, actionName: string, body?: any) => {
    setLoadingAction(actionName);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/geolocalizacao/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: body ? JSON.stringify(body) : undefined
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
      } else {
        setMessage({ text: data.message || 'Erro ao executar ação', type: 'error' });
      }
      
      // Atualiza o status depois da ação
      await fetchStatus();
      
    } catch (err) {
      console.error(`Erro na ação ${actionName}`, err);
      setMessage({ text: 'Erro de conexão com o servidor', type: 'error' });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <MapPin className="text-primary-500" /> Geolocalização de Clientes
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Gerencie a fila de conversão de endereços em coordenadas (Latitude/Longitude).
          </p>
        </div>
        
        <button 
          onClick={fetchStatus}
          disabled={loadingStatus}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-[var(--border-color)] rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={18} className={clsx(loadingStatus && "animate-spin")} />
          Atualizar Status
        </button>
      </div>

      {message && (
        <div className={clsx(
          "p-4 rounded-xl flex items-start gap-3",
          message.type === 'success' ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
          message.type === 'error' ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" :
          "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
        )}>
          {message.type === 'success' ? <CheckCircle size={20} className="mt-0.5" /> : <AlertTriangle size={20} className="mt-0.5" />}
          <p>{message.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass p-5 rounded-2xl border border-[var(--border-color)]">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total na Fila</p>
          <p className="text-3xl font-bold text-slate-800 dark:text-white">{status.total}</p>
        </div>
        <div className="glass p-5 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/5">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">Pendentes</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{status.pendentes}</p>
        </div>
        <div className="glass p-5 rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1">Processados (OK)</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{status.processados_ok}</p>
        </div>
        <div className="glass p-5 rounded-2xl border border-rose-500/30 bg-rose-50 dark:bg-rose-500/5">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400 mb-1">Erros</p>
          <p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{status.erros}</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-[var(--border-color)]">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Ações de Processamento</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Passo 1 */}
          <div className="flex flex-col gap-3 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 relative">
            <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">1</span>
            <Database className="text-blue-500 mb-2" size={32} />
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">Alimentar Fila</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 mt-1">Busca clientes sem latitude/longitude na PCCLIENT e joga na tabela de estágio.</p>
            </div>
            <button 
              onClick={() => handleAction('alimentar', 'alimentar')}
              disabled={loadingAction !== null}
              className="mt-auto w-full py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingAction === 'alimentar' ? <RefreshCw className="animate-spin" size={18} /> : <UploadCloud size={18} />}
              Alimentar Fila
            </button>
          </div>

          {/* Passo 2 */}
          <div className="flex flex-col gap-3 p-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 relative">
            <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-900 flex items-center justify-center font-bold text-amber-700 dark:text-amber-300">2</span>
            <MapPin className="text-amber-500 mb-2" size={32} />
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">Processar Lote</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 mt-1">Consulta a API (Nominatim) para os próximos pendentes e atualiza as coordenadas.</p>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <button 
                onClick={() => handleAction('processar', 'processar', { limit: 5 })}
                disabled={loadingAction !== null || status.pendentes === 0}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingAction === 'processar' ? <RefreshCw className="animate-spin" size={18} /> : <Play size={18} />}
                Processar 5 
              </button>
              <p className="text-xs text-center text-slate-500">Lotes pequenos para respeitar o Rate Limit (1/seg)</p>
            </div>
          </div>

          {/* Passo 3 */}
          <div className="flex flex-col gap-3 p-5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10 relative">
            <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-900 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-300">3</span>
            <CheckCircle className="text-emerald-500 mb-2" size={32} />
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">Migrar para Base</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 mt-1">Pega todos com status OK (validados) e migra a Lat/Long para a tabela PCCLIENT oficial.</p>
            </div>
            <button 
              onClick={() => handleAction('migrar', 'migrar')}
              disabled={loadingAction !== null || status.processados_ok === 0}
              className="mt-auto w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingAction === 'migrar' ? <RefreshCw className="animate-spin" size={18} /> : <Database size={18} />}
              Migrar Ok para PCCLIENT
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300">
        <strong>Atenção:</strong> Os clientes com status "Erro" (endereço não encontrado) permanecerão na fila com status <code>E</code>. Você deve corrigir o endereço deles no WinThor/ERP antes de tentar processá-los novamente.
      </div>
    </div>
  );
}

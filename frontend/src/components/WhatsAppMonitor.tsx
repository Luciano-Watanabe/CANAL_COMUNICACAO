import { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, QrCode, X } from 'lucide-react';

interface WhatsAppMonitorProps {
  codusur: number;
}

export function WhatsAppMonitor({ codusur }: WhatsAppMonitorProps) {
  const [status, setStatus] = useState<'LOADING' | 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'ERROR'>('LOADING');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const fetchStatus = async () => {
    setStatus('LOADING');
    try {
      const res = await fetch(`/api/whatsapp/status?codusur=${codusur}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('ERROR');
        return;
      }
      
      if (data.state === 'NOT_CONFIGURED') {
        setStatus('NOT_CONFIGURED');
        return;
      }
      
      if (data.state === 'open') {
        setStatus('CONNECTED');
      } else {
        setStatus('DISCONNECTED');
      }
    } catch (err) {
      console.error(err);
      setStatus('ERROR');
    }
  };

  const handleConnect = async () => {
    setIsModalOpen(true);
    setQrCode(null); // Reset
    try {
      const res = await fetch(`/api/whatsapp/connect?codusur=${codusur}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (res.ok && data.qr) {
        setQrCode(data.qr);
      } else {
        alert('Falha ao gerar QRCode. A instância pode já estar conectada ou indisponível.');
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao tentar conectar.');
      setIsModalOpen(false);
    }
  };

  useEffect(() => {
    if (codusur) {
      fetchStatus();
      // Poll every 30 seconds if not connected or loading
      const interval = setInterval(() => {
        fetchStatus();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [codusur]);

  // Handle modal polling for status
  useEffect(() => {
    let modalInterval: any;
    if (isModalOpen && status !== 'CONNECTED') {
      modalInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/whatsapp/status?codusur=${codusur}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
          });
          const data = await res.json();
          if (data.state === 'open') {
            setStatus('CONNECTED');
            setIsModalOpen(false); // Close automatically when connected!
          }
        } catch(e) {}
      }, 5000);
    }
    return () => clearInterval(modalInterval);
  }, [isModalOpen, status, codusur]);


  if (status === 'NOT_CONFIGURED') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-sm">
        <Smartphone size={16} />
        <span>WhatsApp não configurado</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {status === 'LOADING' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-sm">
            <RefreshCw size={16} className="animate-spin" />
            <span>Verificando conexão...</span>
          </div>
        )}
        
        {status === 'CONNECTED' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
            <Smartphone size={16} />
            <span>WhatsApp Conectado</span>
          </div>
        )}

        {(status === 'DISCONNECTED' || status === 'ERROR') && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 text-sm font-medium">
            <Smartphone size={16} />
            <span>WhatsApp Desconectado</span>
            <button 
              onClick={handleConnect}
              className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 hover:bg-rose-200 dark:bg-rose-800 dark:hover:bg-rose-700 text-rose-800 dark:text-rose-200 transition-colors"
            >
              <QrCode size={14} />
              Conectar
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-sm w-full p-6 shadow-xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>

            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone className="text-emerald-600 dark:text-emerald-400" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
                Conectar WhatsApp
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Abra o WhatsApp no seu celular, vá em "Aparelhos conectados" e aponte a câmera para o QR Code abaixo.
              </p>

              <div className="flex justify-center mb-6 min-h-[256px] items-center bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                {qrCode ? (
                  <img 
                    src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`} 
                    alt="WhatsApp QR Code" 
                    className="w-full h-auto max-w-[256px]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <RefreshCw size={24} className="animate-spin" />
                    <span className="text-sm font-medium">Gerando QR Code...</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400">
                Aguardando leitura... Esta janela fechará automaticamente.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

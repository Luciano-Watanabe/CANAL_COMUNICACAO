import { useState, useEffect } from 'react';
import { UserX, Clock, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { usePrivacy } from '../contexts/PrivacyContext';

export const RadarPositivacao = ({ user }: { user: any }) => {
  const { maskData } = usePrivacy();
  const [esquecidos, setEsquecidos] = useState<any[]>([]);
  const [diasFiltro, setDiasFiltro] = useState(30);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchEsquecidos = async (currentPage: number) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clientes/esquecidos?codusur=${user.matricula}&role=${user.role}&dias=${diasFiltro}&page=${currentPage}&limit=50`);
      const data = await res.json();
      if (data.success) {
        if (currentPage === 1) {
          setEsquecidos(data.esquecidos);
        } else {
          setEsquecidos(prev => [...prev, ...data.esquecidos]);
        }
        setHasMore(data.esquecidos.length === 50);
      }
    } catch (e) {
      console.error('Erro ao buscar esquecidos', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchEsquecidos(1);
  }, [user, diasFiltro]);

  useEffect(() => {
    if (page > 1) {
      fetchEsquecidos(page);
    }
  }, [page]);



  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={24} />
          Radar de Positivação
        </h2>
        <select 
          value={diasFiltro}
          onChange={(e) => setDiasFiltro(Number(e.target.value))}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value={15}>&gt; 15 dias</option>
          <option value={30}>&gt; 30 dias</option>
          <option value={60}>&gt; 60 dias</option>
          <option value={90}>&gt; 90 dias</option>
        </select>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Clientes inativos (sem pedido ou conversa)
      </p>

      {loading && page === 1 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Carregando...</div>
      ) : esquecidos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
          <UserX size={32} className="mb-2 opacity-50" />
          <p className="text-sm">Parabéns! Nenhum cliente esquecido na régua de {diasFiltro} dias.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[400px]">
          {esquecidos.map((cli, idx) => (
            <div key={`${cli.codcli}-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-sm flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate" title={cli.cliente}>
                  {cli.codcli} - {maskData(cli.cliente)}
                </h4>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">Vend: {maskData(cli.vendedor)}</p>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className={clsx(
                  "font-black text-lg leading-none",
                  cli.diasCompra > 90 ? "text-red-600 dark:text-red-400" :
                  cli.diasCompra > 60 ? "text-orange-500" :
                  "text-amber-500"
                )}>
                  {cli.diasCompra}
                </span>
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1 mt-1">
                  <Clock size={10} /> dias
                </span>
              </div>
            </div>
          ))}
          {loading && page > 1 && (
            <div className="py-2 text-center text-slate-400 text-xs">Carregando mais...</div>
          )}
          {!loading && (
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore}
              className="py-2 mt-2 w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {hasMore ? "Carregar mais (+50 registros)" : "Todos os registros carregados"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

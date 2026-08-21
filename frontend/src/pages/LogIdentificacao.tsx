import { useState, useEffect } from 'react';
import { Search, ShieldAlert } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

export default function LogIdentificacao() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const { maskData } = usePrivacy();

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sac/logs-identificacao');
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(l => 
    (l.telefone || '').includes(filterText) ||
    (l.documento || '').includes(filterText) ||
    (l.nomeCliente || '').toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ShieldAlert className="text-primary-500" /> Logs de Identificação
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Histórico de tentativas de identificação de clientes no SAC.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por telefone ou CNPJ..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 dark:text-slate-200 w-64"
            />
          </div>
          <button onClick={fetchLogs} className="px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors shadow-sm shadow-primary-500/20">
            Atualizar
          </button>
        </div>
      </div>

      <div className="glass-card flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Data/Hora</th>
                <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Telefone</th>
                <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Documento Informado</th>
                <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Status</th>
                <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Cliente Localizado</th>
                <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">Opção Acessada</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Carregando logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nenhum log de identificação encontrado.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                      {new Date(log.data).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                      {maskData(log.telefone)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {maskData(log.documento)}
                    </td>
                    <td className="py-3 px-4">
                      {log.codcli ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Sucesso
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                          Não Encontrado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                      {log.codcli ? (
                        <div>
                          <span className="font-medium">{maskData(log.nomeCliente)}</span>
                          <span className="text-slate-400 ml-1">({log.codcli})</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                      {log.opcao || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

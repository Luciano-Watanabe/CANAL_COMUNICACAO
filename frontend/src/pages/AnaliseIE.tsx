import { useState, useEffect } from 'react';
import { Search, Building, RefreshCw, BarChart2 } from 'lucide-react';

export default function AnaliseIE() {
  const [analises, setAnalises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedRca, setSelectedRca] = useState<string>('');
  const [status, setStatus] = useState({ total: 0, analisados: 0, ativas: 0, comProblema: 0 });

  const fetchDados = async () => {
    setLoading(true);
    try {
      const url = selectedRca ? `/api/analise-ie?rca=${selectedRca}` : `/api/analise-ie`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAnalises(data.analises || []);
      }
      
      const resStatus = await fetch('/api/analise-ie/status');
      const dataStatus = await resStatus.json();
      if (dataStatus.success) {
        setStatus({ 
            total: dataStatus.totalAnalisados || 0, 
            analisados: dataStatus.totalAnalisados || 0,
            ativas: dataStatus.ativas || 0,
            comProblema: dataStatus.comProblema || 0
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendedores = async () => {
    try {
      const url = `/api/vendedores?role=BOT_GESTOR`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setVendedores(data.vendedores || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchVendedores();
    fetchDados();
    
    const interval = setInterval(() => {
      fetchDados();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [selectedRca]);

  const handleReconsultar = async (analise: any) => {
    try {
      const res = await fetch('/api/analise-ie/reconsultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            codcli: analise.codcli, 
            cnpj: analise.cnpj, 
            ie_sistema: analise.ie_sistema, 
            uf_sistema: analise.uf_sistema 
        })
      });
      
      const data = await res.json();
      if (data.success) {
        alert('Consulta atualizada com sucesso!\nNova Situação: ' + data.analise.situacao);
        fetchDados();
      } else {
        alert('Erro: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro na requisição.');
    }
  };

  const filteredAnalises = analises.filter(a => {
    const term = searchTerm.toLowerCase();
    return (
      (a.cliente || '').toLowerCase().includes(term) ||
      (a.cnpj || '').includes(term) ||
      (a.ie_sistema || '').includes(term) ||
      String(a.codcli).includes(term)
    );
  });

  const getStatusBadge = (statusStr: string) => {
    if (statusStr.includes('ATIVA')) {
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{statusStr}</span>;
    }
    if (statusStr.includes('BAIXADA')) {
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">{statusStr}</span>;
    }
    if (statusStr.includes('DESATUALIZADA')) {
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">{statusStr}</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">{statusStr}</span>;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center">
            <Building className="mr-3 text-primary-600" />
            Análise de Inscrição Estadual (IE)
          </h1>
          <p className="text-slate-500 mt-2">
            Monitoramento automático da situação da I.E. de seus clientes.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col pr-4 border-r border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500">Total Analisados</span>
            <div className="text-2xl font-bold text-primary-600">
              {status.analisados}
            </div>
          </div>
          <div className="flex flex-col pr-4 border-r border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500">Com Problemas</span>
            <div className="text-2xl font-bold text-rose-600">
              {status.comProblema}
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-500">IEs Ativas</span>
            <div className="text-2xl font-bold text-emerald-600">
              {status.ativas}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por nome, código, CNPJ ou IE..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm text-slate-700 dark:text-slate-300"
            />
          </div>

          <div className="flex gap-4 w-full sm:w-auto">
            <select
              value={selectedRca}
              onChange={(e) => setSelectedRca(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos os Vendedores</option>
              {vendedores.map(v => (
                <option key={v.CODUSUR} value={v.CODUSUR}>{v.CODUSUR} - {v.NOME}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Cod.</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">CNPJ</th>
                <th className="px-6 py-4 font-medium">IE Sistema (UF)</th>
                <th className="px-6 py-4 font-medium">Situação IE</th>
                <th className="px-6 py-4 font-medium">IE Nova Sugerida</th>
                <th className="px-6 py-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando análises...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAnalises.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <BarChart2 className="w-10 h-10 opacity-50 text-primary-400" />
                      <span className="text-lg">Nenhuma análise problemática encontrada</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAnalises.map((a, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">{a.codcli}</td>
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{a.cliente}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">{a.cnpj}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">{a.ie_sistema} ({a.uf_sistema})</td>
                    <td className="px-6 py-4">{getStatusBadge(a.situacao)}</td>
                    <td className="px-6 py-4 font-bold text-amber-600 dark:text-amber-500">{a.ie_nova || '-'}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleReconsultar(a)}
                        className="p-1.5 bg-primary-50 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 rounded hover:bg-primary-100 dark:hover:bg-primary-500/40 transition-colors inline-flex items-center gap-2"
                        title="Reconsultar IE"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-xs font-medium">Consultar</span>
                      </button>
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

import { useState, useEffect } from 'react';
import { Search, Building, RefreshCw, BarChart2, Save } from 'lucide-react';

export default function AnaliseCNPJ() {
  const [analises, setAnalises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedRca, setSelectedRca] = useState<string>('');
  const [selectedSituacao, setSelectedSituacao] = useState<string>('');
  const [novosVendedores, setNovosVendedores] = useState<Record<number, string>>({});
  const [status, setStatus] = useState({ total: 0, analisados: 0 });

  const situacoesCNPJ = ['ATIVA', 'BAIXADA', 'INAPTA', 'SUSPENSA', 'NULA', 'NAO_ENCONTRADO', 'CNPJ INVALIDO/NAO ENCONTRADO', 'CNPJ_INVALIDO', 'RATE_LIMIT', 'ERRO'];

  const fetchDados = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRca) params.set('rca', selectedRca);
      if (selectedSituacao) params.set('situacao', selectedSituacao);
      const url = `/api/analise-cnpj?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAnalises(data.analises || []);
      }
      
      const resStatus = await fetch('/api/analise-cnpj/status');
      const dataStatus = await resStatus.json();
      if (dataStatus.success) {
        setStatus({ total: dataStatus.total, analisados: dataStatus.analisados });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendedores = async () => {
    try {
      // Força a busca de TODOS os vendedores para a troca, ignorando hierarquia
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
  }, [selectedRca, selectedSituacao]);

  const handleAlterarVendedor = async (codcli: number) => {
    const novoCodusur = novosVendedores[codcli];
    if (!novoCodusur) return;

    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      
      const res = await fetch('/api/analise-cnpj/alterar-vendedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codcli,
          novoCodusur,
          usuarioLogado: user?.nome || user?.matricula || 'DESCONHECIDO'
        })
      });
      
      const data = await res.json();
      if (data.success) {
        alert('Vendedor alterado com sucesso!');
        fetchDados(); // Atualiza a lista
      } else {
        alert('Erro ao alterar vendedor: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro na requisição.');
    }
  };

  const handleReconsultar = async (codcli: number, cnpj: string) => {
    try {
      const res = await fetch('/api/analise-cnpj/reconsultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codcli, cnpj })
      });
      
      const data = await res.json();
      if (data.success) {
        alert('Consulta realizada com sucesso: ' + data.novaSituacao);
        fetchDados(); // Atualiza a lista
      } else {
        alert('Erro ao reconsultar: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro na requisição.');
    }
  };

  const filteredAnalises = analises.filter(a => {
    const s = searchTerm.toLowerCase();
    return (
      (a.cliente && a.cliente.toLowerCase().includes(s)) ||
      (a.fantasia && a.fantasia.toLowerCase().includes(s)) ||
      (a.cnpj && a.cnpj.includes(s)) ||
      (a.codcli && String(a.codcli).includes(s)) ||
      (a.situacao && a.situacao.toLowerCase().includes(s))
    );
  });

  const getStatusBadge = (statusStr: string) => {
    if (!statusStr) return <span className="text-gray-400">-</span>;
    if (statusStr === 'ATIVA') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">{statusStr}</span>;
    if (statusStr === 'BAIXADA') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">{statusStr}</span>;
    if (statusStr === 'INAPTA') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">{statusStr}</span>;
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">{statusStr}</span>;
  };

  const progresso = status.total > 0 ? Math.round((status.analisados / status.total) * 100) : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-3">
            <Building className="w-8 h-8 text-purple-400" />
            Análise de CNPJ
          </h1>
          <p className="text-gray-400 mt-1">
            Verificação automática da situação cadastral dos clientes na Receita Federal.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-[var(--sidebar-bg)] p-4 rounded-xl border border-[var(--border-color)]">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400">Progresso Geral</span>
            <span className="text-lg font-bold text-white">{status.analisados} / {status.total}</span>
          </div>
          <div className="w-32 bg-gray-800 rounded-full h-2.5 ml-2">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full" style={{ width: `${progresso}%` }}></div>
          </div>
          <span className="text-xs font-bold text-purple-400 ml-2">{progresso}%</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 bg-[var(--sidebar-bg)] p-4 rounded-xl border border-[var(--border-color)]">
        <select
          value={selectedRca}
          onChange={(e) => setSelectedRca(e.target.value)}
          className="w-full lg:w-64 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 text-gray-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
        >
          <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Todos os Vendedores</option>
          {vendedores.map((v) => (
            <option key={v.CODUSUR} value={v.CODUSUR} style={{ color: '#000', backgroundColor: '#fff' }}>
              {v.NOME}
            </option>
          ))}
        </select>
        <select
          value={selectedSituacao}
          onChange={(e) => setSelectedSituacao(e.target.value)}
          className="w-full lg:w-64 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 text-gray-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
        >
          <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Todas as Situações</option>
          {situacoesCNPJ.map((s) => (
            <option key={s} value={s} style={{ color: '#000', backgroundColor: '#fff' }}>
              {s}
            </option>
          ))}
        </select>
        
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ, código ou status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-2.5 text-gray-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          />
        </div>
        
        <button
          onClick={() => fetchDados()}
          className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors border border-slate-700"
        >
          <RefreshCw className="w-5 h-5" />
          Atualizar Lista
        </button>
      </div>

      <div className="bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="text-xs uppercase bg-black/40 text-gray-400 sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-6 py-4 font-medium">Cod.</th>
                <th className="px-6 py-4 font-medium">Cliente (Fantasia)</th>
                <th className="px-6 py-4 font-medium">Razão Social</th>
                <th className="px-6 py-4 font-medium">CNPJ</th>
                <th className="px-6 py-4 font-medium">Situação Cadastral</th>
                <th className="px-6 py-4 font-medium">Ações (CNPJ)</th>
                <th className="px-6 py-4 font-medium">Vendedor Atual</th>
                <th className="px-6 py-4 font-medium">Novo Vendedor</th>
                <th className="px-6 py-4 font-medium text-right">Data de Consulta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading && analises.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando análises...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAnalises.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <BarChart2 className="w-10 h-10 opacity-50 text-purple-400" />
                      <span className="text-lg">Nenhuma análise encontrada</span>
                      <span className="text-xs opacity-70">O sistema está consultando os CNPJs em segundo plano.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAnalises.map((a, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">{a.codcli}</td>
                    <td className="px-6 py-4 font-medium text-gray-200">{a.fantasia || a.cliente}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{a.cliente}</td>
                    <td className="px-6 py-4 font-mono text-gray-400">{a.cnpj}</td>
                    <td className="px-6 py-4">
                      {getStatusBadge(a.situacao)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleReconsultar(a.codcli, a.cnpj)}
                        className="p-1.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/40 transition-colors inline-flex items-center gap-2"
                        title="Reconsultar CNPJ"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-xs font-medium">Consultar</span>
                      </button>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-300">{a.nomeVendedor}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={novosVendedores[a.codcli] || ''}
                          onChange={(e) => setNovosVendedores(prev => ({ ...prev, [a.codcli]: e.target.value }))}
                          className="bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none w-32"
                        >
                          <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Selecione...</option>
                          {vendedores.map((v) => (
                            <option key={v.CODUSUR} value={v.CODUSUR} style={{ color: '#000', backgroundColor: '#fff' }}>
                              {v.NOME}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAlterarVendedor(a.codcli)}
                          disabled={!novosVendedores[a.codcli]}
                          className="p-1.5 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/40 disabled:opacity-50 transition-colors"
                          title="Salvar Novo Vendedor"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-400 text-xs">{a.data}</td>
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

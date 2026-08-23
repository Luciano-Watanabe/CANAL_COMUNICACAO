import { useState, useEffect } from 'react';
import { Users, MessageSquare, TrendingUp, Clock, Send, Megaphone, Trophy, X } from 'lucide-react';
import { ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WhatsAppMonitor } from '../components/WhatsAppMonitor';
import { useSocket } from '../contexts/SocketContext';
import { TeamRanking } from '../components/TeamRanking';
import { ProductRanking } from '../components/ProductRanking';
import { ClientRanking } from '../components/ClientRanking';
import { OrgChart } from '../components/OrgChart';
import { RadarPositivacao } from '../components/RadarPositivacao';
import { usePrivacy } from '../contexts/PrivacyContext';

export default function Dashboard() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [userName, setUserName] = useState('Usuário');
  const [userMatricula, setUserMatricula] = useState<number | null>(null);
  const { maskData } = usePrivacy();
  const [chartData, setChartData] = useState<any[]>([]);
  const [hierarquiaData, setHierarquiaData] = useState<any>(null);
  const [rankingData, setRankingData] = useState<any[]>([]);
  const [rankingMesData, setRankingMesData] = useState<any[]>([]);
  const [arvoreData, setArvoreData] = useState<any>(null);
  const [metricasCrossSell, setMetricasCrossSell] = useState<any[]>([]);

  const [rankingProdutosData, setRankingProdutosData] = useState<any[]>([]);
  const [rankingProdutosMesData, setRankingProdutosMesData] = useState<any[]>([]);
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [selectedDepto, setSelectedDepto] = useState<string>('');
  const [sacStats, setSacStats] = useState<any>(null);

  const [rankingClientesData, setRankingClientesData] = useState<any[]>([]);
  const [rankingClientesMesData, setRankingClientesMesData] = useState<any[]>([]);
  const [atividades, setAtividades] = useState<any[]>([]);
  const [selectedAtividade, setSelectedAtividade] = useState<string>('');

  const [supervisores, setSupervisores] = useState<any[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');

  const [avisos, setAvisos] = useState<any[]>([]);
  const [novoAvisoTexto, setNovoAvisoTexto] = useState('');
  const [userRole, setUserRole] = useState('');
  const { socket } = useSocket();
  const [activeKpiModal, setActiveKpiModal] = useState<string | null>(null);

  useEffect(() => {
    const fetchDados = async () => {
      try {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        if (user) {
          setUserName(maskData(user.nome || 'Usuário'));
          setUserMatricula(user.matricula);
          setUserRole(user.role?.toUpperCase() || '');
        }

        try {
          const resAvisos = await fetch('/api/avisos');
          const dataAvisos = await resAvisos.json();
          if (dataAvisos.success) setAvisos(dataAvisos.avisos);
        } catch (e) {}

        // Puxa a hierarquia primeiro (que traz também clientes e conversas dependendo do nível)
        try {
          const resHierarquia = await fetch(`/api/dashboard/hierarquia?codusur=${user.matricula}&role=${user.role || ''}`);
          const dataHierarquia = await resHierarquia.json();
          if (dataHierarquia.success) {
            setHierarquiaData(dataHierarquia.data);
          }
        } catch (e) {
          console.error('Erro hierarquia:', e);
        }
        if (user.role?.toUpperCase() === 'SUPERVISOR' || user.role?.toUpperCase() === 'GERENTE') {
          try {
            const resArvore = await fetch(`/api/dashboard/arvore?codusur=${user.matricula}&role=${user.role}&_t=${Date.now()}`);
            const dataArvore = await resArvore.json();
            if (dataArvore.success) setArvoreData(dataArvore.arvore);

            const resMetricas = await fetch(`/api/metricas/cross-sell/ranking`);
            const dataMetricas = await resMetricas.json();
            if (dataMetricas.success) setMetricasCrossSell(dataMetricas.ranking);
          } catch (e) {
            console.error('Erro ao buscar dados liderança:', e);
          }
        }

        const response = await fetch(`/api/clientes?codusur=${user.matricula}`);
        const data = await response.json();
        
        if (data.success) {
          setClientes(data.clientes);
        }

        const chartRes = await fetch(`/api/chat/chart?codusur=${user.matricula}`);
        const chartJson = await chartRes.json();
        if (chartJson.success) {
          setChartData(chartJson.chartData);
        }

        try {
          const resSac = await fetch('/api/sac/stats');
          if (resSac.ok) {
            setSacStats(await resSac.json());
          }
        } catch (e) {
          console.error('Erro stats SAC:', e);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchDados();
  }, [maskData]);

  useEffect(() => {
    if (!socket) return;
    const handleNovoAviso = (aviso: any) => {
      setAvisos(prev => [aviso, ...prev]);
    };
    socket.on('novo_aviso', handleNovoAviso);
    return () => {
      socket.off('novo_aviso', handleNovoAviso);
    };
  }, [socket]);

  useEffect(() => {
    if (!userMatricula) return;

    const fetchRankingEquipe = async () => {
      if (userRole === 'SUPERVISOR' || userRole === 'GERENTE' || userRole === 'VENDEDOR') {
        try {
          let url = `/api/dashboard/ranking?codusur=${userMatricula}&role=${userRole}`;
          if (selectedSupervisor) url += `&supervisor=${selectedSupervisor}`;
          
          const resRanking = await fetch(url + `&_t=${Date.now()}`);
          const dataRanking = await resRanking.json();
          if (dataRanking.success) setRankingData(dataRanking.ranking);

          const resRankingMes = await fetch(url + `&periodo=mes&_t=${Date.now()}`);
          const dataRankingMes = await resRankingMes.json();
          if (dataRankingMes.success) {
            setRankingMesData(dataRankingMes.ranking);
            if (userRole === 'GERENTE' && !selectedSupervisor) {
              const uniqueSups = Array.from(new Set(dataRankingMes.ranking.map((r: any) => r.codsupervisor)))
                .filter(Boolean)
                .map(codsup => {
                  const item = dataRankingMes.ranking.find((r: any) => r.codsupervisor === codsup);
                  return { codsupervisor: item.codsupervisor, nome_supervisor: item.nome_supervisor };
                });
              setSupervisores(uniqueSups);
            }
          }
        } catch (e) {
          console.error('Erro ao buscar dados de ranking de equipe:', e);
        }
      }
    };
    fetchRankingEquipe();

    const fetchProdutos = async () => {
      try {
        let url = `/api/dashboard/ranking-produtos?codusur=${userMatricula}&role=${userRole}`;
        if (selectedDepto) url += `&departamento=${selectedDepto}`;
        
        const resHoje = await fetch(url + `&_t=${Date.now()}`);
        const dataHoje = await resHoje.json();
        if (dataHoje.success) setRankingProdutosData(dataHoje.ranking);

        const resMes = await fetch(url + `&periodo=mes&_t=${Date.now()}`);
        const dataMes = await resMes.json();
        if (dataMes.success) {
          setRankingProdutosMesData(dataMes.ranking);
          if (!selectedDepto) {
            const uniqueDeptos = Array.from(new Set(dataMes.ranking.map((r: any) => r.codepto)))
              .filter(Boolean)
              .map(codepto => {
                const item = dataMes.ranking.find((r: any) => r.codepto === codepto);
                return { codepto: item.codepto, descricao: item.depto_desc };
              });
            setDepartamentos(uniqueDeptos);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchProdutos();

    const fetchClientesRanking = async () => {
      try {
        let url = `/api/dashboard/ranking-clientes?codusur=${userMatricula}&role=${userRole}`;
        if (selectedAtividade) url += `&atividade=${selectedAtividade}`;
        
        const resHoje = await fetch(url + `&_t=${Date.now()}`);
        const dataHoje = await resHoje.json();
        if (dataHoje.success) setRankingClientesData(dataHoje.ranking);

        const resMes = await fetch(url + `&periodo=mes&_t=${Date.now()}`);
        const dataMes = await resMes.json();
        if (dataMes.success) {
          setRankingClientesMesData(dataMes.ranking);
          if (!selectedAtividade) {
            const uniqueAtivs = Array.from(new Set(dataMes.ranking.map((r: any) => r.codativ)))
              .filter(Boolean)
              .map(codativ => {
                const item = dataMes.ranking.find((r: any) => r.codativ === codativ);
                return { codativ: item.codativ, ramo: item.ramo };
              });
            setAtividades(uniqueAtivs);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchClientesRanking();
  }, [userMatricula, userRole, selectedDepto, selectedAtividade, selectedSupervisor]);

  const handlePublicarAviso = async () => {
    if (!novoAvisoTexto.trim()) return;
    try {
      const res = await fetch('/api/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: novoAvisoTexto,
          codusur_remetente: userMatricula,
          nome_remetente: userName,
          cargo_remetente: userRole
        })
      });
      const data = await res.json();
      if (data.success) {
        setNovoAvisoTexto('');
      } else {
        alert('Erro ao publicar aviso');
      }
    } catch (e) {
      console.error(e);
    }
  };

  let stats = [];

  if (userRole === 'GERENTE') {
    stats = [
      { label: 'Supervisores da Região', value: hierarquiaData?.supervisores || 0, icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
      { label: 'Vendedores Ativos', value: hierarquiaData?.vendedores || 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Total de Clientes', value: hierarquiaData?.clientes || 0, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: 'Conversas Hoje', value: hierarquiaData?.conversas || 0, icon: MessageSquare, color: 'text-amber-500', bg: 'bg-amber-500/10' }
    ];
  } else if (userRole === 'SUPERVISOR') {
    stats = [
      { label: 'Minha Equipe (Vendedores)', value: hierarquiaData?.vendedores || 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Clientes da Equipe', value: hierarquiaData?.clientes || 0, icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
      { label: 'Conversas da Equipe Hoje', value: hierarquiaData?.conversas || 0, icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: 'Tempo Médio', value: '--', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' }
    ];
  } else {
    stats = [
      { label: 'Clientes na Carteira', value: hierarquiaData?.clientes || clientes.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Conversas Hoje', value: hierarquiaData?.conversas || 0, icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: 'Tempo Médio', value: '--', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
      { label: 'Vendas via Chat', value: 'R$ 0,00', icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    ];
  }

  const ultimosClientes = clientes.slice(0, 3);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              Olá, {userName}!
            </span>
            <span>👋</span>
          </h1>
          <p className="text-slate-500 mt-2">Acompanhe seus indicadores de atendimento e vendas de hoje.</p>
        </div>
        {userMatricula && <WhatsAppMonitor codusur={userMatricula} />}
      </div>

      {sacStats && (
        <>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mt-8 mb-4">Métricas SAC</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="glass-card p-6 flex items-center justify-between animate-slide-up cursor-pointer hover:shadow-md border border-transparent hover:border-primary-500/30 transition-all" onClick={() => setActiveKpiModal('TOTAL')} style={{ animationDelay: '0ms' }}>
              <div>
                <p className="text-slate-500 font-medium text-sm">Total Tickets (Geral)</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{(sacStats.totalAbertos || 0) + (sacStats.resolvidosHoje || 0)}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary-500/10 text-primary-500">
                <MessageSquare size={28} />
              </div>
            </div>
            <div className="glass-card p-6 flex items-center justify-between animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div>
                <p className="text-slate-500 font-medium text-sm">Tickets Abertos</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{sacStats.totalAbertos}</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
                <MessageSquare size={28} />
              </div>
            </div>
            <div className="glass-card p-6 flex items-center justify-between animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div>
                <p className="text-slate-500 font-medium text-sm">Resolvidos Hoje</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{sacStats.resolvidosHoje}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                <Trophy size={28} />
              </div>
            </div>
            <div className="glass-card p-6 flex items-center justify-between animate-slide-up cursor-pointer hover:shadow-md border border-transparent hover:border-amber-500/30 transition-all" onClick={() => setActiveKpiModal('AVALIACAO')} style={{ animationDelay: '300ms' }}>
              <div>
                <p className="text-slate-500 font-medium text-sm">Avaliação Média</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{sacStats.mediaAvaliacao} ⭐</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                <TrendingUp size={28} />
              </div>
            </div>
            <div className="glass-card p-6 flex items-center justify-between animate-slide-up cursor-pointer hover:shadow-md border border-transparent hover:border-blue-500/30 transition-all" onClick={() => setActiveKpiModal('SLA')} style={{ animationDelay: '400ms' }}>
              <div>
                <p className="text-slate-500 font-medium text-sm">SLA Médio</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{sacStats.slaHoras} h</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                <Clock size={28} />
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="glass-card p-6 animate-slide-up cursor-pointer hover:shadow-md border border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-all" onClick={() => setActiveKpiModal('VOLUME')} style={{ animationDelay: '500ms' }}>
              <h3 className="font-semibold text-lg text-slate-800 dark:text-white mb-4 flex items-center gap-2">Volume por Departamento <span className="text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Ver + KPIs</span></h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sacStats.volumeDepartamento}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="nome" tick={{fill: '#64748b'}} />
                    <YAxis tick={{fill: '#64748b'}} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff'}} />
                    <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: '600ms' }}>
              <h3 className="font-semibold text-lg text-slate-800 dark:text-white mb-4">Top 5 Clientes (Tickets)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sacStats.topClientes} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis type="number" tick={{fill: '#64748b'}} />
                    <YAxis dataKey="nome" type="category" width={100} tick={{fontSize: 11, fill: '#64748b'}} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff'}} />
                    <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="glass-card p-6 flex items-center justify-between animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
              <div>
                <p className="text-slate-500 font-medium text-sm">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <Icon size={28} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
          <h3 className="font-semibold text-lg text-slate-800 dark:text-white mb-4">Meus Clientes Recentes</h3>
          <div className="space-y-4">
            {ultimosClientes.length > 0 ? (
              ultimosClientes.map((c, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-700/50">
                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 shrink-0">
                    {c.cliente?.substring(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate text-slate-800 dark:text-slate-200">{maskData(c.cliente)}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{c.telefone ? maskData(c.telefone) : 'Sem WhatsApp'}</p>
                  </div>
                  <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.bloqueio === 'S' || c.bloqueio === 'X' ? 'text-rose-500 bg-rose-500/10' : 'text-emerald-500 bg-emerald-500/10'}`}>
                    {c.bloqueio === 'S' || c.bloqueio === 'X' ? 'Bloqueado' : 'Ativo'}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm">Nenhum cliente na carteira.</p>
            )}
          </div>
        </div>
        
        <div className="glass-card p-6 animate-slide-up flex flex-col" style={{ animationDelay: '500ms' }}>
          <h3 className="font-semibold text-lg text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Megaphone size={20} className="text-amber-500" />
            Mural de Avisos
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 max-h-64 custom-scrollbar">
            {avisos.length > 0 ? (
              avisos.map((aviso) => (
                <div key={aviso.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">
                      {maskData(aviso.nome_remetente)} <span className="text-xs text-slate-400 font-normal ml-1">({aviso.cargo_remetente})</span>
                    </h4>
                    <span className="text-xs text-slate-400">
                      {new Date(aviso.data_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{aviso.texto}</p>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                <MessageSquare size={48} className="mb-4" />
                <p>Nenhum aviso no momento.</p>
              </div>
            )}
          </div>

          {(userRole === 'SUPERVISOR' || userRole === 'GERENTE') && (
            <div className="mt-auto border-t border-slate-100 dark:border-slate-700 pt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo aviso para a equipe..."
                  value={novoAvisoTexto}
                  onChange={(e) => setNovoAvisoTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePublicarAviso()}
                  className="flex-1 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button 
                  onClick={handlePublicarAviso}
                  className="bg-primary-500 text-white p-2 rounded-lg hover:bg-primary-600 transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {userRole !== 'VENDEDOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Trophy className="text-amber-500" size={24} />
              Ranking de Vendas (Hoje)
            </h2>
            <TeamRanking ranking={rankingData} />
          </div>

          <div className="glass-card rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Trophy className="text-amber-500" size={24} />
                Ranking de Vendas (Mês Corrente)
              </h2>
              {userRole === 'GERENTE' && (
                <select
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Todos os Supervisores</option>
                  {supervisores.map(s => (
                    <option key={s.codsupervisor} value={s.codsupervisor}>{maskData(s.nome_supervisor)}</option>
                  ))}
                </select>
              )}
            </div>
            <TeamRanking ranking={rankingMesData} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="text-amber-500" size={24} />
              {userRole === 'VENDEDOR' ? 'Meus Clientes (Hoje)' : 'Ranking de Clientes (Hoje)'}
            </h2>
          </div>
          <ClientRanking ranking={rankingClientesData} />
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="text-amber-500" size={24} />
              {userRole === 'VENDEDOR' ? 'Meus Clientes (Mês Corrente)' : 'Ranking de Clientes (Mês Corrente)'}
            </h2>
            <select
              value={selectedAtividade}
              onChange={(e) => setSelectedAtividade(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas as Atividades</option>
              {atividades.map(a => (
                <option key={a.codativ} value={a.codativ}>{a.ramo}</option>
              ))}
            </select>
          </div>
          <ClientRanking ranking={rankingClientesMesData} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="text-primary-500" size={24} />
              Ranking de Produtos (Hoje)
            </h2>
          </div>
          <ProductRanking ranking={rankingProdutosData} />
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="text-primary-500" size={24} />
              Ranking de Produtos (Mês Corrente)
            </h2>
            <select
              value={selectedDepto}
              onChange={(e) => setSelectedDepto(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos os Departamentos</option>
              {departamentos.map(d => (
                <option key={d.codepto} value={d.codepto}>{d.descricao}</option>
              ))}
            </select>
          </div>
          <ProductRanking ranking={rankingProdutosMesData} />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 mt-8">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Atividade de Hoje por Hora</h2>
        <div className="h-80 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="hora" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar yAxisId="left" dataKey="contatos" name="Contatos (Números)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="clientes" name="Clientes (CNPJ/CPF)" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line yAxisId="right" type="monotone" dataKey="mensagens" name="Total de Mensagens" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-slate-400">
              Sem dados de conversas hoje para exibir.
            </div>
          )}
        </div>
      </div>

      {(userRole === 'SUPERVISOR' || userRole === 'GERENTE') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="glass-card rounded-2xl p-6 lg:col-span-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Adesão ao Mix (Cross-Sell)</h2>
            <div className="space-y-4">
              {metricasCrossSell.length > 0 ? (
                metricasCrossSell.map((m, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Vend. {m.codusur}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${Math.min((m.count / 20) * 100, 100)}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{m.count} adições</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400 text-center py-4">Nenhuma métrica registrada hoje.</div>
              )}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 lg:col-span-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Visão Hierárquica</h2>
            <OrgChart data={arvoreData} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 mt-8">
        <div className="glass-card rounded-2xl p-6">
          <RadarPositivacao user={{ matricula: userMatricula, role: userRole }} />
        </div>
      </div>

      {activeKpiModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                {activeKpiModal === 'TOTAL' && <><MessageSquare className="text-primary-500" /> Indicadores de Resolução (Geral)</>}
                {activeKpiModal === 'SLA' && <><Clock className="text-blue-500" /> Indicadores de Tempo (SLA)</>}
                {activeKpiModal === 'AVALIACAO' && <><TrendingUp className="text-amber-500" /> Indicadores de Qualidade e Satisfação</>}
                {activeKpiModal === 'VOLUME' && <><TrendingUp className="text-primary-500" /> Indicadores Operacionais e Volume</>}
              </h2>
              <button onClick={() => setActiveKpiModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {activeKpiModal === 'TOTAL' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">Taxa de Resolução Mensal</h3>
                       <p className="text-2xl font-bold text-emerald-500 mt-2">{sacStats.taxaResolucao || 0}%</p>
                       <p className="text-xs text-slate-500 mt-1">Total de chamados finalizados vs abertos no mês</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">FCR / Taxa de Reabertura</h3>
                       <p className="text-sm font-medium text-slate-500 mt-2">Dados insuficientes</p>
                       <p className="text-xs text-slate-500 mt-1">Requer análise aprofundada de mensagens</p>
                    </div>
                 </div>
              )}
              {activeKpiModal === 'SLA' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">Tempo Médio de Resolução (TMR)</h3>
                       <p className="text-2xl font-bold text-blue-500 mt-2">{sacStats.slaHoras || 0} h</p>
                       <p className="text-xs text-slate-500 mt-1">Vida útil do ticket até ser fechado</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">TME / TMA</h3>
                       <p className="text-sm font-medium text-slate-500 mt-2">Dados insuficientes</p>
                       <p className="text-xs text-slate-500 mt-1">Requer análise de timestamp por mensagem</p>
                    </div>
                 </div>
              )}
              {activeKpiModal === 'AVALIACAO' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">CSAT (Customer Satisfaction Score)</h3>
                       <p className="text-2xl font-bold text-amber-500 mt-2">{sacStats.mediaAvaliacao || 'N/A'}/10</p>
                       <p className="text-xs text-slate-500 mt-1">Satisfação geral do cliente no mês</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">NPS (Net Promoter Score)</h3>
                       <p className="text-2xl font-bold text-emerald-500 mt-2">{sacStats.npsScore || 0}</p>
                       <p className="text-xs text-slate-500 mt-1">Promotores (9-10) - Detratores (0-6)</p>
                    </div>
                 </div>
              )}
              {activeKpiModal === 'VOLUME' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 col-span-1 md:col-span-2">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Volume de Tickets por Departamento</h3>
                       <div className="h-40">
                         <ResponsiveContainer width="100%" height="100%">
                           <BarChart data={sacStats.volumeDepartamento || []}>
                             <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                             <XAxis dataKey="nome" tick={{fill: '#64748b', fontSize: 10}} />
                             <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff'}} />
                             <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                           </BarChart>
                         </ResponsiveContainer>
                       </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">Tickets Criados Hoje</h3>
                       <p className="text-2xl font-bold text-indigo-500 mt-2">{sacStats.criadosHoje || 0}</p>
                       <p className="text-xs text-slate-500 mt-1">Volume de novos atendimentos no dia</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">Backlog do Dia</h3>
                       <p className="text-2xl font-bold text-amber-500 mt-2">
                          {sacStats.backlogDia > 0 ? '+' : ''}{sacStats.backlogDia || 0}
                       </p>
                       <p className="text-xs text-slate-500 mt-1">Tickets criados - resolvidos hoje</p>
                    </div>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

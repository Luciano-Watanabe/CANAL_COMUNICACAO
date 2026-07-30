import { useState, useEffect } from 'react';
import { Save, Search, Trash2, Calendar, Map as MapIcon, Car, MessageCircle, Phone, Mail, Check, Send, Settings, X } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { MapModal } from '../components/MapModal';

const INTERACOES = [
  { id: 'PRESENCIAL', label: 'Presencial', icon: Car, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' },
  { id: 'WHATS', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-500 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' },
  { id: 'TELEFONE', label: 'Telefone', icon: Phone, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' },
  { id: 'EMAIL', label: 'E-mail', icon: Mail, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800' },
];

const DIAS_SEMANA = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA'];
const DIAS_LABEL = {
  SEGUNDA: 'Segunda-feira',
  TERCA: 'Terça-feira',
  QUARTA: 'Quarta-feira',
  QUINTA: 'Quinta-feira',
  SEXTA: 'Sexta-feira'
};

export default function Rotas() {
  const {} = usePrivacy();
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  
  const [rotas, setRotas] = useState<Record<string, any[]>>({
    SEGUNDA: [], TERCA: [], QUARTA: [], QUINTA: [], SEXTA: []
  });
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [desempenho, setDesempenho] = useState<{
    semana: { agendadas: number, realizadas: number, nfs: number },
    mes: { agendadas: number, realizadas: number, nfs: number }
  } | null>(null);

  const [analiseModalOpen, setAnaliseModalOpen] = useState(false);
  const [analiseData, setAnaliseData] = useState<{ cliente: any, isSugestao: boolean, dados: any[] } | null>(null);
  const [loadingAnalise, setLoadingAnalise] = useState(false);

  const [agendarModal, setAgendarModal] = useState<{ cliente: any, isSugestao: boolean } | null>(null);
  const [agendarForm, setAgendarForm] = useState({ dia: 'SEGUNDA', interacao: 'PRESENCIAL' });

  const [mapModalDia, setMapModalDia] = useState<string | null>(null);
  const [vendedorInfo, setVendedorInfo] = useState<any>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Controle do dropdown de pesquisa
  const [activeDay, setActiveDay] = useState<string | null>(null);

  // Configurações
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('rotas_config');
    if (saved) return JSON.parse(saved);
    return {
      tipoMensagem: 'CONFIRMACAO',
      mensagemPadrao: 'Olá, confirmo nossa visita agendada para hoje. Até logo!'
    };
  });

  const TIPOS_MENSAGEM = [
    { id: 'CONFIRMACAO', label: 'Confirmação de Visita', template: 'Olá, confirmo nossa visita agendada para hoje. Até logo!' },
    { id: 'AVISO', label: 'Aviso de Chegada', template: 'Olá, estou a caminho para nossa reunião!' },
    { id: 'REAGENDAMENTO', label: 'Reagendamento', template: 'Olá, ocorreu um imprevisto. Podemos reagendar nossa visita de hoje?' }
  ];

  useEffect(() => {
    localStorage.setItem('rotas_config', JSON.stringify(config));
  }, [config]);

  const handleConfigTipoChange = (novoTipoId: string) => {
    const tipo = TIPOS_MENSAGEM.find(t => t.id === novoTipoId);
    if (tipo) {
      setConfig({ ...config, tipoMensagem: novoTipoId, mensagemPadrao: tipo.template });
    }
  };

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isGestor = ['BOT_GESTOR', 'GERENTE', 'SUPERVISOR'].includes(user?.role?.toUpperCase());

  useEffect(() => {
    fetchVendedores();
  }, []);

  useEffect(() => {
    if (selectedVendedor) {
      fetchRotas(selectedVendedor);
      fetchDesempenho(selectedVendedor);
      fetchSugestoes(selectedVendedor);
    } else {
      setRotas({ SEGUNDA: [], TERCA: [], QUARTA: [], QUINTA: [], SEXTA: [] });
      setDesempenho(null);
      setSugestoes([]);
    }
  }, [selectedVendedor]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.length >= 3 && selectedVendedor) {
        searchClientes(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, selectedVendedor]);

  const fetchVendedores = async () => {
    try {
      const url = user ? `/api/vendedores?codusur=${user.matricula}&role=${user.role}` : '/api/vendedores';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setVendedores(data.vendedores);
      }
    } catch (err) {
      console.error('Erro ao buscar vendedores:', err);
    }
  };

  const fetchRotas = async (codusur: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rotas/${codusur}`);
      const data = await res.json();
      if (data.success) {
        setRotas({
            SEGUNDA: data.rotas.SEGUNDA || [],
            TERCA: data.rotas.TERCA || [],
            QUARTA: data.rotas.QUARTA || [],
            QUINTA: data.rotas.QUINTA || [],
            SEXTA: data.rotas.SEXTA || []
        });
        setVendedorInfo(data.vendedor);
      }
    } catch (err) {
      console.error('Erro ao buscar rotas:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDesempenho = async (codusur: string) => {
    try {
      const res = await fetch(`/api/rotas/desempenho/${codusur}`);
      const data = await res.json();
      if (data.success) {
        setDesempenho(data.desempenho);
      }
    } catch (err) {
      console.error('Erro ao buscar desempenho:', err);
    }
  };

  const fetchSugestoes = async (codusur: string) => {
    try {
      const res = await fetch(`/api/rotas/sugestoes/${codusur}`);
      const data = await res.json();
      if (data.success) {
        setSugestoes(data.sugestoes || []);
      }
    } catch (err) {
      console.error('Erro ao buscar sugestões:', err);
    }
  };

  const handleOpenAnalise = async (cliente: any, isSugestao: boolean = true) => {
    setAnaliseModalOpen(true);
    setAnaliseData({ cliente, isSugestao, dados: [] });
    setLoadingAnalise(true);
    try {
      const res = await fetch(`/api/rotas/analise/${cliente.codcli}`);
      const data = await res.json();
      if (data.success) {
        setAnaliseData({ cliente, isSugestao, dados: data.analise });
      }
    } catch (err) {
      console.error('Erro ao buscar análise:', err);
    } finally {
      setLoadingAnalise(false);
    }
  };

  const searchClientes = async (term: string) => {
    setSearching(true);
    try {
      let url = `/api/clientes?codusur=${user.matricula}&role=${user.role}&busca=${encodeURIComponent(term)}`;
      if (isGestor) url += `&vendedor=${selectedVendedor}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.clientes.slice(0, 15)); // Limitar 15 resultados no dropdown
      }
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    if (!selectedVendedor) return;
    setSaving(true);
    try {
      // Extrair apenas os dados necessarios
      const rotasPayload: Record<string, any[]> = {};
      DIAS_SEMANA.forEach(dia => {
        rotasPayload[dia] = rotas[dia].map(c => ({
          codcli: c.codcli || c.CODCLI,
          interacao: c.interacao || 'PRESENCIAL'
        }));
      });

      const res = await fetch(`/api/rotas/${selectedVendedor}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotas: rotasPayload })
      });
      const data = await res.json();
      if (data.success) {
        alert('Rota salva com sucesso!');
        fetchRotas(selectedVendedor);
      } else {
        alert('Erro ao salvar rota.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de comunicação com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const moveUp = (dia: string, index: number) => {
    if (index === 0) return;
    const newArr = [...rotas[dia]];
    const temp = newArr[index - 1];
    newArr[index - 1] = newArr[index];
    newArr[index] = temp;
    setRotas({ ...rotas, [dia]: newArr });
  };

  const moveDown = (dia: string, index: number) => {
    const newArr = [...rotas[dia]];
    if (index === newArr.length - 1) return;
    const temp = newArr[index + 1];
    newArr[index + 1] = newArr[index];
    newArr[index] = temp;
    setRotas({ ...rotas, [dia]: newArr });
  };

  const cycleInteracao = (dia: string, index: number) => {
    const newArr = [...rotas[dia]];
    const current = newArr[index].interacao || 'PRESENCIAL';
    const codcli = newArr[index].codcli || newArr[index].CODCLI;
    const currentIndex = INTERACOES.findIndex(i => i.id === current);
    
    let nextIndex = (currentIndex + 1) % INTERACOES.length;
    let attempts = 0;
    while(attempts < INTERACOES.length) {
      const nextInteracao = INTERACOES[nextIndex].id;
      const exists = newArr.some((c, i) => i !== index && (c.codcli === codcli || c.CODCLI === codcli) && (c.interacao || 'PRESENCIAL') === nextInteracao);
      if (!exists) break;
      nextIndex = (nextIndex + 1) % INTERACOES.length;
      attempts++;
    }
    
    if (attempts < INTERACOES.length) {
      newArr[index].interacao = INTERACOES[nextIndex].id;
      setRotas({ ...rotas, [dia]: newArr });
    } else {
      alert("O cliente já possui todas as interações neste dia.");
    }
  };

  const removeCliente = (dia: string, index: number) => {
    const novasRotas = { ...rotas };
    novasRotas[dia].splice(index, 1);
    setRotas(novasRotas);
  };

  const openMaps = (dia: string) => {
    const clientes = rotas[dia];
    if (!clientes || clientes.length === 0) {
      alert('Nenhum cliente agendado neste dia para traçar a rota.');
      return;
    }
    setMapModalDia(dia);
  };

  const handleApplyRoute = (novaOrdem: any[]) => {
    if (mapModalDia) {
      setRotas({ ...rotas, [mapModalDia]: novaOrdem });
      setMapModalDia(null);
    }
  };

  const dispararRota = async (dia: string) => {
    if (!selectedVendedor) {
      alert('Selecione um vendedor primeiro.');
      return;
    }
    const confirm = window.confirm(`Deseja enviar a rota presencial de ${DIAS_LABEL[dia as keyof typeof DIAS_LABEL]} para o WhatsApp do vendedor?`);
    if (!confirm) return;

    try {
      const res = await fetch(`/api/rotas/${selectedVendedor}/disparar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dia, clientes: rotas[dia] || [], config })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert(data.error || 'Erro ao enviar rota.');
      }
    } catch (err) {
      alert('Erro de comunicação com o servidor.');
    }
  };

  const addClienteToDia = (dia: string, cliente: any, interacao: string = 'PRESENCIAL') => {
    const codcli = cliente.CODCLI || cliente.codcli;
    
    // Verificar se o cliente já está neste dia com a MESMA interação
    if (rotas[dia].find(c => (c.codcli === codcli || c.CODCLI === codcli) && (c.interacao || 'PRESENCIAL') === interacao)) {
        const intLabel = INTERACOES.find(i => i.id === interacao)?.label || interacao;
        alert(`Cliente já está agendado neste dia com a interação ${intLabel}.`);
        return;
    }
    
    const newArr = [...rotas[dia], { 
        codcli: cliente.CODCLI || cliente.codcli, 
        razaosocial: cliente.CLIENTE || cliente.razaosocial, 
        fantasia: cliente.FANTASIA || cliente.fantasia,
        interacao: interacao 
    }];
    
    setRotas({ ...rotas, [dia]: newArr });
    setActiveDay(null);
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleAceitarSugestao = (sugestao: any) => {
    setAgendarForm({ dia: sugestao.diaSugerido || 'SEGUNDA', interacao: 'PRESENCIAL' });
    setAgendarModal({ cliente: sugestao, isSugestao: true });
  };

  const confirmarAgendamento = (cliente: any, isSugestao: boolean) => {
    addClienteToDia(agendarForm.dia, cliente, agendarForm.interacao);
    if (isSugestao) {
      setSugestoes(sugestoes.filter(s => s.codcli !== cliente.codcli));
    }
    setAgendarModal(null);
    setAnaliseModalOpen(false);
  };

  const handleRecusarSugestao = (sugestao: any) => {
    setSugestoes(sugestoes.filter(s => s.codcli !== sugestao.codcli));
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <Calendar className="text-primary-500" size={32} />
            Rotas de Visitas
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Planejamento semanal de rotas nativo do Winthor
          </p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <select
            value={selectedVendedor}
            onChange={(e) => setSelectedVendedor(e.target.value)}
            className="flex-1 md:w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
          >
            <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Selecione um Vendedor...</option>
            {vendedores.map(v => (
              <option key={v.codusur || v.CODUSUR} value={v.codusur || v.CODUSUR} style={{ color: '#000', backgroundColor: '#fff' }}>
                {v.nome || v.NOME}
              </option>
            ))}
          </select>

          <button
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white px-3 py-2 rounded-xl font-medium transition-colors border border-slate-200 dark:border-slate-700 h-[42px]"
            title="Configurações de Mensagem"
          >
            <Settings size={18} />
          </button>

          <button 
            onClick={handleSave}
            disabled={saving || !selectedVendedor}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Save size={18} />
            {saving ? 'Salvando...' : 'Salvar Rota'}
          </button>
        </div>
      </div>

      {selectedVendedor && desempenho && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex justify-between items-center shadow-inner border border-blue-100 dark:border-blue-900/50">
            <div>
              <h3 className="font-bold text-blue-800 dark:text-blue-300">Desempenho Semanal (7 dias)</h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Visitas e Faturamento na semana.</p>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-xl font-black text-slate-700 dark:text-white">{desempenho.semana?.agendadas || 0}</div>
                <div className="text-[9px] uppercase font-bold text-slate-500">Visitas</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-green-600 dark:text-green-400">{desempenho.semana?.realizadas || 0}</div>
                <div className="text-[9px] uppercase font-bold text-slate-500">Realizadas</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-blue-600 dark:text-blue-400">{desempenho.semana?.nfs || 0}</div>
                <div className="text-[9px] uppercase font-bold text-slate-500">NF Emitidas</div>
              </div>
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 flex justify-between items-center shadow-inner border border-purple-100 dark:border-purple-900/50">
            <div>
              <h3 className="font-bold text-purple-800 dark:text-purple-300">Desempenho Mensal (30 dias)</h3>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Visitas e Faturamento no mês.</p>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-xl font-black text-slate-700 dark:text-white">{desempenho.mes?.agendadas || 0}</div>
                <div className="text-[9px] uppercase font-bold text-slate-500">Visitas</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-green-600 dark:text-green-400">{desempenho.mes?.realizadas || 0}</div>
                <div className="text-[9px] uppercase font-bold text-slate-500">Realizadas</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-purple-600 dark:text-purple-400">{desempenho.mes?.nfs || 0}</div>
                <div className="text-[9px] uppercase font-bold text-slate-500">NF Emitidas</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="glass-card flex flex-col h-[600px]">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-white">{DIAS_LABEL[dia as keyof typeof DIAS_LABEL]}</h2>
                  <div className="text-xs text-slate-500 mt-1">{rotas[dia].length} clientes</div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => dispararRota(dia)}
                    className="p-2 text-green-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors group relative"
                    title="Enviar rota presencial para o Vendedor"
                  >
                    <Send size={18} />
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
                      Disparar Rota
                    </span>
                  </button>
                  <button 
                    onClick={() => openMaps(dia)}
                    className="p-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors group relative"
                    title="Abrir rota no Google Maps"
                  >
                    <MapIcon size={18} />
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
                      Ver Rota no Mapa
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 relative">
                {rotas[dia].map((cliente, index) => (
                  <div 
                    key={cliente.codcli + index} 
                    onClick={() => handleOpenAnalise(cliente, false)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm flex gap-2 items-center group shadow-sm hover:border-primary-300 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col gap-1 text-slate-400 opacity-50 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                      <button onClick={() => moveUp(dia, index)} disabled={index === 0} className="hover:text-primary-500 disabled:opacity-30">▲</button>
                      <button onClick={() => moveDown(dia, index)} disabled={index === rotas[dia].length - 1} className="hover:text-primary-500 disabled:opacity-30">▼</button>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 dark:text-white truncate" title={cliente.razaosocial}>
                        {cliente.codcli} - {cliente.fantasia || cliente.razaosocial?.split(' ')[0]}
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); cycleInteracao(dia, index); }}
                      className={`p-1.5 rounded-md border flex items-center justify-center transition-colors ${INTERACOES.find(i => i.id === (cliente.interacao || 'PRESENCIAL'))?.color}`}
                      title={INTERACOES.find(i => i.id === (cliente.interacao || 'PRESENCIAL'))?.label}
                    >
                      {(() => {
                        const Icon = INTERACOES.find(i => i.id === (cliente.interacao || 'PRESENCIAL'))?.icon || Car;
                        return <Icon size={14} />;
                      })()}
                    </button>

                    <button 
                      onClick={(e) => { e.stopPropagation(); removeCliente(dia, index); }}
                      className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 ml-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-slate-100 dark:border-slate-700 relative">
                {activeDay === dia ? (
                  <div className="absolute bottom-full left-0 w-full mb-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-10 overflow-hidden">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700 relative">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        autoFocus
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar cliente..." 
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-lg py-1.5 pl-8 pr-3 text-sm focus:ring-0 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {searching ? (
                        <div className="p-3 text-center text-xs text-slate-500">Buscando...</div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map(c => (
                          <div 
                            key={c.CODCLI} 
                            onClick={() => addClienteToDia(dia, c)}
                            className="p-2 border-b border-slate-50 dark:border-slate-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer text-xs"
                          >
                            <div className="font-semibold text-slate-800 dark:text-white">{c.CODCLI} - {c.FANTASIA || c.CLIENTE}</div>
                            <div className="text-slate-500 truncate">{c.CLIENTE}</div>
                          </div>
                        ))
                      ) : searchTerm.length >= 3 ? (
                        <div className="p-3 text-center text-xs text-slate-500">Nenhum encontrado</div>
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-500">Digite 3+ letras</div>
                      )}
                    </div>
                    <div 
                      className="p-2 bg-slate-100 dark:bg-slate-800 text-center text-xs text-slate-500 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
                      onClick={() => { setActiveDay(null); setSearchTerm(''); }}
                    >
                      Cancelar
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => {
                        if (!selectedVendedor) return alert('Selecione um vendedor primeiro.');
                        setActiveDay(dia);
                    }}
                    className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 hover:border-primary-500 hover:text-primary-500 transition-colors text-sm font-medium"
                  >
                    + Adicionar Cliente
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedVendedor && sugestoes.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            💡 Sugestões Inteligentes (Últimos 12 meses)
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {DIAS_SEMANA.map((dia) => {
              const sugestoesDoDia = sugestoes.filter(s => s.diaSugerido === dia);
              return (
                <div key={dia + '_sug'} className="glass-card flex flex-col h-[400px]">
                  <div className="p-3 border-b border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/20">
                    <h3 className="font-semibold text-blue-700 dark:text-blue-400 text-center text-sm">{DIAS_LABEL[dia as keyof typeof DIAS_LABEL]}</h3>
                    <div className="text-xs text-center text-blue-500/70 mt-1">{sugestoesDoDia.length} sugestões</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {sugestoesDoDia.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 mt-4">Nenhuma sugestão</div>
                    ) : (
                      sugestoesDoDia.map((sugestao, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => handleOpenAnalise(sugestao)}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm flex gap-2 items-center group shadow-sm transition-colors hover:border-blue-300 cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-800 dark:text-white truncate" title={sugestao.fantasia || sugestao.razaosocial}>
                              {sugestao.codcli} - {sugestao.fantasia || sugestao.razaosocial?.split(' ')[0]}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {sugestao.qtdPedidos} peds (útl: {new Date(sugestao.ultimaCompra).toLocaleDateString('pt-BR')})
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleRecusarSugestao(sugestao)} className="text-slate-400 hover:text-red-500 p-1 leading-none" title="Recusar">✕</button>
                            <button onClick={() => handleAceitarSugestao(sugestao)} className="text-slate-400 hover:text-blue-500 p-1 font-bold leading-none" title="Aceitar na Rota">✓</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Análise */}
      {analiseModalOpen && analiseData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => setAnaliseModalOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Análise da Decisão</h2>
              <button onClick={() => setAnaliseModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <span className="text-xl">×</span>
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <div className="text-sm text-slate-500">Cliente</div>
                <div className="font-semibold text-slate-800 dark:text-white">
                  {analiseData.cliente.codcli} - {analiseData.cliente.fantasia || analiseData.cliente.razaosocial}
                </div>
              </div>
              
              {analiseData.isSugestao ? (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  O sistema sugere <strong className="text-blue-600 dark:text-blue-400">{DIAS_LABEL[analiseData.cliente.diaSugerido as keyof typeof DIAS_LABEL]}</strong> porque, dos {analiseData.cliente.qtdPedidos} pedidos feitos nos últimos 12 meses, esta é a distribuição por dia da semana:
                </p>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Distribuição de pedidos feitos pelo cliente nos últimos 12 meses (use para conferir se ele está agendado no melhor dia):
                </p>
              )}
              
              {loadingAnalise ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {analiseData.dados.map((item, i) => {
                    const maxQtd = Math.max(...analiseData.dados.map(d => d.qtd));
                    const widthPercent = (item.qtd / maxQtd) * 100;
                    const isMelhor = item.qtd === maxQtd;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-24 text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                          {item.dia}
                        </div>
                        <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex items-center">
                          <div 
                            className={`h-full ${isMelhor ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-500'}`} 
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <div className={`w-8 text-xs font-bold text-right ${isMelhor ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
                          {item.qtd}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <select 
                  value={agendarForm.dia}
                  onChange={e => setAgendarForm({...agendarForm, dia: e.target.value})}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 w-full sm:w-32 text-slate-900 dark:text-white"
                >
                  {DIAS_SEMANA.map(d => (
                    <option key={d} value={d}>{DIAS_LABEL[d as keyof typeof DIAS_LABEL]}</option>
                  ))}
                </select>
                <select 
                  value={agendarForm.interacao}
                  onChange={e => setAgendarForm({...agendarForm, interacao: e.target.value})}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 w-full sm:w-32 text-slate-900 dark:text-white"
                >
                  {INTERACOES.map(i => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
                <button 
                  onClick={() => confirmarAgendamento(analiseData.cliente, analiseData.isSugestao)}
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Adicionar à Rota
                </button>
              </div>
              <button 
                onClick={() => setAnaliseModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {agendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Agendar Visita</h3>
              <p className="text-sm text-slate-500">{agendarModal.cliente.CLIENTE || agendarModal.cliente.razaosocial}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dia da Semana</label>
                <select 
                  value={agendarForm.dia}
                  onChange={e => setAgendarForm({...agendarForm, dia: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  {DIAS_SEMANA.map(d => (
                    <option key={d} value={d}>{DIAS_LABEL[d as keyof typeof DIAS_LABEL]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Interação</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTERACOES.map(i => {
                    const Icon = i.icon;
                    const isSelected = agendarForm.interacao === i.id;
                    return (
                      <button
                        key={i.id}
                        onClick={() => setAgendarForm({...agendarForm, interacao: i.id})}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${isSelected ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-700 bg-transparent hover:border-slate-200 dark:hover:border-slate-600'}`}
                      >
                        <Icon size={20} className={isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'} />
                        <span className={`text-xs mt-1 font-medium ${isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-500'}`}>{i.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
              <button 
                onClick={() => setAgendarModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => confirmarAgendamento(agendarModal.cliente, agendarModal.isSugestao)}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium shadow-md shadow-primary-500/20 transition-all flex items-center gap-2"
              >
                <Check size={16} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Mapa Otimizado */}
      <MapModal 
        isOpen={!!mapModalDia} 
        dia={mapModalDia || ''} 
        clientes={mapModalDia ? rotas[mapModalDia] : []} 
        vendedor={vendedorInfo}
        onClose={() => setMapModalDia(null)} 
        onApplyRoute={handleApplyRoute}
      />

      {/* Modal de Configurações */}
      {configModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-md shadow-2xl relative">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 rounded-t-xl">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" />
                Configurações de Envio
              </h3>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Mensagem</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={config.tipoMensagem}
                  onChange={(e) => handleConfigTipoChange(e.target.value)}
                >
                  {TIPOS_MENSAGEM.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensagem Padrão</label>
                <textarea 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px] text-sm outline-none"
                  value={config.mensagemPadrao}
                  onChange={(e) => setConfig({ ...config, mensagemPadrao: e.target.value })}
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button 
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-500/30"
              >
                Salvar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

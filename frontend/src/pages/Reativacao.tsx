import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Send, AlertTriangle, Users, X, List, Play, Square, PenTool } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { ModalGerenciarTemplates } from '../components/ModalGerenciarTemplates';

export default function Reativacao() {
  const { maskData } = usePrivacy();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [viewMessage, setViewMessage] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Queue State
  const [queue, setQueue] = useState<any[]>([]);
  const [viewQueue, setViewQueue] = useState(false);
  const [filaStatus, setFilaStatus] = useState({ pendentes: 0, enviados: 0, erros: 0 });
  const [dbQueue, setDbQueue] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [filaFilter, setFilaFilter] = useState<'TODOS' | 'PENDENTE' | 'PROCESSANDO' | 'ENVIADO' | 'ERRO'>('TODOS');
  
  // Templates e Configuração
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [clientConfigs, setClientConfigs] = useState<Record<string, { enviarPrecos: boolean; tipoMensagemId: number | null; campanha: string; usarIA: boolean; temaIA: string }>>({});

  const [whatsappStatus, setWhatsappStatus] = useState<Record<string, 'loading'|'exists'|'missing'|'error'>>({});

  const handleCheckWhatsapp = async (codcli: string, telefone: string) => {
    if (!telefone) return;
    setWhatsappStatus(prev => ({ ...prev, [codcli]: 'loading' }));
    try {
      const response = await fetch(`/api/whatsapp/check-number/${telefone.replace(/[^0-9]/g, '')}?codusur=${user?.matricula}`);
      const data = await response.json();
      if (data.success) {
        setWhatsappStatus(prev => ({ ...prev, [codcli]: data.exists ? 'exists' : 'missing' }));
      } else {
        setWhatsappStatus(prev => ({ ...prev, [codcli]: 'error' }));
      }
    } catch (err) {
      setWhatsappStatus(prev => ({ ...prev, [codcli]: 'error' }));
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates_paginas/REATIVACAO');
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const getClientConfig = (codcli: string) => {
    if (clientConfigs[codcli]) return clientConfigs[codcli];
    return {
      enviarPrecos: true,
      tipoMensagemId: templates.length > 0 ? templates[0].id : null,
      campanha: '',
      usarIA: false,
      temaIA: ''
    };
  };

  const handleClientConfigChange = (codcli: string, field: 'enviarPrecos' | 'tipoMensagemId' | 'campanha' | 'usarIA' | 'temaIA', value: any) => {
    setClientConfigs(prev => ({
      ...prev,
      [codcli]: {
        ...getClientConfig(codcli),
        [field]: value
      }
    }));
  };

  const addToQueue = (cliente: any) => {
    const telefoneAlvo = cliente.telefone_selecionado || (cliente.telefone ? cliente.telefone.split(',')[0] : '');
    const cConfig = getClientConfig(cliente.codcli);
    const t = templates.find(temp => temp.id === cConfig.tipoMensagemId);
    
    setQueue(prev => {
      if (prev.find(c => c.codcli === cliente.codcli)) return prev;
      return [...prev, {
        ...cliente,
        telefone: telefoneAlvo,
        mensagemId: cConfig.tipoMensagemId,
        mensagemTipo: t ? t.tipo : 'Padrão',
        mensagemCustom: t ? t.template : '',
        enviarPrecos: cConfig.enviarPrecos,
        campanha: cConfig.campanha,
        usarIA: cConfig.usarIA,
        temaIA: cConfig.temaIA
      }];
    });
  };

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Use useMemo to avoid creating a new object on every render
  const userStr = localStorage.getItem('user');
  const user = useMemo(() => userStr ? JSON.parse(userStr) : null, [userStr]);
  
  const fetchInativos = async (search: string = '', currentPage: number = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/clientes/esquecidos?codusur=${user?.matricula}&role=${user?.role}&dias=-1&vendedorId=${selectedVendedor}&busca=${encodeURIComponent(search)}&page=${currentPage}&limit=50`);
      const data = await response.json();
      if (data.success) {
        if (currentPage === 1) {
          setClientes(data.esquecidos || []);
        } else {
          setClientes(prev => [...prev, ...(data.esquecidos || [])]);
        }
        setHasMore((data.esquecidos || []).length === 50);
      }
    } catch (err) {
      console.error('Erro ao buscar inativos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    const delayDebounceFn = setTimeout(() => {
      if (user?.matricula) {
        fetchInativos(searchTerm, 1);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [user?.matricula, selectedVendedor, searchTerm]);

  useEffect(() => {
    if (page > 1 && user?.matricula) {
      fetchInativos(searchTerm, page);
    }
  }, [page]);

  useEffect(() => {
    if (user?.role?.toUpperCase() === 'BOT_GESTOR' || user?.role?.toUpperCase() === 'GERENTE' || user?.role?.toUpperCase() === 'SUPERVISOR') {
      const fetchVendedores = async () => {
        try {
          const response = await fetch(`/api/vendedores?codusur=${user.matricula}&role=${user.role}`);
          const data = await response.json();
          if (data.success) {
            setVendedores(data.vendedores);
          }
        } catch (err) {
          console.error('Erro ao buscar vendedores:', err);
        }
      };
      fetchVendedores();
    }
  }, [user]);

  const handleContactChange = (codcli: string, newTelefone: string) => {
    setClientes(prev => prev.map(c => c.codcli === codcli ? { ...c, telefone_selecionado: newTelefone } : c));
  };

  const addAllToQueue = () => {
    const newClients = clientes.filter(c => !queue.find(q => q.codcli === c.codcli));
    if (newClients.length > 0) {
      const clientsToAdd = newClients.map(c => ({
        c,
        telefoneAlvo: c.telefone_selecionado || (c.telefone ? c.telefone.split(',')[0] : ''),
        cConfig: getClientConfig(c.codcli),
        t: templates.find(temp => temp.id === getClientConfig(c.codcli).tipoMensagemId)
      })).map(({ c, telefoneAlvo, cConfig, t }) => ({
        ...c,
        telefone: telefoneAlvo,
        mensagemId: cConfig.tipoMensagemId,
        mensagemTipo: t ? t.tipo : 'Padrão',
        mensagemCustom: t ? t.template : '',
        enviarPrecos: cConfig.enviarPrecos,
        campanha: cConfig.campanha,
        usarIA: cConfig.usarIA,
        temaIA: cConfig.temaIA
      }));
      setQueue(prev => [...prev, ...clientsToAdd]);
    }
  };

  const fetchFilaStatus = async () => {
    try {
      const res = await fetch(`/api/clientes/reativacao/fila/status?codusur=${user?.matricula}`);
      const data = await res.json();
      if (data.success) {
        setFilaStatus({ pendentes: data.pendentes, enviados: data.enviados, erros: data.erros });
      }
      
      const resItems = await fetch(`/api/clientes/reativacao/fila/items?codusur=${user?.matricula}`);
      const dataItems = await resItems.json();
      if (dataItems.success) {
        setDbQueue(dataItems.items);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (viewQueue) {
      fetchFilaStatus();
      timerRef.current = setInterval(fetchFilaStatus, 5000);
      
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [viewQueue, user]);

  const sendQueueToBackend = async () => {
    if (queue.length === 0) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/clientes/reativacao/fila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fila: queue, codusur: user?.matricula })
      });
      const data = await res.json();
      if (data.success) {
        alert('Fila enviada para processamento no servidor!');
        setQueue([]);
        fetchFilaStatus();
      } else {
        alert('Erro ao enviar fila: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao comunicar com servidor');
    } finally {
      setIsSending(false);
    }
  };

  const clearQueue = () => {
    setQueue([]);
  };

  const handleReativar = async (codcli: string) => {
    const c = clientes.find(c => c.codcli === codcli);
    if (c) {
      addToQueue(c);
      alert('Cliente adicionado à fila de disparo!');
    }
  };

  const handleClearHistorico = async (codcli: string) => {
    if (!confirm('Tem certeza que deseja limpar o histórico de envio deste cliente? Ele voltará a aparecer na lista de esquecidos.')) {
      return;
    }
    try {
      const res = await fetch(`/api/clientes/reativacao/historico/${codcli}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('Histórico limpo! Você já pode buscar o cliente novamente.');
        fetchFilaStatus();
        fetchInativos(searchTerm);
      } else {
        alert('Erro: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao limpar histórico.');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Reativação de Clientes
          </h1>
          <p className="text-gray-400 mt-1">
            Clientes que não compram há um determinado período.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
          <button
            onClick={() => setManageTemplatesOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-blue-400 px-4 py-2 rounded-xl font-medium transition-all shadow-sm border border-slate-700"
          >
            <PenTool className="w-5 h-5" />
            Templates de Mensagem
          </button>
          
          <button
            onClick={() => setViewQueue(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors border border-slate-700 relative"
          >
            <List className="w-5 h-5" />
            Fila de Disparo
            {queue.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full animate-pulse shadow-lg shadow-blue-500/50">
                {queue.length}
              </span>
            )}
          </button>
          
          <button
            onClick={addAllToQueue}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-emerald-500/25"
          >
            <Users className="w-5 h-5" />
            Reativar Todos ({clientes.length})
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 bg-[var(--sidebar-bg)] p-4 rounded-xl border border-[var(--border-color)]">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nome, fantasia ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-2.5 text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        
        {vendedores.length > 0 && (
          <div className="flex items-center gap-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 w-full lg:w-auto overflow-hidden">
            <Users className="w-5 h-5 text-gray-400 shrink-0" />
            <select
              value={selectedVendedor}
              onChange={(e) => setSelectedVendedor(e.target.value)}
              className="bg-transparent text-gray-100 focus:outline-none focus:ring-0 cursor-pointer w-full lg:max-w-[200px] truncate"
            >
              <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Todos os Vendedores</option>
              {vendedores.map((v: any) => (
                <option key={v.CODUSUR || v.codusur} value={v.CODUSUR || v.codusur} style={{ color: '#000', backgroundColor: '#fff' }}>
                  {v.CODUSUR || v.codusur} - {v.NOME || v.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="text-xs uppercase bg-black/20 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-medium">Cod.</th>
                <th className="px-6 py-4 font-medium">Cliente (Fantasia)</th>
                <th className="px-6 py-4 font-medium">Razão Social</th>
                <th className="px-6 py-4 font-medium">Telefone</th>
                <th className="px-6 py-4 font-medium">Vendedor</th>
                <th className="px-6 py-4 font-medium">Ramo de Atividade</th>
                <th className="px-6 py-4 font-medium text-center">Configuração da Mensagem</th>
                <th className="px-6 py-4 font-medium text-center">Data Últ. Compra</th>
                <th className="px-6 py-4 font-medium text-center">Dias sem Compra</th>
                <th className="px-6 py-4 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Buscando clientes inativos...</span>
                    </div>
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle className="w-8 h-8 opacity-50" />
                      Nenhum cliente encontrado para este filtro.
                    </div>
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.codcli} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">{c.codcli}</td>
                    <td className="px-6 py-4 font-medium text-gray-200">{maskData(c.fantasia || c.cliente)}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{maskData(c.razao_social || c.cliente)}</td>
                    <td className="px-6 py-4 text-gray-400 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {c.telefone && c.telefone.includes(',') ? (
                          <select 
                            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-md px-2 py-1 w-full max-w-[150px]"
                            onChange={(e) => {
                                handleContactChange(c.codcli, e.target.value);
                                setWhatsappStatus(prev => ({ ...prev, [c.codcli]: undefined as any }));
                            }}
                            value={c.telefone_selecionado || c.telefone.split(',')[0]}
                          >
                            {c.telefone.split(',').map((tel: string, idx: number) => (
                              <option key={idx} value={tel.trim()}>{tel.trim()}</option>
                            ))}
                          </select>
                        ) : (
                          c.telefone || '-'
                        )}
                        {c.telefone && (
                          <button
                            onClick={() => handleCheckWhatsapp(c.codcli, c.telefone_selecionado || (c.telefone ? c.telefone.split(',')[0] : ''))}
                            className="p-1 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                            title="Verificar se tem WhatsApp"
                          >
                            {whatsappStatus[c.codcli] === 'loading' ? (
                              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : whatsappStatus[c.codcli] === 'exists' ? (
                              <span title="WhatsApp Encontrado!" className="text-emerald-500 text-xs font-bold leading-none">✔️</span>
                            ) : whatsappStatus[c.codcli] === 'missing' ? (
                              <span title="Sem WhatsApp" className="text-rose-500 text-xs font-bold leading-none">❌</span>
                            ) : (
                              <Search className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{c.vendedor || '-'}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs truncate max-w-[150px]" title={c.ramo_atividade}>{c.ramo_atividade || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <select
                          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 w-full max-w-[200px]"
                          value={getClientConfig(c.codcli).tipoMensagemId || ''}
                          onChange={(e) => handleClientConfigChange(c.codcli, 'tipoMensagemId', Number(e.target.value))}
                        >
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.tipo}</option>
                          ))}
                        </select>
                        <select
                          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 w-full max-w-[200px]"
                          value={getClientConfig(c.codcli).campanha || ''}
                          onChange={(e) => handleClientConfigChange(c.codcli, 'campanha', e.target.value)}
                        >
                          <option value="">Sem Campanha de Produtos</option>
                          <option value="PROMOÇÃO">Promoções</option>
                          <option value="FIXO">FIXO</option>
                          <option value="BLACKFRIDAY">BLACKFRIDAY</option>
                          <option value="JORNAL">JORNAL</option>
                        </select>
                        <div className="flex flex-col gap-1 mt-1 p-2 bg-slate-900/50 rounded border border-blue-500/20">
                          <label className="flex items-center gap-2 text-xs text-blue-300 font-medium">
                            <input 
                              type="checkbox"
                              className="rounded bg-slate-800 border-white/10 text-blue-500 focus:ring-blue-500"
                              checked={getClientConfig(c.codcli).usarIA}
                              onChange={(e) => handleClientConfigChange(c.codcli, 'usarIA', e.target.checked)}
                            />
                            Personalizar com IA (GROK)
                          </label>
                          {getClientConfig(c.codcli).usarIA && (
                            <input
                              type="text"
                              placeholder="Ex: Oferta de Carnaval"
                              className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 w-full"
                              value={getClientConfig(c.codcli).temaIA || ''}
                              onChange={(e) => handleClientConfigChange(c.codcli, 'temaIA', e.target.value)}
                            />
                          )}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-300 mt-1">
                          <input 
                            type="checkbox"
                            className="rounded bg-slate-800 border-white/10 text-blue-500 focus:ring-blue-500"
                            checked={getClientConfig(c.codcli).enviarPrecos}
                            onChange={(e) => handleClientConfigChange(c.codcli, 'enviarPrecos', e.target.checked)}
                          />
                          Incluir Produtos e Preços
                        </label>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-400">{c.dtultcomp || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        {c.diasCompra} dias
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleReativar(c.codcli)}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] shadow-lg shadow-blue-500/25 disabled:opacity-50"
                        disabled={queue.some(q => q.codcli === c.codcli)}
                      >
                        <Send className="w-4 h-4" />
                        {queue.some(q => q.codcli === c.codcli) ? 'Na Fila' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="p-4 border-t border-[var(--border-color)]">
            {!loading && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setPage(p => p + 1); }}
                disabled={!hasMore}
                className="w-full bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed py-3 border border-slate-700"
              >
                {hasMore ? "Carregar mais (+50 registros)" : "Todos os registros carregados"}
              </button>
            )}
            {loading && page > 1 && (
              <div className="py-3 text-center text-slate-400 text-sm">Carregando mais...</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Modal de Mensagem */}
      {viewMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setViewMessage(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-6">
              <h3 className="text-lg font-medium text-white mb-4">Mensagem de Reativação</h3>
              <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                  {viewMessage}
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end">
              <button 
                onClick={() => setViewMessage(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal da Fila */}
      {viewQueue && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-800/50 rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <List className="w-5 h-5 text-blue-400" />
                  Progresso do Envio em Massa
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  Enviados: <span className="text-emerald-400 font-bold">{filaStatus.enviados}</span> | Pendentes: <span className="text-amber-400 font-bold">{filaStatus.pendentes}</span> | Erros: <span className="text-rose-400 font-bold">{filaStatus.erros}</span>
                </p>
                {filaStatus.pendentes > 0 && (
                  <p className="text-sky-400 text-sm mt-1 font-medium">
                    {dbQueue.some(q => q.status === 'PROCESSANDO') ? '⏳ Processando fila (delay randômico ativo)...' : '⏸️ Aguardando janela do cron ou horário comercial...'}
                  </p>
                )}
              </div>
              <button onClick={() => setViewQueue(false)} className="text-gray-400 hover:text-white p-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 border-b border-white/10 bg-slate-800 flex gap-2 overflow-x-auto">
              <button onClick={() => setFilaFilter('TODOS')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filaFilter === 'TODOS' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Todos</button>
              <button onClick={() => setFilaFilter('PENDENTE')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filaFilter === 'PENDENTE' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Pendentes</button>
              <button onClick={() => setFilaFilter('PROCESSANDO')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filaFilter === 'PROCESSANDO' ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Processando</button>
              <button onClick={() => setFilaFilter('ENVIADO')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filaFilter === 'ENVIADO' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Enviados</button>
              <button onClick={() => setFilaFilter('ERRO')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filaFilter === 'ERRO' ? 'bg-rose-500/20 text-rose-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Erros</button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {queue.length === 0 && dbQueue.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Sem clientes aguardando envio na sua lista local e na fila do servidor.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Fila do Servidor */}
                  {dbQueue.filter(item => filaFilter === 'TODOS' || item.status === filaFilter).length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Histórico / Fila do Servidor</h4>
                      {dbQueue.filter(item => filaFilter === 'TODOS' || item.status === filaFilter).map((item) => (
                        <div key={`db-${item.id}`} className={`flex flex-col p-4 rounded-lg border mb-2 ${
                          item.status === 'ERRO' ? 'border-rose-500/20 bg-rose-500/5' :
                          item.status === 'ENVIADO' ? 'border-emerald-500/20 bg-emerald-500/5' :
                          item.status === 'PROCESSANDO' ? 'border-blue-500/20 bg-blue-500/5' :
                          'border-amber-500/20 bg-amber-500/5'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-200">
                                Cliente: {item.codcli}
                              </div>
                              <div className="text-sm text-gray-400 mt-1">Status: {item.status}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => handleClearHistorico(item.codcli)}
                                className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/40 transition-colors"
                                title="Limpar histórico para reenviar mensagem"
                              >
                                🗑️ Limpar
                              </button>
                              <div className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-gray-300">
                                {item.status}
                              </div>
                            </div>
                          </div>
                          {item.status === 'ERRO' && item.log_erro && (
                            <div className="mt-2 text-xs text-rose-400 bg-rose-950/30 p-2 rounded whitespace-pre-wrap">
                              {item.log_erro}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fila Local */}
                  {queue.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Lista Local (Pronto para Enviar)</h4>
                      {queue.map((c, idx) => (
                        <div key={c.codcli} className={`flex items-center justify-between p-4 rounded-lg border border-white/5 bg-white/5 mb-2`}>
                          <div>
                            <div className="font-medium text-gray-200">
                              {idx + 1}. {c.codcli} - {maskData(c.fantasia || c.cliente)}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">Contato: {c.telefone}</div>
                          </div>
                          <div className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-gray-300">
                            Pronto para envio
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-800/50 rounded-b-xl">
              <button 
                onClick={clearQueue}
                disabled={queue.length === 0}
                className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
              >
                <Square className="w-4 h-4" />
                Limpar Lista Local
              </button>
              
              <button 
                onClick={sendQueueToBackend}
                disabled={queue.length === 0 || isSending}
                className={`w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25`}
              >
                {isSending ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Enviando ao Servidor...</>
                ) : (
                  <><Play className="w-5 h-5" /> Iniciar Disparos no Servidor</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <ModalGerenciarTemplates 
        isOpen={manageTemplatesOpen} 
        onClose={() => setManageTemplatesOpen(false)} 
        pagina="REATIVACAO"
        onTemplatesChanged={fetchTemplates}
      />
    </div>
  );
}

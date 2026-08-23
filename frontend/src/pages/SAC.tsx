import { useState, useEffect, useRef } from 'react';
import { Headset, CheckCircle2, Clock, User, MessageSquare, Send, X, Star, Paperclip, File as FileIcon, Plus, Search, ShieldAlert, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';

export default function SAC() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('TODOS');
  
  // Chat state
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [isGrokUsed, setIsGrokUsed] = useState(false);
  const [loadingGrok, setLoadingGrok] = useState(false);


  const handleSugerirComIA = async () => {
    if (!selectedTicket) return;
    setLoadingGrok(true);
    
    let attendantName = 'SAC';
    const stored = localStorage.getItem('usuario_logado');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user.nome) attendantName = user.nome;
      } catch (e) {}
    }

    try {
      const res = await fetch(`/api/sac/tickets/${selectedTicket.id}/suggest-reply?attendantName=${encodeURIComponent(attendantName)}`);
      const data = await res.json();
      if (res.ok) {
        setReplyText(data.sugestao);
        setIsGrokUsed(true);
      } else {
        alert(data.error || 'Erro ao gerar sugestão');
      }
    } catch (e) {
      alert('Erro de comunicação com o servidor');
    } finally {
      setLoadingGrok(false);
    }
  };
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [newTicket, setNewTicket] = useState({ codcli: '', nome: '', telefone: '', departamentoId: '', subdepartamentoId: '', descricao: '' });
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [submittingTicket, setSubmittingTicket] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  useEffect(() => {
    if (selectedTicket) {
      fetchChat(selectedTicket.id);
      // Polling could be added here
      const interval = setInterval(() => {
        fetchChat(selectedTicket.id, true);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedTicket]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sac/tickets?status=${filter}`);
      if (res.ok) {
        setTickets(await res.json());
      }
    } catch (error) {
      console.error('Erro ao buscar tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChat = async (ticketId: number, silent = false) => {
    if (!silent) setLoadingChat(true);
    try {
      const res = await fetch(`/api/sac/tickets/${ticketId}/chat`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.mensagens || []);
      }
    } catch (error) {
      console.error('Erro ao buscar chat:', error);
    } finally {
      if (!silent) setLoadingChat(false);
    }
  };

  const fecharTicket = async (id: number) => {
    try {
      await fetch(`/api/sac/tickets/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FECHADO' })
      });
      fetchTickets();
      if (selectedTicket?.id === id) {
        setSelectedTicket({ ...selectedTicket, status: 'FECHADO' });
      }
    } catch (error) {
      console.error('Erro ao fechar ticket:', error);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    
    const textToSend = replyText;
    setReplyText('');
    
    const tempMsg = {
      id: 'temp-' + Date.now(),
      sentido: 'OUT',
      texto: textToSend,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, tempMsg]);
    
    setSending(true);
    try {
      // Pega o nome do atendente do localStorage
      let attendantName = 'SAC';
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.nome) attendantName = user.nome;
      }

      const currentGrok = isGrokUsed;
      setIsGrokUsed(false);

      const res = await fetch(`/api/sac/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend, attendantName, grokUsed: currentGrok })
      });
      
      if (res.ok) {
        fetchChat(selectedTicket.id, true);
        fetchTickets(); // Para atualizar o status caso mude para EM ATENDIMENTO
        if (selectedTicket.status === 'ABERTO') {
           setSelectedTicket({ ...selectedTicket, status: 'EM ATENDIMENTO' });
        }
      }
    } catch (error) {
      console.error('Erro ao responder:', error);
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    
    const tempMsg = {
      id: 'temp-' + Date.now(),
      sentido: 'OUT',
      texto: `Enviando arquivo: ${file.name}...`,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, tempMsg]);

    setSending(true);
    try {
      let attendantName = 'SAC';
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.nome) attendantName = user.nome;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('attendantName', attendantName);

      const res = await fetch(`/api/sac/tickets/${selectedTicket.id}/send-media`, {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchChat(selectedTicket.id, true);
        fetchTickets();
        if (selectedTicket.status === 'ABERTO') {
           setSelectedTicket({ ...selectedTicket, status: 'EM ATENDIMENTO' });
        }
      }
    } catch (error) {
      console.error('Erro ao enviar mídia:', error);
    } finally {
      setSending(false);
    }
  };

  const fetchDepartamentos = async () => {
    try {
      const res = await fetch('/api/sac/departamentos');
      if (res.ok) setDepartamentos(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleSolicitarAvaliacao = async (ticketId: number) => {
    if (!confirm('Deseja realmente solicitar a avaliação novamente ao cliente?')) return;
    try {
      const res = await fetch(`/api/sac/tickets/${ticketId}/request-evaluation`, { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Erro ao solicitar avaliação.');
        return;
      }
      alert('Avaliação solicitada com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao solicitar avaliação.');
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    if (departamentos.length === 0) fetchDepartamentos();
  };

  const buscarCliente = async () => {
    if (!newTicket.codcli) return;
    setLoadingClient(true);
    try {
      const res = await fetch(`/api/sac/clientes/${newTicket.codcli}`);
      if (res.ok) {
        const data = await res.json();
        setNewTicket(prev => ({ ...prev, nome: data.nome, telefone: data.telefone || '' }));
      } else {
        alert('Cliente não encontrado');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingClient(false);
    }
  };

  const handleCreateInternalTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.codcli || !newTicket.telefone || (!newTicket.departamentoId && !newTicket.subdepartamentoId) || !newTicket.descricao) {
      alert('Preencha todos os campos obrigatórios (incluindo o telefone)');
      return;
    }

    setSubmittingTicket(true);
    try {
      let attendantName = 'SAC';
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.nome) attendantName = user.nome;
      }

      const finalDeptoId = newTicket.subdepartamentoId || newTicket.departamentoId;

      const formData = new FormData();
      formData.append('codcli', newTicket.codcli);
      formData.append('telefone', newTicket.telefone);
      formData.append('departamentoId', finalDeptoId);
      formData.append('descricao', newTicket.descricao);
      formData.append('attendantName', attendantName);
      if (ticketFile) {
        formData.append('file', ticketFile);
      }

      const res = await fetch('/api/sac/tickets/internal', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        alert('Chamado aberto com sucesso!');
        setIsModalOpen(false);
        setNewTicket({ codcli: '', nome: '', telefone: '', departamentoId: '', subdepartamentoId: '', descricao: '' });
        setTicketFile(null);
        fetchTickets();
      } else {
        const err = await res.json();
        alert('Erro ao abrir chamado: ' + err.error);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setSubmittingTicket(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4 animate-fade-in">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Headset className="text-primary-500" /> Atendimento SAC
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestão e atendimento dos chamados via WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/logs-identificacao')} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors border border-slate-200 dark:border-slate-700">
            <ShieldAlert size={18} className="text-amber-500" />
            LOG - Clientes não Identificado
          </button>
          <button onClick={handleOpenModal} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm shadow-primary-500/20">
            <Plus size={18} />
            Novo Chamado Interno
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        
        {/* COLUNA ESQUERDA: TICKETS */}
        <div className="w-1/3 flex flex-col gap-4">
          
          <div className="glass-card p-4 shrink-0 flex gap-2">
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="TODOS">Todos os Chamados</option>
              <option value="ABERTO">Abertos</option>
              <option value="EM ATENDIMENTO">Em Atendimento</option>
              <option value="FECHADO">Fechados (Aguardando Avaliação)</option>
              <option value="FINALIZADO">Finalizados</option>
            </select>
            <button onClick={fetchTickets} className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Atualizar
            </button>
          </div>

          <div className="glass-card flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Buscando chamados...</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
                <CheckCircle2 size={32} className="text-slate-300 dark:text-slate-600" />
                <span>Nenhum chamado encontrado.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map(ticket => (
                  <div 
                    key={ticket.id} 
                    onClick={() => setSelectedTicket(ticket)}
                    className={clsx(
                      "p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md",
                      selectedTicket?.id === ticket.id 
                        ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
                        : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-primary-200"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                        <User size={14} className="text-slate-400" />
                        {ticket.telefone}
                      </div>
                      <span className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium border uppercase tracking-wider",
                        ticket.status === 'ABERTO' && "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:border-red-800/50",
                        ticket.status === 'EM ATENDIMENTO' && "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800/50",
                        ticket.status === 'FECHADO' && "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800/50",
                        ticket.status === 'FINALIZADO' && "bg-green-50 text-green-600 border-green-200 dark:bg-green-900/30 dark:border-green-800/50"
                      )}>
                        {ticket.status}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">
                      {ticket.descricao}
                    </p>

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                       <span className="text-[11px] text-slate-500 flex items-center gap-1">
                         <Clock size={12} />
                         {new Date(ticket.criadoEm).toLocaleDateString('pt-BR')}
                       </span>
                       {ticket.notaAvaliacao && (
                         <span className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
                           <Star size={12} className="fill-amber-500" />
                           Nota: {ticket.notaAvaliacao}
                         </span>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: CHAT */}
        <div className="flex-1 glass-card overflow-hidden flex flex-col relative">
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
               <MessageSquare size={48} className="opacity-20" />
               <p>Selecione um chamado na lista para iniciar o atendimento.</p>
            </div>
          ) : (
            <>
              {/* Header do Chat */}
              <div className="h-16 px-6 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                 <div>
                   <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                     Ticket #{selectedTicket.id} - {selectedTicket.nomeCliente || selectedTicket.telefone}
                   </h2>
                   <p className="text-xs text-slate-500">
                     {selectedTicket.nomeCliente && <span className="mr-2">Tel: {selectedTicket.telefone}</span>}
                     Depto: {selectedTicket.departamento || selectedTicket.departamentoId}
                   </p>
                 </div>
                 
                 <div className="flex gap-2">
                   {(selectedTicket.status === 'ABERTO' || selectedTicket.status === 'EM ATENDIMENTO') && (
                     <button 
                       onClick={() => fecharTicket(selectedTicket.id)}
                       className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 shadow-sm shadow-green-500/20"
                     >
                       <CheckCircle2 size={16} />
                       Resolver Chamado
                     </button>
                   )}
                   <button onClick={() => setSelectedTicket(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg">
                     <X size={20} />
                   </button>
                 </div>
              </div>

              {/* Mensagem Inicial (Relato) */}
              <div className="flex-1 overflow-y-auto p-6 bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat bg-[length:400px_auto] dark:opacity-10 opacity-5 absolute inset-0 z-0 pointer-events-none"></div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 relative z-10">
                <div className="flex justify-center">
                  <span className="text-[10px] bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg backdrop-blur-sm">
                    Início do Chamado - {new Date(selectedTicket.criadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
                
                {/* O Relato inicial é sempre do cliente */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 rounded-tl-none">
                    <p className="text-[10px] text-primary-500 font-semibold mb-1">Cliente</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{selectedTicket.descricao}</p>
                  </div>
                </div>

                {loadingChat ? (
                   <div className="text-center text-sm text-slate-500 my-4">Carregando histórico...</div>
                ) : (
                  chatMessages.map(msg => (
                    <div key={msg.id} className={clsx("flex", msg.sentido === 'IN' ? "justify-start" : "justify-end")}>
                      <div className={clsx(
                        "max-w-[80%] rounded-2xl px-4 py-2 shadow-sm border",
                        msg.sentido === 'IN' 
                          ? "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-tl-none"
                          : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30 rounded-tr-none"
                      )}>
                        {msg.sentido === 'IN' && <p className="text-[10px] text-primary-500 font-semibold mb-1">Cliente</p>}
                        {msg.sentido !== 'IN' && <p className="text-[10px] text-emerald-600 font-semibold mb-1 text-right">Atendente</p>}
                        
                        {/* Renderização de Mídia */}
                        {msg.mediaUrl && (
                          <div className="mb-2 max-w-full rounded-lg overflow-hidden">
                            {msg.mediaType === 'image' && (
                              <img src={msg.mediaUrl} alt="Anexo" className="max-w-[240px] max-h-[300px] object-cover rounded-lg" />
                            )}
                            {msg.mediaType === 'video' && (
                              <video src={msg.mediaUrl} controls className="max-w-[240px] max-h-[300px] rounded-lg bg-black" />
                            )}
                            {msg.mediaType === 'audio' && (
                              <audio src={msg.mediaUrl} controls className="max-w-[240px]" />
                            )}
                            {msg.mediaType === 'document' && (
                              <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                                <FileIcon size={24} className="text-primary-500 shrink-0" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">Documento Anexado</span>
                              </a>
                            )}
                          </div>
                        )}

                        {msg.texto && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{msg.texto}</p>}
                        <p className="text-[10px] text-right text-slate-400 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                
                {(selectedTicket.status === 'FINALIZADO' || selectedTicket.status === 'FECHADO') && selectedTicket.notaAvaliacao && (
                  <div className="flex justify-center my-4">
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-2 flex items-center gap-2">
                       <Star size={16} className="fill-amber-500 text-amber-500" />
                       <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                         Avaliação do Cliente: {selectedTicket.notaAvaliacao} de 10
                       </span>
                    </div>
                  </div>
                )}
                {(selectedTicket.status === 'FINALIZADO' || selectedTicket.status === 'FECHADO') && !selectedTicket.notaAvaliacao && (
                  <div className="flex justify-center my-4">
                    <button 
                      onClick={() => handleSolicitarAvaliacao(selectedTicket.id)}
                      className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                    >
                      <Star size={16} />
                      Solicitar Avaliação Novamente
                    </button>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              {(selectedTicket.status === 'ABERTO' || selectedTicket.status === 'EM ATENDIMENTO') ? (
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 relative z-10">
                  <div className="flex items-center gap-3">
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleSendMedia} 
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      className="w-12 h-12 shrink-0 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-600 dark:text-slate-300 rounded-xl flex items-center justify-center transition-colors"
                      title="Enviar Arquivo (Imagem/Vídeo/Áudio)"
                    >
                      <Paperclip size={20} />
                    </button>
                    
                    <button 
                      onClick={handleSugerirComIA}
                      disabled={sending || loadingGrok}
                      className="w-12 h-12 shrink-0 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-800/30 disabled:opacity-50 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center transition-colors border border-indigo-200 dark:border-indigo-800/50"
                      title="Sugerir Resposta com IA"
                    >
                      <Wand2 size={20} className={clsx(loadingGrok && "animate-spin")} />
                    </button>
                    
                    <textarea 
                      value={replyText}
                      onChange={(e) => {
                        setReplyText(e.target.value);
                        if (e.target.value === '') setIsGrokUsed(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder="Digite sua resposta..."
                      className="flex-1 resize-none h-12 py-3 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <button 
                      onClick={handleSendReply}
                      disabled={sending || !replyText.trim()}
                      className="w-12 h-12 shrink-0 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors shadow-md shadow-primary-500/20"
                    >
                      <Send size={20} className={clsx(sending && "animate-pulse")} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500 relative z-10">
                  Este chamado já foi encerrado e não pode receber novas respostas.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Plus className="text-primary-500" /> Abertura de Chamado Interno
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateInternalTicket} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cod. Cliente (CODCLI)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      required
                      value={newTicket.codcli}
                      onChange={e => setNewTicket({...newTicket, codcli: e.target.value})}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <button type="button" onClick={buscarCliente} disabled={loadingClient || !newTicket.codcli} className="px-3 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                      <Search size={18} className="text-slate-600 dark:text-slate-300" />
                    </button>
                  </div>
                </div>
                
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone (WhatsApp)</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: 5511999999999"
                    value={newTicket.telefone}
                    onChange={e => setNewTicket({...newTicket, telefone: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Atualize se necessário para notificar o cliente corretamente.</p>
                </div>
              </div>

              {newTicket.nome && (
                <div className="p-3 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-lg text-sm border border-primary-100 dark:border-primary-800/30">
                  <span className="font-semibold">Cliente encontrado:</span> {newTicket.nome}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Departamento</label>
                  <select 
                    required
                    value={newTicket.departamentoId}
                    onChange={e => setNewTicket({...newTicket, departamentoId: e.target.value, subdepartamentoId: ''})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="">Selecione...</option>
                    {departamentos.filter(d => !d.departamentoPaiId && d.ativo === 'S').map(d => (
                      <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subdepartamento</label>
                  <select 
                    value={newTicket.subdepartamentoId}
                    onChange={e => setNewTicket({...newTicket, subdepartamentoId: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="">(Opcional) Selecione...</option>
                    {newTicket.departamentoId && departamentos.filter(d => String(d.departamentoPaiId) === String(newTicket.departamentoId) && d.ativo === 'S').map(d => (
                      <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição do Ocorrido</label>
                <textarea 
                  required
                  rows={4}
                  value={newTicket.descricao}
                  onChange={e => setNewTicket({...newTicket, descricao: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Anexo (Opcional)</label>
                <input 
                  type="file"
                  onChange={e => setTicketFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={submittingTicket} className="px-6 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-primary-500/20">
                  {submittingTicket ? 'Abrindo...' : 'Abrir Chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, Phone, User, ChevronDown, Volume2 } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

interface Conversa {
  telefone: string;
  codusur: string;
  nomeCliente: string | null;
  nomeConta: string;
  instanceName: string;
  ultimaMensagem: string;
  qtMensagens: number;
  preview: string;
  mediaType: string | null;
}

interface Mensagem {
  id: string;
  sentido: string;
  texto: string;
  timestamp: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaMime: string | null;
}

export default function MonitorConversas() {
  const { maskData } = usePrivacy();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversa | null>(null);
  const [loadingConversas, setLoadingConversas] = useState(true);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [contaFilter, setContaFilter] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversas();
    const interval = setInterval(fetchConversas, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedChat) {
      fetchMensagens(selectedChat.codusur, selectedChat.telefone);
      const interval = setInterval(() => {
        fetchMensagens(selectedChat.codusur, selectedChat.telefone);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const fetchConversas = async () => {
    try {
      const res = await fetch('/api/chat/todas-conversas');
      const data = await res.json();
      if (data.success) {
        setConversas(data.conversas);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConversas(false);
    }
  };

  const fetchMensagens = async (codusur: string, telefone: string) => {
    setLoadingMensagens(true);
    try {
      const res = await fetch(`/api/chat/todas-mensagens?codusur=${codusur}&telefone=${telefone}`);
      const data = await res.json();
      if (data.success) {
        setMensagens(data.mensagens);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMensagens(false);
    }
  };

  const contas = [...new Set(conversas.map(c => c.nomeConta))].sort();

  const filteredConversas = conversas.filter(c => {
    const matchSearch = !searchTerm ||
      (c.nomeCliente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.telefone.includes(searchTerm) ||
      c.nomeConta.toLowerCase().includes(searchTerm.toLowerCase());
    const matchConta = !contaFilter || c.nomeConta === contaFilter;
    return matchSearch && matchConta;
  });

  const formatTime = (dt: string) => {
    if (!dt) return '';
    const d = new Date(dt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const pad = (n: number) => String(n).padStart(2, '0');
    if (isToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const renderMediaContent = (msg: Mensagem) => {
    const text = msg.texto || '';

    if (text.startsWith('[AUDIO]') || msg.mediaType === 'audio') {
      const audioMatch = text.match(/\[AUDIO\]([^.\n]+)\.ogg/);
      const audioId = audioMatch ? audioMatch[1] : null;
      const audioUrl = audioId ? `/SAC/UPLOAD/Audio/${audioId}.ogg` : (msg.mediaUrl || null);
      const transcricao = text.match(/\[TRANSCRICAO\]\s*([\s\S]*)/);

      return (
        <div className="space-y-2">
          {audioUrl && (
            <audio controls src={audioUrl} className="max-w-[250px]" preload="none" />
          )}
          {transcricao && (
            <p className="text-xs italic text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 rounded p-2">
              {transcricao[1].trim()}
            </p>
          )}
          {!transcricao && !audioUrl && <p className="text-slate-700 dark:text-slate-200">{text}</p>}
        </div>
      );
    }

    if (text.startsWith('[IMAGEM]') || msg.mediaType === 'image') {
      const imgMatch = text.match(/\[IMAGEM\]([^.\n]+)\.(jpg|jpeg|png|webp)/i);
      const imgId = imgMatch ? `${imgMatch[1]}.${imgMatch[2]}` : null;
      const imgUrl = imgId ? `/SAC/UPLOAD/Imagens/${imgId}` : (msg.mediaUrl || null);
      const caption = text.replace(/\[IMAGEM\][^\n]*/, '').trim();

      return (
        <div className="space-y-1">
          {imgUrl && (
            <img
              src={imgUrl}
              alt="Imagem"
              className="max-w-[250px] rounded-lg cursor-pointer hover:opacity-90"
              loading="lazy"
              onClick={() => window.open(imgUrl, '_blank')}
            />
          )}
          {caption && <p className="text-slate-700 dark:text-slate-200 text-sm">{caption}</p>}
        </div>
      );
    }

    if (text.startsWith('[VIDEO]') || msg.mediaType === 'video') {
      const vidMatch = text.match(/\[VIDEO\]([^.\n]+)\.(mp4|webm|mov)/i);
      const vidId = vidMatch ? `${vidMatch[1]}.${vidMatch[2]}` : null;
      const vidUrl = vidId ? `/SAC/UPLOAD/Video/${vidId}` : (msg.mediaUrl || null);
      const caption = text.replace(/\[VIDEO\][^\n]*/, '').trim();

      return (
        <div className="space-y-1">
          {vidUrl && (
            <video controls src={vidUrl} className="max-w-[280px] rounded-lg" preload="none" />
          )}
          {caption && <p className="text-slate-700 dark:text-slate-200 text-sm">{caption}</p>}
        </div>
      );
    }

    if (text.startsWith('[DOCUMENTO]') || msg.mediaType === 'document') {
      const docMatch = text.match(/\[DOCUMENTO\]\s*(.*)/);
      const fileName = docMatch ? docMatch[1].trim() : 'Documento';
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-blue-500">📎</span>
          <span className="text-slate-700 dark:text-slate-200">{fileName}</span>
        </div>
      );
    }

    return <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{text}</p>;
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <MessageSquare className="text-green-500" size={28} />
          Monitor de Conversas
        </h1>
        <p className="text-slate-500 text-sm">Visualização somente leitura de todas as conversas dos WhatsApps configurados.</p>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-96 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-3 space-y-2 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por nome, telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none dark:text-white"
              />
            </div>
            <select
              value={contaFilter}
              onChange={e => setContaFilter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none dark:text-white"
            >
              <option value="">Todas as contas</option>
              {contas.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConversas ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Carregando...</div>
            ) : filteredConversas.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Nenhuma conversa encontrada.</div>
            ) : (
              filteredConversas.map((c, idx) => (
                <div
                  key={`${c.codusur}_${c.telefone}_${idx}`}
                  onClick={() => setSelectedChat(c)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                    selectedChat?.telefone === c.telefone && selectedChat?.codusur === c.codusur
                      ? 'bg-green-50 dark:bg-green-900/20 border-l-2 border-l-green-500'
                      : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-sm shrink-0">
                    {(c.nomeCliente || c.telefone).substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                        {c.nomeCliente ? maskData(c.nomeCliente) : c.telefone}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatTime(c.ultimaMensagem)}</span>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium truncate">{c.nomeConta}</p>
                    <p className="text-xs text-slate-500 truncate">{c.preview || '...'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {selectedChat ? (
            <>
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-green-600 to-green-700 text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                  {(selectedChat.nomeCliente || selectedChat.telefone).substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">
                    {selectedChat.nomeCliente ? maskData(selectedChat.nomeCliente) : selectedChat.telefone}
                  </p>
                  <p className="text-xs text-green-100 truncate">
                    Conta: {selectedChat.nomeConta} | Tel: {selectedChat.telefone}
                  </p>
                </div>
                <span className="bg-yellow-500 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-full shrink-0">SOMENTE LEITURA</span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                {loadingMensagens && mensagens.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando mensagens...</div>
                ) : mensagens.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">Nenhuma mensagem encontrada.</div>
                ) : (
                  mensagens.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sentido === 'OUT' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                          msg.sentido === 'OUT'
                            ? 'bg-green-100 dark:bg-green-900/40 rounded-br-sm'
                            : 'bg-white dark:bg-slate-700 rounded-bl-sm border border-slate-100 dark:border-slate-600'
                        }`}
                      >
                        {renderMediaContent(msg)}
                        <p className="text-[10px] text-slate-400 mt-1 text-right">{formatTime(msg.timestamp)}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <p className="text-center text-xs text-slate-400 italic">
                  Modo somente leitura - Não é possível enviar mensagens por esta interface
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
              <MessageSquare size={64} className="opacity-20" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm">Escolha uma conversa na lista à esquerda para visualizar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Info, Smile, Paperclip, Send, AlertCircle, Check, CheckCheck, MessageSquare, Tag, X, ShoppingCart, Download, FileText, Loader2, Mic, Square, Trash2, ClipboardList } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import clsx from 'clsx';
import { useSocket } from '../contexts/SocketContext';
import { useCart } from '../contexts/CartContext';
import { CartPanel } from '../components/CartPanel';
import { usePrivacy } from '../contexts/PrivacyContext';

type Message = {
  id: number;
  text: string;

  sender: 'me' | 'other';
  timestamp: string;
};

export default function Chat() {
  const { maskData } = usePrivacy();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const overrideVendedor = queryParams.get('vendedor');
  const overrideCliente = queryParams.get('cliente');

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isGestor = ['BOT_GESTOR', 'GERENTE', 'SUPERVISOR'].includes(user?.role?.toUpperCase());


  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSupervisorAlert, setShowSupervisorAlert] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [searchChat, setSearchChat] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  
  const [contactType, setContactType] = useState<'clientes' | 'vendedores'>('clientes');
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  
  const activeCodusur = selectedVendedor || overrideVendedor || user?.matricula;

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emojiPickerRef]);

  const filteredChats = chats.filter(c => {
    const term = searchChat.toLowerCase();
    const matchSearch = (c.name || '').toLowerCase().includes(term) ||
      (c.preview || '').toLowerCase().includes(term) ||
      (c.contactName || '').toLowerCase().includes(term);
    
    if (selectedTagFilter) {
      return matchSearch && (c.tags || []).includes(selectedTagFilter);
    }
    return matchSearch;
  });
  
  const allTags = Array.from(new Set(chats.flatMap(c => c.tags || [])));
  
  useEffect(() => {
    if (selectedTagFilter && !allTags.includes(selectedTagFilter)) {
      setSelectedTagFilter('');
    }
  }, [chats, selectedTagFilter]);
  const { socket, isConnected } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});

  const handleTranscribe = async (messageId: string) => {
    setTranscribing(prev => ({ ...prev, [messageId]: true }));
    try {
      const res = await fetch(`/api/chat/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });
      const data = await res.json();
      if (data.success) {
        setTranscriptions(prev => ({ ...prev, [messageId]: data.text }));
      } else {
        setTranscriptions(prev => ({ ...prev, [messageId]: '[Erro na transcrição: ' + (data.error || 'Falha') + ']' }));
      }
    } catch (err) {
      setTranscriptions(prev => ({ ...prev, [messageId]: '[Erro ao conectar com API de transcrição]' }));
    } finally {
      setTranscribing(prev => ({ ...prev, [messageId]: false }));
    }
  };
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [mixProdutos, setMixProdutos] = useState<any[]>([]);
  const [loadingMix, setLoadingMix] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectedDepto, setSelectedDepto] = useState<string>('');
  const [mixSearch, setMixSearch] = useState<string>('');
  
  const [financeiroData, setFinanceiroData] = useState<any>(null);
  const [pedidosData, setPedidosData] = useState<any[]>([]);
  const [dtUltComp, setDtUltComp] = useState<string | null>(null);

  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'info' | 'mix' | 'cart'>('info');
  const [isOrcamentoModalOpen, setIsOrcamentoModalOpen] = useState(false);
  const [orcamentoSearch, setOrcamentoSearch] = useState<string>('');
  const [orcamentoProdutos, setOrcamentoProdutos] = useState<any[]>([]);
  const [orcamentoLoading, setOrcamentoLoading] = useState(false);
  const [orcamentoItems, setOrcamentoItems] = useState<Record<string, { qtd: number, perc: number, selecionado: boolean }>>({});
  const [orcamentoGerando, setOrcamentoGerando] = useState(false);
  const { getCartItems, addToCart } = useCart();

  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplatesPopover, setShowTemplatesPopover] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(d => {
      if (d.success && Array.isArray(d.templates)) {
        setTemplates(d.templates);
      }
    }).catch(console.error);
  }, []);  const activeChatData = chats.find(c => c.id === activeChat);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (shouldScrollRef.current) {
      scrollToBottom();
      shouldScrollRef.current = false;
    }
  }, [messages]);

  useEffect(() => {
    if (!activeChat || !activeChatData) return;
    
    // Atualiza a flag de unread ao selecionar o chat
    setChats(prev => prev.map(c => c.id === activeChat ? { ...c, unread: 0 } : c));

    let isFetching = false;
    const fetchHistory = async (isPolling = false) => {
      if (isFetching) return;
      isFetching = true;
      if (!isPolling) setLoadingHistory(true);
      try {
        if (!activeCodusur) return;

        const telefone = activeChatData.preview; // preview guarda o telefone
        const response = await fetch(`/api/chat/history?codusur=${activeCodusur}&telefone=${telefone}`);
        const data = await response.json();
        
        if (data.success) {
          const loadedMessages = data.mensagens.map((m: any) => ({
            id: m.id,
            text: m.texto,
            sender: m.sentido === 'IN' ? 'other' : 'me',
            timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          if (!isPolling) shouldScrollRef.current = true; // scroll ao carregar conversa
          setMessages(loadedMessages);
        }
      } catch (err) {
        console.error('Erro ao buscar histórico:', err);
      } finally {
        if (!isPolling) setLoadingHistory(false);
        isFetching = false;
      }
    };

    fetchHistory();

    setSelectedProducts([]); // Limpa a seleção ao trocar de chat
    const codcli = activeChatData.id.split('_')[0];
    
    // Buscar estatísticas de saúde financeira e pedidos (Fase 1)
    if (codcli) {
      fetch(`/api/clientes/${codcli}/financeiro`).then(r => r.json()).then(d => {
        if (d.success) setFinanceiroData(d.financeiro);
      }).catch(console.error);

      fetch(`/api/clientes/${codcli}/pedidos`).then(r => r.json()).then(d => {
        if (d.success) {
           setPedidosData(d.pedidos);
           setDtUltComp(d.dtultcomp);
        }
      }).catch(console.error);
    }

    // Buscar Mix de Produtos (Fase 1)
    if (codcli) {
      setLoadingMix(true);
      const fetchMix = async () => {
        try {
          const response = await fetch(`/api/produtos/mix/${codcli}`);
          const data = await response.json();
          if (data.success) {
            setMixProdutos(data.mix);
          }
        } catch (err) {
          console.error('Erro ao buscar mix:', err);
        } finally {
          setLoadingMix(false);
        }
      };
      fetchMix();
    }

    const interval = setInterval(() => {
      fetchHistory(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeChat, activeChatData?.id, activeCodusur]); // Removi a dependência inteira de activeChatData para não dar reload a cada update no objeto

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNovaMensagem = (data: any) => {
      const isCurrentChat = activeChatData && activeChatData.preview === data.chat_id;
      
      if (isCurrentChat) {
        shouldScrollRef.current = true; // scroll apenas em nova mensagem
        setMessages(prev => [...prev, {
          id: data.id,
          text: data.text,
          sender: 'other',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }
      
      setChats(prevChats => prevChats.map(c => {
        if (c.preview === data.chat_id) {
          return {
            ...c,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: isCurrentChat ? 0 : (c.unread || 0) + 1
          };
        }
        return c;
      }));
    };

    socket.on('nova_mensagem', handleNovaMensagem);

    return () => {
      socket.off('nova_mensagem', handleNovaMensagem);
    };
  }, [socket, isConnected, activeChatData?.preview]);

  useEffect(() => {
    if (!isGestor) return;
    const url = user ? `/api/vendedores?codusur=${user.matricula}&role=${user.role}` : '/api/vendedores';
    fetch(url).then(r => r.json()).then(d => {
      if (d.success) setVendedores(d.vendedores);
    }).catch(console.error);
  }, [isGestor]);

  // Carregar lista de clientes ou vendedores da API
  useEffect(() => {
    const fetchChatsList = async () => {
      try {
        if (!activeCodusur) return;

        if (contactType === 'vendedores') {
           const chatsArray = vendedores.map(v => ({
                id: `V${v.codusur || v.CODUSUR}_${v.telefone1 || v.TELEFONE1 || v.telefone2 || v.TELEFONE2}`,
                name: `[VENDEDOR] ${v.nome || v.NOME}`,
                contactName: 'VENDEDOR',
                hasMultipleContacts: false,
                time: '',
                preview: v.telefone1 || v.TELEFONE1 || v.telefone2 || v.TELEFONE2,
                unread: 0,
                active: false,
                tags: []
           })).filter(c => c.preview); // must have phone
           setChats(chatsArray);
           return;
        }

        if (contactType === 'clientes' && isGestor && !selectedVendedor) {
            setChats([]);
            return;
        }

        const roleParam = user?.role ? `&role=${user.role}` : '';
        let url = `/api/clientes?codusur=${activeCodusur}${roleParam}`;
        if (selectedVendedor) url += `&vendedor=${selectedVendedor}`;

        const response = await fetch(url);
        const data = await response.json();

        const responseContatos = await fetch(`/api/contatos/vendedor/${activeCodusur}?role=${user?.role || ''}`);
        const dataContatos = await responseContatos.json();

        if (data.success) {
          const chatsArray: any[] = [];
          const contatosExtras = dataContatos.success ? dataContatos.contatos : [];

          data.clientes.forEach((c: any) => {
            const extras = contatosExtras.filter((ext: any) => ext.codcli === c.codcli);
            extras.forEach((ext: any) => {
              chatsArray.push({
                id: `${c.codcli}_${ext.telefone}`,
                name: c.cliente,
                contactName: ext.nome_contato,
                hasMultipleContacts: extras.length > 1,
                time: '',
                preview: ext.telefone,
                unread: 0,
                active: false,
                tags: ext.tags ? ext.tags.split(',').map((t: string) => t.trim()) : []
              });
            });
          });

          setChats(chatsArray);

          if (overrideCliente) {
            const targetChat = chatsArray.find(c => c.preview === overrideCliente);
            if (targetChat) {
              setActiveChat(targetChat.id);
            }
          }
        }
      } catch (error) {
        console.error('Erro ao buscar clientes para o chat:', error);
      }
    };
    fetchChatsList();
  }, [contactType, selectedVendedor, activeCodusur, vendedores, overrideCliente]);

  // Socket.io Listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('receive-message', (data: any) => {
      // Quando receber uma mensagem via WebSocket
      // Verifica se a mensagem pertence ao chat ativo
      if (activeChatData && data.telefone === activeChatData.preview) {
        const newMsg: Message = {
          id: data.id || Date.now(),
          text: data.texto,
          sender: data.sentido === 'IN' ? 'other' : 'me',
          timestamp: new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        setMessages((prev) => [...prev, newMsg]);
      }
      
      // Atualizar last message no sidebar (opcional, pode ser feito depois)
    });

    socket.on('supervisor_solicitado', (data: any) => {
      // Se for supervisor, recebe isso
      alert(`O Vendedor ${maskData(data.vendedor)} precisa de ajuda com o cliente!`);
    });

    return () => {
      socket.off('receive-message');
      socket.off('supervisor_solicitado');
    };
  }, [socket]);

  const handleSendSuggestions = async () => {
    if (selectedProducts.length === 0 || !activeChatData) return;
    
    const percInput = document.getElementById('mix-perc') as HTMLInputElement;
    let perc = percInput ? (Number(percInput.value) || 0) : 0;
    if (perc < -5) perc = -5;

    // Limita a 20 produtos para o encarte
    const limitedProducts = selectedProducts.slice(0, 20);
    
    // Adicionar as sugestões ao carrinho automaticamente
    limitedProducts.forEach(cod => {
      const prod = mixProdutos.find(p => p.codprod === cod);
      if (prod) {
        let pAtual = Number(prod.preco);
        if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));

        addToCart({
          codprod: Number(prod.codprod),
          descricao: prod.descricao,
          qt: 1,
          pvenda: pAtual,
          codcli: activeChat!.split('_')[0],
          ean: prod.ean
        });
      }
    });

    let overallMessage = `*Confira as nossas sugestões para você:*\n`;
    if (overrideVendedor && user?.role?.toUpperCase() === 'SUPERVISOR') {
      overallMessage = `*[Supervisor ${user.nome}] sugere:*\n`;
    }

    const cards = [];

    for (const cod of limitedProducts) {
      const prod = mixProdutos.find(p => p.codprod === cod);
      if (prod) {
        let pAtual = Number(prod.preco);
        if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));

        const uni = prod.tipoembalagem === 'P' ? 'kg' : 'un';
        let text = `1x - R$ ${pAtual.toFixed(2).replace('.', ',')}/${uni}`;
        
        cards.push({
            codprod: prod.codprod,
            title: prod.descricao,
            text: text
        });

        overallMessage += `\n- 1x ${prod.descricao} por R$ ${pAtual.toFixed(2).replace('.', ',')} un`;
      }
    }
    const tempId = Date.now() + Math.random();
    setMessages(prev => [...prev, { 
        id: tempId as any, 
        text: overallMessage, 
        sender: 'me', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }]);
    
    try {
        await fetch('/api/chat/send-carousel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telefone: activeChatData.preview, 
                message: overallMessage, 
                codusur: activeCodusur, 
                cards 
            })
        });
    } catch (e) {
        console.error('Erro ao enviar sugestões via encarte:', e);
    }
    
    setSelectedProducts([]);
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Seu navegador não suporta gravação de áudio ou bloqueou o recurso por falta de HTTPS (conexão segura).');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Erro ao acessar microfone', err);
      alert(`Não foi possível acessar o microfone. Motivo: ${err.message || 'Permissão negada ou nenhum microfone encontrado'}. (Se estiver acessando via IP HTTP, o navegador bloqueia por segurança)`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
  };

  const handleBuscarOrcamentoProdutos = async () => {
    setOrcamentoLoading(true);
    try {
      const res = await fetch(`/api/produtos/busca?termo=${encodeURIComponent(orcamentoSearch)}&limit=100`);
      const data = await res.json();
      if (data.success) {
        setOrcamentoProdutos(data.produtos);
      }
    } catch (e) {
      console.error(e);
    }
    setOrcamentoLoading(false);
  };

  const handleGerarOrcamentoPDF = async (downloadOnly = false) => {
    if (!activeChatData) return;
    setOrcamentoGerando(true);
    try {
      const selected = Object.entries(orcamentoItems)
        .filter(([_, data]) => data.selecionado)
        .map(([codprod, data]) => {
           const p = orcamentoProdutos.find(prod => String(prod.codprod) === codprod);
           return { ...p, qtd: data.qtd, perc: data.perc };
        }).filter(p => p.codprod);

      if (selected.length === 0) {
        alert('Selecione ao menos um produto para o orçamento.');
        setOrcamentoGerando(false);
        return;
      }

      let empresaData: any = null;
      let clienteData: any = null;
      let validadeOrc = '24 horas';
      let logoBase64: string | null = null;
      try {
        const codcli = activeChatData.id.split('_')[0];
        const resDados = await fetch(`/api/chat/orcamento-dados/${codcli}`);
        const dataDados = await resDados.json();
        if (dataDados.success) {
           empresaData = dataDados.empresa;
           clienteData = dataDados.cliente;
           if (dataDados.validadeOrcamento) validadeOrc = dataDados.validadeOrcamento;
        }

        const logoRes = await fetch('/logo-ag.png');
        if (logoRes.ok) {
           const logoBlob = await logoRes.blob();
           logoBase64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(logoBlob);
           });
        }
      } catch (e) {
        console.error('Erro ao buscar dados adicionais do orçamento', e);
      }

      const doc = new jsPDF('l', 'mm', 'a4');
      
      const startX = logoBase64 ? 50 : 14;

      if (logoBase64) {
         try {
           doc.addImage(logoBase64, 'PNG', 14, 15, 30, 20);
         } catch(e) {}
      }
      
      // Cabeçalho da Empresa
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(empresaData?.razaoSocial || '', startX, 20);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`CGC: ${empresaData?.cnpj || ''}`, startX, 25);
      doc.text(`END: ${empresaData?.endereco || ''}`, startX, 30);
      doc.text(`BAIRRO: ${empresaData?.bairro || ''}`, startX, 35);
      
      const cidUf = empresaData ? `${empresaData.cidade || ''} / ${empresaData.uf || ''}` : ' / ';
      doc.text(`CIDADE/UF: ${cidUf !== ' / ' ? cidUf : ''}`, startX, 40);
      
      doc.text(`CEP: ${empresaData?.cep || ''}`, startX, 45);
      doc.text(`FONE: ${empresaData?.telefone || ''}`, startX, 50);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('ORÇAMENTO', 280, 25, { align: 'right' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const todayStr = new Date().toLocaleDateString();
      const timeStr = new Date().toLocaleTimeString();
      doc.text(`Data: ${todayStr}`, 280, 30, { align: 'right' });
      doc.text(`Impresso em ${todayStr} ${timeStr}`, 280, 35, { align: 'right' });
      doc.text('Status: Pendente', 280, 40, { align: 'right' });
      doc.text(`Validade: ${validadeOrc}`, 280, 45, { align: 'right' });
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`Representante:`, 80, 45);
      doc.setFont('helvetica', 'normal');
      doc.text(`COD. ${activeCodusur} - ${user?.nome?.toUpperCase() || ''}`, 80, 50);
      
      // Caixa do Cliente
      doc.setFillColor(240, 240, 240);
      doc.rect(14, 55, 269, 25, 'F');
      doc.rect(14, 55, 269, 25, 'S');
      
      if (clienteData) {
          doc.text(`CLIENTE: ${clienteData.codcli} - ${clienteData.nome}`, 16, 60);
          doc.text(`CPF/CNPJ: ${clienteData.cnpj || ''}`, 120, 60);
          doc.text(`FONE: ${clienteData.telefone || activeChatData.preview}`, 210, 60);
          doc.text(`END. COM: ${clienteData.endereco || ''}`, 16, 65);
          doc.text(`BAIRRO: ${clienteData.bairro || ''}`, 120, 65);
          doc.text(`CEP: ${clienteData.cep || ''}`, 210, 65);
          doc.text(`CIDADE: ${clienteData.cidade || ''}`, 120, 70);
          doc.text(`UF: ${clienteData.uf || ''}`, 210, 70);
      } else {
          doc.text(`CLIENTE: ${activeChatData.name}`, 16, 60);
          doc.text(`FONE: ${activeChatData.preview}`, 210, 60);
      }
      
      const tableData: any[] = [];
      const images: Record<string, string> = {};

      let totalProdutos = 0;
      for (const p of selected) {
         try {
            const res = await fetch(`/api/produtos/imagem/${p.codprod}`);
            const blob = await res.blob();
            if (blob.type.startsWith('image/')) {
                const base64 = await new Promise<string>((resolve) => {
                   const reader = new FileReader();
                   reader.onloadend = () => resolve(reader.result as string);
                   reader.readAsDataURL(blob);
                });
                images[p.codprod] = base64;
            }
         } catch(e) {
            console.error('Erro imagem:', e);
         }

          const precoFinal = p.preco - (p.preco * (p.perc / 100));
          const totalItem = precoFinal * p.qtd;
          totalProdutos += totalItem;
          
          tableData.push([
            '', // ITEM
            '', // FOTO
            p.codprod, // COD
            p.descricao,
            p.ean,
            p.qtunit + ' ' + p.unidade,
            '', // COD. FAB
            '', // MARCA
            p.unidade, // UN
            p.qtd,
            Number(precoFinal).toFixed(2).replace('.', ','),
            Number(totalItem).toFixed(2).replace('.', ',')
          ]);
      }
      
      let itemCounter = 1;
      for(let row of tableData) {
         row[0] = itemCounter++;
      }
      
      autoTable(doc, {
        startY: 85,
        head: [['ITEM', 'FOTO', 'COD.', 'DESCRICAO', 'COD. BARRAS', 'EMB.', 'COD. FAB.', 'MARCA', 'UN', 'QTDE', 'VLR. UNIT.', 'TOTAL']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontSize: 7, fontStyle: 'bold', halign: 'center', lineWidth: 0.1, lineColor: [200,200,200] },
        bodyStyles: { fontSize: 7, minCellHeight: 12, textColor: [50,50,50] },
        columnStyles: {
           0: { cellWidth: 10, halign: 'center' },
           1: { cellWidth: 15, halign: 'center' },
           2: { cellWidth: 12, halign: 'center' },
           3: { cellWidth: 122 },
           4: { cellWidth: 20 },
           5: { cellWidth: 15 },
           6: { cellWidth: 15 },
           7: { cellWidth: 15 },
           8: { cellWidth: 10, halign: 'center' },
           9: { cellWidth: 10, halign: 'center' },
           10: { cellWidth: 15, halign: 'right' },
           11: { cellWidth: 15, halign: 'right' }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 1) {
            const rowIndex = data.row.index;
            const codprod = selected[rowIndex].codprod;
            const base64 = images[codprod];
            if (base64 && base64.startsWith('data:image') && !base64.includes('svg')) {
              let format = 'JPEG';
              if (base64.includes('image/png')) format = 'PNG';
              else if (base64.includes('image/webp')) format = 'WEBP';
              try {
                // Adjust position to center the image within the 15mm cell
                doc.addImage(base64, format, data.cell.x + 2.5, data.cell.y + 1, 10, 10);
              } catch (e) {
                console.error('Error adding image to pdf', e);
              }
            }
          }
        },
        rowPageBreak: 'avoid',
      });
      
      const finalY = (doc as any).lastAutoTable.finalY + 5;
      
      // Footer
      doc.setFillColor(240, 240, 240);
      doc.rect(14, finalY, 269, 30, 'F');
      doc.rect(14, finalY, 269, 30, 'S');
      
      doc.setFontSize(8);
      doc.text('FORM. PAGTO:', 16, finalY + 5);
      doc.text('COND. PAGTO:', 16, finalY + 10);
      doc.text('FRETE:', 16, finalY + 15);
      
      doc.text('VALOR TOTAL IPI:', 210, finalY + 5);
      doc.text('R$ 0,00', 280, finalY + 5, { align: 'right' });
      
      doc.text('VALOR TOTAL ST:', 210, finalY + 10);
      doc.text('R$ 0,00', 280, finalY + 10, { align: 'right' });
      
      doc.text('TOTAL PRODUTOS:', 210, finalY + 15);
      doc.text('R$ ' + totalProdutos.toFixed(2).replace('.', ','), 280, finalY + 15, { align: 'right' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('VALOR GERAL:', 210, finalY + 25);
      doc.text('R$ ' + totalProdutos.toFixed(2).replace('.', ','), 280, finalY + 25, { align: 'right' });

      const pdfBlob = doc.output('blob');
      if (downloadOnly) {
         doc.save(`orcamento_${activeChatData.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
         setOrcamentoGerando(false);
         return;
      }
      
      const file = new File([pdfBlob], 'orcamento.pdf', { type: 'application/pdf' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('telefone', activeChatData.preview);
      formData.append('codusur', String(activeCodusur));

      const response = await fetch('/api/chat/send-media', {
        method: 'POST',
        body: formData
      });
      const respData = await response.json();
      
      if (!respData.success) {
        alert('Erro ao enviar orçamento: ' + respData.error);
      } else {
        setRightPanelTab('info');
      }

    } catch (e) {
      console.error(e);
      alert('Erro ao gerar orçamento.');
    }
    setOrcamentoGerando(false);
  };


  const handleSendMessage = async () => {
    if (!activeChatData || !activeCodusur) return;
    if (!messageInput.trim() && !selectedFile && !audioBlob) return;

    let currentText = messageInput.trim();
    const isSuper = user?.funcao?.toLowerCase() === 'supervisor';
    
    if (isSuper && currentText) {
      currentText = `*[Supervisor ${user.nome}]*:\n${currentText}`;
    }

    const currentFile = selectedFile;
    const currentAudio = audioBlob;
    setMessageInput('');
    setSelectedFile(null);
    setAudioBlob(null);
    setRecordingDuration(0);
    setShowTemplatesPopover(false);
    setShowEmojiPicker(false);

    // Otimista (mock)
    if (currentText && !currentFile && !currentAudio) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: currentText,
        sender: 'me',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } else if (currentFile) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `[Arquivo: ${currentFile.name}] ${currentText}`,
        sender: 'me',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } else if (currentAudio) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `[Audio Enviado]`,
        sender: 'me',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }

    try {
      if (currentFile || currentAudio) {
        const formData = new FormData();
        if (activeCodusur) formData.append('codusur', activeCodusur.toString());
        formData.append('telefone', activeChatData.preview);
        
        if (currentText && currentFile) formData.append('caption', currentText);

        if (currentAudio) {
          const audioFile = new File([currentAudio], 'audio_message.ogg', { type: 'audio/ogg' });
          formData.append('file', audioFile);
        } else if (currentFile) {
          formData.append('file', currentFile);
        }

        const response = await fetch('/api/chat/send-media', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        if (!data.success) {
          alert('Erro ao enviar mídia: ' + data.error);
        }
      } else {
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codusur: activeCodusur,
            telefone: activeChatData.preview,
            texto: currentText
          })
        });
        
        const data = await response.json();
        if (!data.success) {
          alert('Erro ao enviar mensagem: ' + data.error);
        }
      }
    } catch (err) {
      console.error('Erro no envio HTTP:', err);
    }
  };

  const requestSupervisor = () => {
    setShowSupervisorAlert(true);
    
    if (socket && isConnected) {
      socket.emit('chamar_supervisor', {
        chatId: activeChat,
        motivo: 'Preciso de ajuda no fechamento'
      });
    }

    setTimeout(() => {
      setShowSupervisorAlert(false);
    }, 5000);
  };

  const handleEditTags = async () => {
    if (!activeChatData) return;
    const currentTags = (activeChatData.tags || []).join(', ');
    const newTagsStr = prompt('Digite as tags para este cliente (separadas por vírgula):', currentTags);
    
    if (newTagsStr !== null) {
      const codcli = activeChatData.id.split('_')[0];
      const telefone = activeChatData.preview;
      try {
        await fetch('/api/contatos/tags', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codcli, telefone, tags: newTagsStr })
        });
        const newTagsArr = newTagsStr.split(',').map(t => t.trim()).filter(Boolean);
        setChats(prev => prev.map(c => c.id === activeChat ? { ...c, tags: newTagsArr } : c));
      } catch (e) {
        console.error('Erro ao atualizar tags:', e);
        alert('Erro ao atualizar tags. Tente novamente.');
      }
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-fade-in">
      {/* Sidebar de Conversas */}
      <div className="w-80 glass-card rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-sm">
        <div className="p-4 border-b border-[var(--border-color)]">
          <div className="flex gap-2 mb-3">
             <button onClick={() => setContactType('clientes')} className={clsx("flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors", contactType === 'clientes' ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>Clientes</button>
             <button onClick={() => setContactType('vendedores')} className={clsx("flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors", contactType === 'vendedores' ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>Vendedores</button>
          </div>

          {contactType === 'clientes' && isGestor && (
            <select
              value={selectedVendedor}
              onChange={(e) => setSelectedVendedor(e.target.value)}
              className="w-full mb-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-slate-900 dark:text-white outline-none"
            >
              <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Todos os Vendedores</option>
              {vendedores.map(v => (
                <option key={v.codusur || v.CODUSUR} value={v.codusur || v.CODUSUR} style={{ color: '#000', backgroundColor: '#fff' }}>{v.nome || v.NOME}</option>
              ))}
            </select>
          )}

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              value={searchChat}
              onChange={(e) => setSearchChat(e.target.value)}
              placeholder="Buscar conversas..." 
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-transparent dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary-500 transition-all text-slate-900 dark:text-white"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedTagFilter('')}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors",
                  selectedTagFilter === '' ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                Todas
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTagFilter(tag)}
                  className={clsx(
                    "px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors flex items-center gap-1",
                    selectedTagFilter === tag ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  <Tag size={10} /> {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {contactType === 'clientes' && isGestor && !selectedVendedor ? (
             <div className="p-6 text-center text-slate-400 text-sm">
               Selecione um vendedor para ver a lista de clientes.
             </div>
          ) : (
            <>
              {filteredChats.slice(0, 150).map((chat) => (
                <div 
                  key={chat.id}
                  onClick={() => setActiveChat(chat.id)}
                  className={clsx(
                    "p-4 cursor-pointer transition-all border-l-4",
                    activeChat === chat.id 
                      ? "bg-slate-50 dark:bg-slate-800/50 border-primary-500" 
                      : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className={clsx("font-semibold truncate pr-2", activeChat === chat.id ? "text-primary-600 dark:text-primary-400" : "text-slate-900 dark:text-white")} title={chat.name}>
                      {maskData(chat.name)}
                    </h4>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{chat.time}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col truncate pr-2">
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                        {maskData(chat.preview)}
                      </p>
                      {chat.hasMultipleContacts && (
                        <span className="text-xs text-slate-400 truncate">{maskData(chat.contactName)}</span>
                      )}
                      {chat.tags && chat.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {chat.tags.map((t: string) => (
                            <span key={t} className="text-[9px] bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Tag size={8} /> {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {chat.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              
              {filteredChats.length === 0 && (
                 <div className="p-6 text-center text-slate-400 text-sm">
                   Nenhum contato na sua lista.
                 </div>
              )}

              {filteredChats.length > 150 && (
                 <div className="p-4 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                   Mostrando os 150 primeiros resultados. Use a busca para refinar.
                 </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Área do Chat */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden shadow-sm">
        {activeChat ? (
          <>
            {/* Header do Chat */}
            <div className="h-16 border-b border-[var(--border-color)] px-6 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                  {activeChatData?.name?.substring(0,2).toUpperCase() || 'CLI'}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white" title={activeChatData?.name}>{maskData(activeChatData?.name)}</h3>
                  <p className="text-xs text-emerald-500 font-medium">{maskData(activeChatData?.preview) || 'WhatsApp'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsOrcamentoModalOpen(true)}
                  className="p-2 text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-colors hidden sm:block" 
                  title="Orçamento"
                >
                  <ClipboardList size={20} />
                </button>
                <button 
                  onClick={handleEditTags}
                  className="p-2 text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-colors hidden sm:block" 
                  title="Editar Etiquetas (Tags)"
                >
                  <Tag size={20} />
                </button>
                <button 
                  onClick={requestSupervisor}
                  className="p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-xl transition-colors hidden sm:block" 
                  title="Chamar Supervisor"
                >
                  <AlertCircle size={20} />
                </button>
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
                <button 
                  onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                  className={clsx(
                    "p-2 rounded-xl transition-colors",
                    isRightPanelOpen ? "bg-primary-50 text-primary-600 dark:bg-primary-500/10" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                  title="Inteligência e Mix"
                >
                  <Info size={20} />
                </button>
              </div>
            </div>

            {/* Aviso de Supervisor */}
            {showSupervisorAlert && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex items-center gap-3 animate-slide-up">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Supervisor Solicitado</h4>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">Aguarde, um supervisor foi notificado e logo entrará na conversa.</p>
                </div>
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingHistory ? (
                <div className="flex justify-center items-center h-full">
                  <span className="text-slate-400">Carregando mensagens...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center items-center h-full">
                  <span className="text-slate-400">Nenhuma mensagem neste chat. Mande um "Oi"!</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAudio = msg.text.startsWith('[AUDIO]');
                  const audioFileIdMatch = isAudio ? msg.text.match(/\[AUDIO\]([^.\n]+)\.ogg/) : null;
                  const audioFileId = audioFileIdMatch ? audioFileIdMatch[1] : null;
                  const audioUrl = audioFileId ? `/uploads/${audioFileId}.ogg` : null;
                  const transcriptionMatch = isAudio ? msg.text.match(/\[TRANSCRICAO\]\s*([\s\S]*)/) : null;
                  const dbTranscription = transcriptionMatch ? transcriptionMatch[1] : null;
                  
                  return (
                  <div key={msg.id} className={clsx("flex flex-col max-w-[75%]", msg.sender === 'me' ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div 
                      className={clsx(
                        "px-4 py-2.5 rounded-2xl shadow-sm",
                        msg.sender === 'me' 
                          ? "bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm" 
                          : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-sm border border-[var(--border-color)]"
                      )}
                    >
                      {isAudio ? (
                        <div className="flex flex-col gap-2 min-w-[220px]">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <MessageSquare size={16} /> Mensagem de Áudio
                          </div>
                          <audio controls src={audioUrl!} className="h-10 w-full" />
                          <div className="flex items-center gap-2">
                            <a
                              href={audioUrl!}
                              download={`${audioFileId}.ogg`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center gap-1 py-1 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-200 dark:border-slate-600"
                            >
                              <Download size={13} /> Baixar
                            </a>
                            {!(transcriptions[audioFileId!] || dbTranscription) && (
                              <button
                                onClick={() => handleTranscribe(audioFileId!)}
                                disabled={transcribing[audioFileId!]}
                                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-lg text-xs font-medium transition-colors border border-primary-200 dark:border-primary-800 disabled:opacity-50"
                              >
                                {transcribing[audioFileId!] ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                                Transcrever
                              </button>
                            )}
                          </div>
                          {(transcriptions[audioFileId!] || dbTranscription) && (
                            <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-700 text-sm whitespace-pre-wrap text-slate-900 dark:text-slate-200">
                              <span className="text-xs font-semibold text-slate-500 block mb-1">Transcrição:</span>
                              {transcriptions[audioFileId!] || dbTranscription}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                      {msg.sender === 'me' && <CheckCheck size={12} className="text-primary-500" />}
                    </div>
                  </div>
                )})
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de Mensagem */}
            <div className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-t border-[var(--border-color)] relative">
              {showTemplatesPopover && (
                <div className="absolute bottom-full mb-2 left-4 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 dark:border-slate-700 overflow-hidden z-20 animate-fade-in">
                  <div className="p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Respostas Rápidas</span>
                    <span className="text-[10px] text-slate-400">Pressione Esc para fechar</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {templates.filter(t => t.titulo.toLowerCase().includes(templateSearch) || t.texto.toLowerCase().includes(templateSearch)).map(t => (
                      <div 
                        key={t.id}
                        className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors"
                        onClick={() => {
                          setMessageInput(t.texto);
                          setShowTemplatesPopover(false);
                        }}
                      >
                        <div className="font-medium text-sm text-slate-900 dark:text-white mb-0.5">{t.titulo}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{t.texto}</div>
                      </div>
                    ))}
                    {templates.length > 0 && templates.filter(t => t.titulo.toLowerCase().includes(templateSearch) || t.texto.toLowerCase().includes(templateSearch)).length === 0 && (
                       <div className="p-4 text-center text-sm text-slate-400 italic">Nenhum template encontrado.</div>
                    )}
                    {templates.length === 0 && (
                       <div className="p-4 text-center text-sm text-slate-400 italic">Nenhum template cadastrado no sistema.</div>
                    )}
                  </div>
                </div>
              )}

              {selectedFile && (
                <div className="mb-2 mx-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-between border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 truncate">
                    <Paperclip size={16} className="text-slate-500 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{selectedFile.name}</span>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

              {isRecording ? (
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 rounded-2xl p-2 px-4 border border-red-500/50 w-full">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-sm font-medium text-red-500 flex-1">
                    Gravando... {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </span>
                  <button 
                    onClick={discardRecording}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Descartar gravação"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button 
                    onClick={stopRecording}
                    className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm shadow-red-500/30"
                    title="Parar gravação"
                  >
                    <Square size={18} fill="currentColor" />
                  </button>
                </div>
              ) : audioBlob ? (
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 rounded-2xl p-2 px-4 border border-[var(--border-color)] w-full">
                  <div className="flex items-center gap-2 flex-1">
                    <Mic size={18} className="text-primary-500" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Áudio gravado ({Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')})</span>
                  </div>
                  <button 
                    onClick={discardRecording}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Descartar áudio"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button 
                    onClick={handleSendMessage}
                    className="p-2.5 bg-primary-500 text-white hover:bg-primary-600 rounded-xl transition-colors shadow-sm shadow-primary-500/30 shrink-0"
                  >
                    <Send size={18} className="translate-x-0.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-2xl p-2 border border-[var(--border-color)]">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-400 hover:text-primary-500 transition-colors shrink-0"
                  >
                    <Paperclip size={20} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <textarea 
                    rows={1}
                    value={messageInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMessageInput(val);
                      if (val.startsWith('/')) {
                        setShowTemplatesPopover(true);
                        setTemplateSearch(val.substring(1).toLowerCase());
                      } else {
                        setShowTemplatesPopover(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowTemplatesPopover(false);
                      } else if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (showTemplatesPopover) {
                          const filtered = templates.filter(t => t.titulo.toLowerCase().includes(templateSearch) || t.texto.toLowerCase().includes(templateSearch));
                          if (filtered.length > 0) {
                            setMessageInput(filtered[0].texto);
                            setShowTemplatesPopover(false);
                          }
                        } else {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder="Digite sua mensagem..." 
                    className="flex-1 bg-transparent border-none resize-none outline-none py-2 text-sm text-slate-900 dark:text-white max-h-32"
                  />
                  
                  <div className="relative" ref={emojiPickerRef}>
                    <button 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-2 text-slate-400 hover:text-primary-500 transition-colors shrink-0"
                    >
                      <Smile size={20} />
                    </button>
                    {showEmojiPicker && (
                      <div className="absolute bottom-full right-0 mb-2 z-50">
                        <EmojiPicker 
                          onEmojiClick={(emojiData) => {
                            setMessageInput(prev => prev + emojiData.emoji);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {messageInput.trim() || selectedFile ? (
                    <button 
                      onClick={handleSendMessage}
                      className="p-2.5 bg-primary-500 text-white hover:bg-primary-600 rounded-xl transition-colors shadow-sm shadow-primary-500/30 shrink-0"
                    >
                      <Send size={18} className="translate-x-0.5" />
                    </button>
                  ) : (
                    <button 
                      onClick={startRecording}
                      className="p-2.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary-500 hover:text-white rounded-xl transition-colors shrink-0"
                      title="Gravar áudio"
                    >
                      <Mic size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
              <MessageSquare size={32} className="text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-xl font-medium text-slate-900 dark:text-white mb-2">Selecione uma conversa</h3>
            <p className="max-w-md">Escolha um cliente na lista ao lado para iniciar ou continuar o atendimento.</p>
          </div>
        )}
      </div>

      {/* Painel Lateral Direito (Colapsável com Abas) */}
      {activeChat && activeChatData && isRightPanelOpen && (
        <div className="w-80 glass-card rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-sm border border-slate-200/50 dark:border-slate-700/50 animate-fade-in">
          <div className="flex border-b border-[var(--border-color)] bg-slate-50/50 dark:bg-slate-800/50">
            <button
              onClick={() => setRightPanelTab('info')}
              className={clsx(
                "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                rightPanelTab === 'info' 
                  ? "border-primary-500 text-primary-600 dark:text-primary-400" 
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Inteligência
            </button>
            <button
              onClick={() => setRightPanelTab('mix')}
              className={clsx(
                "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                rightPanelTab === 'mix' 
                  ? "border-primary-500 text-primary-600 dark:text-primary-400" 
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Mix Produtos
            </button>
            <button
              onClick={() => setRightPanelTab('cart')}
              className={clsx(
                "flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-1",
                rightPanelTab === 'cart' 
                  ? "border-primary-500 text-primary-600 dark:text-primary-400" 
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <ShoppingCart size={16} />
              {activeChat && getCartItems(activeChat.split('_')[0]).length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {getCartItems(activeChat.split('_')[0]).length}
                </span>
              )}
            </button>

          </div>
          
          <div className="flex-1 overflow-y-auto">
            {rightPanelTab === 'cart' ? (
               <CartPanel codcli={activeChat.split('_')[0]} telefone={activeChat.split('_')[1]} />
            ) : rightPanelTab === 'info' ? (
              <div className="p-4 flex flex-col gap-6">
                {/* Saúde Financeira */}
                <div>
                  <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    Saúde Financeira
                  </h4>
                  {!financeiroData ? (
                    <div className="text-sm text-slate-400">Carregando...</div>
                  ) : financeiroData.qtde_atraso > 0 ? (
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3 flex items-start gap-3">
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">Títulos em Atraso</p>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                          {financeiroData.qtde_atraso} boleto(s) pendente(s) totalizando R$ {Number(financeiroData.valor_atraso).toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-3 flex items-start gap-3">
                      <CheckCheck className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                      <div>
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Cliente em Dia</p>
                        <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Nenhuma pendência financeira encontrada.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Histórico de Compras */}
                <div>
                  <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2 justify-between">
                    <span>Últimos Pedidos</span>
                    {dtUltComp && (
                       <span className="text-xs text-slate-400 font-normal">
                         Última Compra: {new Date(dtUltComp).toLocaleDateString('pt-BR')}
                       </span>
                    )}
                  </h4>
                  {!pedidosData ? (
                    <div className="text-sm text-slate-400">Carregando...</div>
                  ) : pedidosData.length === 0 ? (
                    <div className="text-sm text-slate-400 italic">Nenhum pedido ou movimentação recente.</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {pedidosData.map((ped, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                          <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100 dark:border-slate-700/50">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Compra de {new Date(ped.data).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <div className="space-y-1.5 mb-2">
                            {ped.itens.slice(0, 15).map((item: any, i: number) => {
                              const pAtual = Number(item.precoAtual || item.pvenda);
                              const pAntigo = Number(item.pvenda);
                              const isCheaper = pAtual < pAntigo;
                              const diff = pAntigo - pAtual;
                              
                              return (
                                <div key={i} className={`flex flex-col text-xs border-b border-slate-50 dark:border-slate-700/30 pb-1 last:border-0 ${(item.inativo || item.semFv) ? 'opacity-50' : ''}`}>
                                  <div className="flex justify-between">
                                    <span className="text-slate-600 dark:text-slate-400 truncate pr-2" title={item.descricao}>
                                      {item.qt}x {maskData(item.descricao)}
                                      {item.inativo && <span className="text-[10px] text-red-500 font-medium ml-1">(Inativo)</span>}
                                      {!item.inativo && item.semFv && <span className="text-[10px] text-orange-500 font-medium ml-1">(Sem FV)</span>}
                                    </span>
                                  </div>
                                  <div className="flex justify-between mt-0.5">
                                    <span className="text-[10px] text-slate-400">Antigo: R$ {pAntigo.toFixed(2).replace('.', ',')}</span>
                                    {item.inativo ? (
                                      <span className="text-[10px] text-red-400">Produto Inativo</span>
                                    ) : item.semFv ? (
                                      <span className="text-[10px] text-orange-400">Não enviado ao FV</span>
                                    ) : isCheaper ? (
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                        Atual: R$ {pAtual.toFixed(2).replace('.', ',')} (↓ R$ {diff.toFixed(2).replace('.', ',')} - ✨ Melhoramos o preço!)
                                      </span>
                                    ) : (
                                      <span className="text-slate-600 dark:text-slate-300">
                                        Atual: R$ {pAtual.toFixed(2).replace('.', ',')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {ped.itens.length > 15 && (
                              <div className="text-[10px] text-primary-500 italic">+ {ped.itens.length - 15} itens não exibidos</div>
                            )}
                          </div>
                          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                              Total Anterior: <span className="text-slate-900 dark:text-white font-semibold">R$ {Number(ped.vltotal).toFixed(2).replace('.', ',')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  const percInput = document.getElementById(`add-perc-${idx}`) as HTMLInputElement;
                                  let perc = percInput ? (Number(percInput.value) || 0) : 0;
                                  if (perc < -5) perc = -5;

                                  let quoteText = `Olá! Relembrando sua compra do dia ${new Date(ped.data).toLocaleDateString('pt-BR')}:\n\n`;
                                  let hasInativo = false;
                                  ped.itens.forEach((item: any) => {
                                    if (item.inativo || item.semFv) {
                                      hasInativo = true;
                                      return;
                                    }
                                    let pAtual = Number(item.precoAtual || item.pvenda);
                                    if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));
                                    let pAntigo = Number(item.pvenda);
                                    let row = `- ${item.qt}x ${item.descricao}\n`;
                                    if (pAtual < pAntigo) {
                                      row = `✨ - ${item.qt}x ${item.descricao} (Melhoramos o preço!)\n`;
                                    }
                                    quoteText += row;
                                  });
                                  if (hasInativo) {
                                    quoteText += `\n*(Alguns produtos da compra original não estão mais disponíveis e foram removidos desta lista)*\n`;
                                  }
                                  quoteText += `\nPosso repetir esse pedido para você?`;
                                  
                                  // Adicionar itens ao carrinho e enviar mensagem direto
                                  ped.itens.forEach((item: any) => {
                                    if (!item.inativo && !item.semFv) {
                                      let pAtual = Number(item.precoAtual || item.pvenda);
                                      if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));
                                      addToCart({
                                        codprod: Number(item.codprod || item.id || 0),
                                        descricao: item.descricao,
                                        qt: item.qt,
                                        pvenda: pAtual,
                                        codcli: activeChat!.split('_')[0],
                                        ean: item.ean
                                      });
                                    }
                                  });

                                  const tempId = Date.now() + Math.random();
                                  setMessages(prev => [...prev, { id: tempId as any, text: quoteText, sender: 'me', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                                  
                                  const cards = ped.itens.filter((item:any) => !item.inativo && !item.semFv).map((item:any) => {
                                    let pAtual = Number(item.precoAtual || item.pvenda);
                                    if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));
                                    let pAntigo = Number(item.pvenda);
                                    let isMelhor = pAtual < pAntigo;
                                    
                                    return {
                                      codprod: item.codprod || item.id,
                                      title: item.descricao,
                                      text: `${item.qt}x`,
                                      splashText: isMelhor ? "PREÇO ESPECIAL" : undefined
                                    };
                                  });

                                  fetch('/api/chat/send-carousel', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ telefone: activeChatData!.preview, message: quoteText, codusur: activeCodusur, cards })
                                  }).catch(console.error);

                                }}
                                className="flex-1 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors flex items-center justify-center gap-1"
                                title="Enviar apenas a lista de produtos (sem preços)"
                              >
                                <Send size={12} /> Só Produtos
                              </button>

                              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 shadow-sm">
                                <input 
                                  type="number" 
                                  className="w-10 appearance-none text-[11px] font-semibold text-slate-900 dark:text-white bg-transparent outline-none text-center placeholder-slate-400" 
                                  placeholder="0"
                                  id={`add-perc-${idx}`}
                                />
                                <span className="text-[10px] font-medium text-slate-400">%</span>
                              </div>

                              <button 
                                onClick={() => {
                                  const percInput = document.getElementById(`add-perc-${idx}`) as HTMLInputElement;
                                  let perc = percInput ? (Number(percInput.value) || 0) : 0;
                                  if (perc < -5) perc = -5;

                                  let quoteText = `Olá! Relembrando sua compra do dia ${new Date(ped.data).toLocaleDateString('pt-BR')}:\n\n`;
                                  let hasInativo = false;
                                  ped.itens.forEach((item: any) => {
                                    if (item.inativo || item.semFv) {
                                      hasInativo = true;
                                      return; // Ignore inactive items in updated price quote
                                    }
                                    let pAtual = Number(item.precoAtual || item.pvenda);
                                    if (perc !== 0) {
                                      pAtual = pAtual * (1 + (perc / 100));
                                    }
                                    let pAntigo = Number(item.pvenda);
                                    
                                    let row = `- ${item.qt}x ${item.descricao} por R$ ${pAtual.toFixed(2).replace('.', ',')} un\n`;
                                    if (pAtual < pAntigo) {
                                      const savings = pAntigo - pAtual;
                                      row = `✨ - ${item.qt}x ${item.descricao} por R$ ${pAtual.toFixed(2).replace('.', ',')} un (↓ R$ ${savings.toFixed(2).replace('.', ',')} - Melhoramos o preço!)\n`;
                                    }
                                    quoteText += row;
                                  });
                                  if (hasInativo) {
                                    quoteText += `\n*(Alguns produtos da compra original não estão mais disponíveis e foram removidos desta lista)*\n`;
                                  }
                                  quoteText += `\nPosso repetir esse pedido para você com os preços atualizados?`;

                                  // Adicionar itens ao carrinho e enviar mensagem direto
                                  ped.itens.forEach((item: any) => {
                                    if (!item.inativo && !item.semFv) {
                                      let pAtual = Number(item.precoAtual || item.pvenda);
                                      if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));
                                      addToCart({
                                        codprod: Number(item.codprod || item.id || 0),
                                        descricao: item.descricao,
                                        qt: item.qt,
                                        pvenda: pAtual,
                                        codcli: activeChat!.split('_')[0],
                                        ean: item.ean
                                      });
                                    }
                                  });

                                  const tempId = Date.now() + Math.random();
                                  setMessages(prev => [...prev, { id: tempId as any, text: quoteText, sender: 'me', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                                  
                                  const cards = ped.itens.filter((item:any) => !item.inativo && !item.semFv).map((item:any) => {
                                    let pAtual = Number(item.precoAtual || item.pvenda);
                                    if (perc !== 0) pAtual = pAtual * (1 + (perc / 100));
                                    let pAntigo = Number(item.pvenda);
                                    let isMelhor = pAtual < pAntigo;
                                    
                                    return {
                                      codprod: item.codprod || item.id,
                                      title: item.descricao,
                                      text: `${item.qt}x - R$ ${pAtual.toFixed(2).replace('.', ',')} un`,
                                      splashText: isMelhor ? `R$ ${pAtual.toFixed(2).replace('.', ',')}` : undefined
                                    };
                                  });

                                  fetch('/api/chat/send-carousel', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ telefone: activeChatData!.preview, message: quoteText, codusur: activeCodusur, cards })
                                  }).catch(console.error);

                                }}
                                className="flex-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors flex items-center justify-center gap-1"
                                title="Enviar produtos com os preços atuais (e adicional aplicado)"
                              >
                                <Send size={12} /> C/ Preço
                              </button>
                              </div>
                            </div>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-[var(--border-color)]">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={mixSearch}
                      onChange={e => setMixSearch(e.target.value)}
                      placeholder="Buscar no mix (cód ou desc)..." 
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-transparent dark:border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-primary-500 transition-all text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    <button 
                      onClick={() => setSelectedDepto('')}
                      className={clsx(
                        "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                        selectedDepto === '' ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      )}
                    >
                      Todos
                    </button>
                    {Array.from(new Set(mixProdutos.map(p => p.departamento).filter(Boolean))).map(d => (
                      <button 
                        key={d as string}
                        onClick={() => setSelectedDepto(d as string)}
                        className={clsx(
                          "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                          selectedDepto === d ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        {d as string}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMix ? (
                    <div className="text-center text-slate-400 py-10">Carregando mix...</div>
                  ) : (
                    (selectedDepto 
                      ? mixProdutos.filter(p => p.departamento === selectedDepto)
                      : mixProdutos
                    ).filter(p => {
                      if (!mixSearch) return true;
                      const term = mixSearch.toLowerCase();
                      return String(p.codprod).includes(term) || (p.descricao || '').toLowerCase().includes(term);
                    }).map((prod) => {
                      const isSelected = selectedProducts.includes(prod.codprod);
                      return (
                        <div 
                          key={prod.codprod}
                          onClick={() => {
                            if (isSelected) setSelectedProducts(prev => prev.filter(id => id !== prod.codprod));
                            else setSelectedProducts(prev => [...prev, prod.codprod]);
                          }}
                          className={clsx(
                            "p-3 rounded-xl border cursor-pointer transition-all relative overflow-hidden group",
                            isSelected 
                              ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-sm" 
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary-300 dark:hover:border-slate-600"
                          )}
                        >
                          <div className="absolute top-2 right-2">
                            <div className={clsx(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                              isSelected
                                ? "bg-primary-500 border-primary-500 text-white"
                                : "border-slate-300 dark:border-slate-600"
                            )}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          </div>
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{prod.codprod}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight mb-2 pr-6">
                            {maskData(prod.descricao)}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center gap-1">
                              <Tag size={12} /> R$ {Number(prod.preco).toFixed(2).replace('.', ',')}
                            </span>
                            {prod.ultimoPrecoPago && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded">
                                Último: R$ {Number(prod.ultimoPrecoPago).toFixed(2).replace('.', ',')}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
                            <span>Emb: {prod.qtunit} {prod.unidade}</span>
                            <span>Estoque: {prod.estoque}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-4 border-t border-[var(--border-color)] bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 shadow-sm shrink-0 w-20">
                      <input 
                        type="number" 
                        className="w-full text-sm font-semibold text-slate-900 dark:text-white bg-transparent outline-none text-center placeholder-slate-400" 
                        placeholder="0"
                        id="mix-perc"
                      />
                      <span className="text-xs font-medium text-slate-400">%</span>
                    </div>
                    <button 
                      onClick={handleSendSuggestions}
                      disabled={selectedProducts.length === 0}
                      className="flex-1 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Send size={16} />
                      Enviar ({selectedProducts.length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Orçamento */}
      {isOrcamentoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList size={20} className="text-primary-500" />
                Orçamento
              </h2>
              <button 
                onClick={() => setIsOrcamentoModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text"
                        placeholder="Buscar por descrição, cód ou EAN..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                        value={orcamentoSearch}
                        onChange={e => setOrcamentoSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleBuscarOrcamentoProdutos()}
                      />
                    </div>
                    <button
                      onClick={handleBuscarOrcamentoProdutos}
                      disabled={orcamentoLoading}
                      className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                    >
                      {orcamentoLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      Buscar
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50 dark:bg-slate-900/50">
                  {orcamentoProdutos.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm mt-10">
                      Nenhum produto encontrado.
                    </div>
                  ) : (
                    orcamentoProdutos.map(prod => {
                      const itemData = orcamentoItems[prod.codprod] || { selecionado: false, qtd: 1, perc: 0 };
                      const isSelected = itemData.selecionado;
                      const precoFinal = prod.preco - (prod.preco * (itemData.perc / 100));

                      return (
                        <div key={prod.codprod} className={clsx("shrink-0 p-4 rounded-xl border transition-all relative overflow-hidden", isSelected ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-sm" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800")}>
                          <div className="flex gap-4 items-start">
                             <input 
                               type="checkbox"
                               checked={isSelected}
                               onChange={(e) => setOrcamentoItems(prev => ({
                                  ...prev,
                                  [prod.codprod]: { ...itemData, selecionado: e.target.checked }
                               }))}
                               className="mt-1 w-5 h-5 text-primary-600 rounded border-slate-300 focus:ring-primary-500 cursor-pointer shrink-0"
                             />
                             <img 
                               src={`/api/produtos/imagem/${prod.codprod}`} 
                               alt={prod.descricao} 
                               className="w-14 h-14 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700" 
                               onError={(e) => {
                                 (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjdjRkNTYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjkiIGN5PSI5IiByPSIyIi8+PHBhdGggZD0ibTIxIDE1LTMuMDgtMy4wOGExLjIgMS4yIDAgMCAwLTEuNzIgMGwtNC4yNyA0LjI3Ii8+PHBhdGggZD0iTTcgMjFsNS4wMi01LjAyYTEuMiAxLjIgMCAwIDEgMS43MiAwbDEuODMgMS44MyIvPjwvc3ZnPg==';
                               }}
                             />
                             <div className="flex-1 min-w-0">
                                <div className="text-xs text-slate-500 font-medium mb-1 truncate">Cód: {prod.codprod} | EAN: {prod.ean}</div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1 truncate">{maskData(prod.descricao)}</div>
                                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                  <span>Emb: {prod.qtunit} {prod.unidade}</span>
                                  <span>Preço Tab: R$ {Number(prod.preco).toFixed(2).replace('.', ',')}</span>
                                </div>
                                {isSelected && (
                                  <div className="flex gap-4 items-center bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
                                    <div className="flex flex-col flex-1">
                                      <label className="text-xs font-semibold text-slate-500 mb-1">Qtd.</label>
                                      <input 
                                        type="number" min="1"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md p-2 bg-transparent"
                                        value={itemData.qtd}
                                        onChange={e => setOrcamentoItems(prev => ({
                                           ...prev,
                                           [prod.codprod]: { ...itemData, qtd: Number(e.target.value) }
                                        }))}
                                      />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                      <label className="text-xs font-semibold text-slate-500 mb-1">Desc (%)</label>
                                      <input 
                                        type="number" min="0" max="5" step="0.1"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md p-2 bg-transparent"
                                        value={itemData.perc}
                                        onChange={e => {
                                          let val = Number(e.target.value);
                                          if (val > 5) val = 5;
                                          if (val < 0) val = 0;
                                          setOrcamentoItems(prev => ({
                                           ...prev,
                                           [prod.codprod]: { ...itemData, perc: val }
                                          }))
                                        }}
                                      />
                                    </div>
                                    <div className="flex flex-col flex-1 text-right justify-center">
                                      <label className="text-xs font-semibold text-slate-500 mb-1">Preço Final</label>
                                      <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
                                        R$ {Number(precoFinal).toFixed(2).replace('.', ',')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                             </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3">
                  <button
                    onClick={() => setIsOrcamentoModalOpen(false)}
                    className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                        handleGerarOrcamentoPDF(true);
                        setIsOrcamentoModalOpen(false);
                    }}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {orcamentoGerando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    Baixar PDF
                  </button>
                  <button
                    onClick={() => {
                        handleGerarOrcamentoPDF(false);
                        setIsOrcamentoModalOpen(false);
                    }}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {orcamentoGerando ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                    Gerar e Enviar PDF
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

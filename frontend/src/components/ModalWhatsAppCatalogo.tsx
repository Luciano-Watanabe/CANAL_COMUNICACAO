import { useState, useEffect } from 'react';
import { X, Send, Users, AlertCircle, Phone } from 'lucide-react';
import html2pdf from 'html2pdf.js';

interface Cliente {
  codcli: number;
  fantasia: string;
  telefone: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendedores: any[];
  atividades: any[];
  ramoSelecionado: string;
  codusurLogged?: string;
  onSend: (data: FormData) => Promise<any>;
}

export default function ModalWhatsAppCatalogo({ isOpen, onClose, vendedores, atividades, ramoSelecionado, codusurLogged, onSend }: ModalProps) {
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [telefoneVendedor, setTelefoneVendedor] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientes, setSelectedClientes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('catalogo_config');
    if (saved) return JSON.parse(saved);
    return {
      tipoMensagem: 'LANCAMENTO',
      mensagemPadrao: 'Confira nossos lançamentos deste mês no catálogo anexo!'
    };
  });

  const TIPOS_MENSAGEM = [
    { id: 'LANCAMENTO', label: 'Lançamentos', template: 'Confira nossos lançamentos deste mês no catálogo anexo!' },
    { id: 'PROMOCAO', label: 'Promoção', template: 'Preços especiais! Veja nosso catálogo de ofertas anexo.' },
    { id: 'ATUALIZACAO', label: 'Atualização', template: 'Nosso catálogo foi atualizado, confira as novidades no PDF.' }
  ];

  useEffect(() => {
    localStorage.setItem('catalogo_config', JSON.stringify(config));
  }, [config]);

  const handleConfigTipoChange = (novoTipoId: string) => {
    const tipo = TIPOS_MENSAGEM.find(t => t.id === novoTipoId);
    if (tipo) {
      setConfig({ ...config, tipoMensagem: novoTipoId, mensagemPadrao: tipo.template });
    }
  };

  useEffect(() => {
    if (isOpen && selectedVendedor) {
      fetchClientes(selectedVendedor);
    }
  }, [selectedVendedor, isOpen]);

  const fetchClientes = async (vendedorId: string) => {
    setLoadingClientes(true);
    try {
      const res = await fetch(`/api/clientes/esquecidos?vendedorId=${vendedorId}&dias=-1`);
      const data = await res.json();
      if (data.success && data.esquecidos) {
        const validClients = data.esquecidos.filter((c: any) => c.telefone && c.telefone.trim().length >= 10);
        setClientes(validClients);
        setSelectedClientes(new Set(validClients.map((c: any) => c.codcli)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedClientes.size === clientes.length) {
      setSelectedClientes(new Set());
    } else {
      setSelectedClientes(new Set(clientes.map(c => c.codcli)));
    }
  };

  const handleToggleCliente = (codcli: number) => {
    const next = new Set(selectedClientes);
    if (next.has(codcli)) {
      next.delete(codcli);
    } else {
      next.add(codcli);
    }
    setSelectedClientes(next);
  };

  const handleSend = async () => {
    if (selectedClientes.size === 0) {
      alert('Selecione pelo menos um cliente para enviar.');
      return;
    }
    if (!selectedVendedor) {
      alert('Selecione os clientes de algum vendedor.');
      return;
    }

    setLoading(true);
    try {
      // 1. Generate PDF
      const element = document.querySelector('.catalog-print-container');
      if (!element) throw new Error('Não foi possível encontrar o container do catálogo.');
      
      const opt = {
        margin: 1,
        filename: 'catalogo.pdf',
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' as const }
      };

      const originalDisplay = (element as HTMLElement).style.display;
      (element as HTMLElement).style.display = 'block';

      const pdfBlob = await html2pdf().set(opt).from(element as HTMLElement).output('blob');
      
      (element as HTMLElement).style.display = originalDisplay;

      // 2. Prepare FormData
      const formData = new FormData();
      formData.append('pdf', pdfBlob, 'catalogo.pdf');
      
      const clis = clientes
        .filter(c => selectedClientes.has(c.codcli))
        .map(c => ({
          codcli: c.codcli,
          nome: c.fantasia,
          telefone: c.telefone.split(',')[0].trim()
        }));

      formData.append('clientes', JSON.stringify(clis));
      formData.append('vendedorId', selectedVendedor); // Vendedor dos clientes
      formData.append('codusurLogged', codusurLogged || ''); // Usuário logado (Remetente)
      formData.append('telefoneVendedor', telefoneVendedor.replace(/\D/g, ''));
      
      const ramoObj = atividades.find(a => String(a.codatv) === String(ramoSelecionado));
      formData.append('ramoNome', ramoObj ? ramoObj.ramo : 'Geral');
      formData.append('mensagemPadrao', config.mensagemPadrao);
      formData.append('tipoMensagem', config.tipoMensagem);

      // 3. Send
      await onSend(formData);
      
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao gerar/enviar PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 rounded-t-xl">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-green-500" />
            Enviar Catálogo via WhatsApp
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              O catálogo será disparado usando a instância/número do <strong>seu próprio usuário</strong> ({codusurLogged}). 
              Abaixo, selecione de qual Vendedor você quer carregar a lista de clientes.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Carregar Clientes do Vendedor</label>
              <select
                value={selectedVendedor}
                onChange={(e) => setSelectedVendedor(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500"
              >
                <option value="">Selecione o vendedor...</option>
                {vendedores.map(v => (
                  <option key={v.CODUSUR || v.codusur} value={v.CODUSUR || v.codusur}>
                    {v.CODUSUR || v.codusur} - {v.NOME || v.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                WhatsApp do Vendedor (Cópia Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: 5511999999999"
                value={telefoneVendedor}
                onChange={(e) => setTelefoneVendedor(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500"
              />
              <p className="text-xs text-slate-500">
                Se preenchido (ou se existir no sistema), receberá um relatório e a cópia do catálogo.
              </p>
            </div>
          </div>

          {selectedVendedor && (
            <div className="border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[300px]">
              <div className="bg-slate-800 p-3 border-b border-slate-700 flex justify-between items-center">
                <h4 className="text-sm font-medium text-white flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Selecione os Clientes Destino
                </h4>
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-green-400 hover:text-green-300"
                >
                  {selectedClientes.size === clientes.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 bg-slate-900/50">
                {loadingClientes ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
                  </div>
                ) : clientes.length === 0 ? (
                  <div className="text-center p-8 text-slate-500 text-sm">
                    Nenhum cliente com telefone encontrado para este vendedor.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {clientes.map(c => (
                      <label key={c.codcli} className="flex items-center gap-3 p-2 hover:bg-slate-800/50 rounded cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedClientes.has(c.codcli)}
                          onChange={() => handleToggleCliente(c.codcli)}
                          className="w-4 h-4 rounded border-slate-600 text-green-500 focus:ring-green-500 focus:ring-offset-slate-900"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 truncate">{c.codcli} - {c.fantasia}</p>
                          <p className="text-xs text-slate-500 truncate">{c.telefone}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border border-slate-700 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-medium text-white flex items-center gap-2">Configurações da Mensagem</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tipo de Mensagem</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500"
                  value={config.tipoMensagem}
                  onChange={(e) => handleConfigTipoChange(e.target.value)}
                >
                  {TIPOS_MENSAGEM.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 p-3 bg-blue-500/10 text-blue-300 rounded-lg text-sm border border-blue-500/20 md:mt-6">
                <input type="checkbox" checked disabled className="rounded text-blue-500 opacity-70" />
                <span>O PDF sempre será enviado com a mensagem</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Mensagem Padrão</label>
              <textarea 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500 min-h-[80px] text-sm"
                value={config.mensagemPadrao}
                onChange={(e) => setConfig({ ...config, mensagemPadrao: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2.5 text-slate-300 hover:text-white font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={loading || selectedClientes.size === 0 || !selectedVendedor}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Processando...</>
            ) : (
              <><Send className="w-4 h-4" /> Enviar para {selectedClientes.size} cliente(s)</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

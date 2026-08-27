import { useState, useEffect } from 'react';
import { Search, Send, FileText, CheckSquare, Square, RefreshCw, User, Briefcase, Phone, X, Target } from 'lucide-react';
import clsx from 'clsx';

interface Vendedor {
  CODUSUR: number;
  NOME: string;
  TELEFONE1: string;
  TELEFONE2: string;
  CARGO: string;
}

export default function Objetivos() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCodusurs, setSelectedCodusurs] = useState<Set<number>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal para visualização do PDF
  const [pdfData, setPdfData] = useState<{ base64: string; filename: string } | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<number | null>(null); // CODUSUR que está sendo gerado

  const fetchVendedores = async () => {
    setLoading(true);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const url = user ? `/api/vendedores?codusur=${user.matricula}&role=${user.role}` : '/api/vendedores';
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setVendedores(data.vendedores);
      }
    } catch (err) {
      console.error('Erro ao buscar vendedores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendedores();
  }, []);

  const formatPhone = (phone: string) => {
    if (!phone) return 'Sem contato';
    return phone.replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '+$1 ($2) $3-$4');
  };

  const handleToggleSelect = (codusur: number) => {
    const newSet = new Set(selectedCodusurs);
    if (newSet.has(codusur)) {
      newSet.delete(codusur);
    } else {
      newSet.add(codusur);
    }
    setSelectedCodusurs(newSet);
  };

  const handleSelectAll = (filteredList: Vendedor[]) => {
    if (selectedCodusurs.size === filteredList.length && filteredList.length > 0) {
      setSelectedCodusurs(new Set());
    } else {
      setSelectedCodusurs(new Set(filteredList.map(v => v.CODUSUR)));
    }
  };

  const filteredVendedores = vendedores.filter(v => 
    v.NOME?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.CODUSUR.toString().includes(searchTerm)
  );

  const handleGeneratePdf = async (codusur: number) => {
    setIsGeneratingPdf(codusur);
    setSendResult(null);
    try {
      const response = await fetch(`/api/objetivos/gerar/${codusur}`);
      const data = await response.json();
      if (data.success) {
        setPdfData({ base64: data.base64Pdf, filename: data.filename });
      } else {
        setSendResult({ message: data.error || 'Erro ao gerar PDF', type: 'error' });
      }
    } catch (err) {
      setSendResult({ message: 'Erro de conexão ao gerar PDF.', type: 'error' });
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handleSendWhatsapp = async () => {
    if (selectedCodusurs.size === 0) return;
    setIsSending(true);
    setSendResult(null);
    
    try {
      const response = await fetch('/api/objetivos/enviar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          codvendedores: Array.from(selectedCodusurs)
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setSendResult({ message: data.message || 'Enviado com sucesso!', type: 'success' });
        setSelectedCodusurs(new Set()); // Limpar seleção após envio
      } else {
        setSendResult({ message: data.error || 'Erro ao enviar.', type: 'error' });
      }
    } catch (err) {
      setSendResult({ message: 'Erro de conexão ao enviar.', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Target className="text-primary-500" />
            Painel de Objetivos
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Gere e envie relatórios de metas para a equipe comercial.</p>
        </div>
        
        <button 
          onClick={fetchVendedores}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-medium disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="glass rounded-2xl p-6">
        {/* Ações em Massa & Busca */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar vendedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3 items-center">
            <button
              onClick={() => handleSelectAll(filteredVendedores)}
              className="w-full sm:w-auto px-4 py-3 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              {selectedCodusurs.size === filteredVendedores.length && filteredVendedores.length > 0 ? (
                <><CheckSquare size={18} className="text-primary-500" /> Desmarcar Todos</>
              ) : (
                <><Square size={18} /> Marcar Todos</>
              )}
            </button>
            
            <button
              onClick={handleSendWhatsapp}
              disabled={selectedCodusurs.size === 0 || isSending}
              className="w-full sm:w-auto px-6 py-3 text-sm font-semibold rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              Enviar via WhatsApp ({selectedCodusurs.size})
            </button>
          </div>
        </div>

        {sendResult && (
          <div className={clsx(
            "mb-6 p-4 rounded-xl flex items-center justify-between",
            sendResult.type === 'success' ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20" : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
          )}>
            <span>{sendResult.message}</span>
            <button onClick={() => setSendResult(null)}><X size={18} /></button>
          </div>
        )}

        {/* Lista de Vendedores */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <RefreshCw size={32} className="animate-spin text-primary-500 mb-4" />
            <p>Carregando vendedores...</p>
          </div>
        ) : filteredVendedores.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <User size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-lg font-medium">Nenhum vendedor encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendedores.map(vendedor => (
              <div 
                key={vendedor.CODUSUR} 
                className={clsx(
                  "bg-white dark:bg-slate-800 rounded-xl border p-5 transition-all group flex flex-col justify-between cursor-pointer",
                  selectedCodusurs.has(vendedor.CODUSUR) 
                    ? "border-primary-500 ring-1 ring-primary-500 shadow-md shadow-primary-500/10" 
                    : "border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                )}
                onClick={() => handleToggleSelect(vendedor.CODUSUR)}
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="flex-shrink-0 text-slate-400">
                        {selectedCodusurs.has(vendedor.CODUSUR) ? (
                          <CheckSquare size={20} className="text-primary-500" />
                        ) : (
                          <Square size={20} className="group-hover:text-slate-500" />
                        )}
                      </div>
                      <h3 className="font-bold text-slate-800 dark:text-white truncate" title={vendedor.NOME}>
                        {vendedor.NOME}
                      </h3>
                    </div>
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0">
                      #{vendedor.CODUSUR}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4 pl-8">
                    <div className="flex items-center gap-2">
                      <Briefcase size={14} className="text-slate-400" />
                      <span className="truncate">{vendedor.CARGO || 'VENDEDOR'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={14} className={vendedor.TELEFONE1 || vendedor.TELEFONE2 ? "text-green-500" : "text-rose-400"} />
                      <span className={vendedor.TELEFONE1 || vendedor.TELEFONE2 ? "font-medium text-slate-700 dark:text-slate-300 truncate" : "italic truncate"}>
                        {formatPhone(vendedor.TELEFONE1 || vendedor.TELEFONE2)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700 mt-2 pl-8">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGeneratePdf(vendedor.CODUSUR);
                    }}
                    disabled={isGeneratingPdf === vendedor.CODUSUR}
                    className="w-full py-2 bg-primary-50 dark:bg-primary-500/10 hover:bg-primary-100 dark:hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
                  >
                    {isGeneratingPdf === vendedor.CODUSUR ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <FileText size={16} />
                    )}
                    {isGeneratingPdf === vendedor.CODUSUR ? 'Gerando...' : 'Visualizar PDF'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF Modal */}
      {pdfData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPdfData(null)}></div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl h-full sm:h-[90vh] relative z-10 flex flex-col overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <FileText className="text-primary-500" />
                Visualização do Painel
              </h3>
              <div className="flex items-center gap-3">
                <a 
                  href={`data:application/pdf;base64,${pdfData.base64}`}
                  download={pdfData.filename}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Baixar PDF
                </a>
                <button onClick={() => setPdfData(null)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 w-full bg-slate-200 dark:bg-slate-950">
              <iframe 
                src={`data:application/pdf;base64,${pdfData.base64}`}
                className="w-full h-full border-none"
                title="Visualizador de PDF"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

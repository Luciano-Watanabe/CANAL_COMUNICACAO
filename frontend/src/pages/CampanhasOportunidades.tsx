import React, { useState, useEffect } from 'react';
import { ImagePlus, Search, Send, X, PlusCircle, CheckSquare, Wand2, Loader2 } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

export default function CampanhasOportunidades() {
  const { maskData } = usePrivacy();
  const [file, setFile] = useState<File | null>(null);
  const [legenda, setLegenda] = useState('');
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [vendedorResponsavel, setVendedorResponsavel] = useState('9999'); // Padrão
  
  const [catalogoOpcao, setCatalogoOpcao] = useState('NONE');
  const [atividades, setAtividades] = useState<any[]>([]);
  
  const [filtroDtultcomp, setFiltroDtultcomp] = useState('');
  const [filtroCodatv1, setFiltroCodatv1] = useState('');
  const [mostrarEnviados7Dias, setMostrarEnviados7Dias] = useState(false);
  
  const [clientesFound, setClientesFound] = useState<any[]>([]);
  const [clientesSelected, setClientesSelected] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [numeroAvulso, setNumeroAvulso] = useState('');

  useEffect(() => {
    fetchVendedores();
    fetchAtividades();
  }, []);

  const fetchVendedores = async () => {
    try {
      const res = await fetch('/api/campanhas/vendedores');
      const data = await res.json();
      if (data.success) {
        setVendedores(data.vendedores);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAtividades = async () => {
    try {
      const res = await fetch('/api/atividades');
      const data = await res.json();
      if (data.success) {
        setAtividades(data.atividades);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateAi = async () => {
    setGeneratingAi(true);
    try {
      const res = await fetch('/api/oportunidades/gerar-legenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseText: legenda })
      });
      const data = await res.json();
      if (data.success && data.legenda) {
        setLegenda(data.legenda);
      } else {
        alert('Erro ao gerar legenda com GROK: ' + (data.error || 'Desconhecido'));
      }
    } catch (err) {
      alert('Erro na comunicação com a IA.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSearchClientes = async () => {
    setSearching(true);
    setClientesFound([]);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      
      const params = new URLSearchParams();
      if (filtroCodatv1) params.append('codatv1', filtroCodatv1);
      if (filtroDtultcomp) params.append('dtultcomp', filtroDtultcomp);
      params.append('ignorarRecentes', (!mostrarEnviados7Dias).toString());
      if (user?.matricula) params.append('codusur', user.matricula);
      if (user?.role) params.append('role', user.role);

      const res = await fetch(`/api/oportunidades/clientes?${params.toString()}`);
      
      if (!res.ok) {
         throw new Error(`Erro HTTP: ${res.status}`);
      }
      
      const data = await res.json();
      if (data.success) {
        setClientesFound(data.clientes);
      } else {
        alert('Falha na busca: ' + data.error);
      }
    } catch (e: any) {
      console.error(e);
      alert('Erro ao buscar clientes: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectAll = () => {
    const novos = clientesFound.filter(c => !clientesSelected.some(sel => sel.codcli === c.codcli));
    setClientesSelected([...clientesSelected, ...novos]);
  };

  const handleSelectClient = (client: any) => {
    if (!clientesSelected.some(sel => sel.codcli === client.codcli)) {
      setClientesSelected([...clientesSelected, client]);
    }
  };

  const handleRemoveClient = (codcli: string) => {
    setClientesSelected(clientesSelected.filter(c => c.codcli !== codcli));
  };

  const handleAddAvulso = () => {
    if (!numeroAvulso) return;
    const cleanNumber = numeroAvulso.replace(/\\D/g, '');
    if (cleanNumber.length < 10) {
        alert('Telefone inválido.');
        return;
    }
    const newClient = {
        codcli: 'AVULSO_' + Date.now(),
        fantasia: 'Contato Avulso',
        razao_social: 'Contato Avulso',
        telefone: cleanNumber,
        ramo_atividade: 'N/A'
    };
    handleSelectClient(newClient);
    setNumeroAvulso('');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      alert('Selecione uma imagem, vídeo ou PDF para a campanha.');
      return;
    }
    if (clientesSelected.length === 0) {
      alert('Selecione ao menos um cliente para enviar.');
      return;
    }
    if (!vendedorResponsavel) {
      alert('Selecione um Vendedor Responsável.');
      return;
    }

    if (!confirm(`Deseja enviar para ${clientesSelected.length} clientes agora?`)) return;

    setSending(true);
    
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const codusurLoggedIn = user?.matricula || vendedorResponsavel;

    const formData = new FormData();
    formData.append('media', file);
    formData.append('legenda', legenda);
    formData.append('vendedorResponsavel', vendedorResponsavel);
    formData.append('catalogoOpcao', catalogoOpcao);
    formData.append('clientes', JSON.stringify(clientesSelected));
    formData.append('codusurLoggedIn', String(codusurLoggedIn));

    try {
      const res = await fetch('/api/oportunidades/enviar', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Erro HTTP: ${res.status} - ${text.substring(0, 50)}`);
      }
      
      const data = await res.json();
      if (data.success) {
        alert('Oportunidades enviadas para a fila com sucesso!');
        setFile(null);
        setLegenda('');
        setClientesSelected([]);
      } else {
        alert('Erro: ' + data.error);
      }
    } catch (err: any) {
      console.error('Catch handleSend:', err);
      alert('Erro ao enviar oportunidades: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ImagePlus className="w-8 h-8 text-blue-500" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
            Campanhas de Oportunidades
          </span>
        </h1>
        <p className="text-slate-500 mt-2">Envie promoções, novidades e catálogos para grupos específicos de clientes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lado Esquerdo: Configuração da Campanha */}
        <div className="lg:col-span-1 glass-card dark:bg-slate-800 p-6 rounded-xl space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">1. Configurar Mensagem</h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mídia (Imagem/Vídeo/PDF)</label>
            <input 
              type="file" 
              accept="image/*,video/*,application/pdf"
              onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
              className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Legenda da Mídia</label>
              <button 
                type="button" 
                onClick={handleGenerateAi}
                disabled={generatingAi}
                className="flex items-center gap-1 text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                {generatingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                {generatingAi ? 'Gerando...' : 'Melhorar com GROK'}
              </button>
            </div>
            <textarea 
              value={legenda}
              onChange={e => setLegenda(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
              rows={3}
              placeholder="Confira essa oportunidade imperdível..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Anexar Catálogo de Produtos?</label>
            <select 
              value={catalogoOpcao}
              onChange={e => setCatalogoOpcao(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
            >
              <option value="NONE">Não enviar Catálogo extra</option>
              <option value="GERAL">Catálogo Geral</option>
              {atividades.map(a => (
                <option key={a.codativ} value={a.codativ}>Catálogo Ramo: {a.ramo}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">O catálogo (PDF ou imagem com ofertas) será enviado logo após a mídia principal.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vendedor Responsável (Cartão de Contato)</label>
            <select 
              value={vendedorResponsavel}
              onChange={e => setVendedorResponsavel(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
            >
              {vendedores.map(v => (
                <option key={v.codusur} value={v.codusur}>{maskData(v.nome)} (Cód {v.codusur})</option>
              ))}
              <option value="9999">Vendedor 9999 (Fallback)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">O contato deste vendedor será enviado no fim da mensagem (VCard).</p>
          </div>
        </div>

        {/* Lado Direito: Filtros e Listas */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card dark:bg-slate-800 p-6 rounded-xl">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">2. Buscar Clientes Alvo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ramo de Atividade</label>
                <select 
                  value={filtroCodatv1}
                  onChange={e => setFiltroCodatv1(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
                >
                  <option value="">Todos os Ramos</option>
                  {atividades.map(a => (
                    <option key={a.codativ} value={a.codativ}>{a.ramo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data da Última Compra a partir de</label>
                <input 
                  type="date" 
                  value={filtroDtultcomp}
                  onChange={e => setFiltroDtultcomp(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                  checked={mostrarEnviados7Dias}
                  onChange={e => setMostrarEnviados7Dias(e.target.checked)}
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Incluir clientes já contactados nos últimos 7 dias
                </span>
              </label>

              <button 
                onClick={handleSearchClientes}
                disabled={searching}
                className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {searching ? 'Buscando...' : (
                  <><Search className="w-4 h-4" /> Buscar</>
                )}
              </button>
            </div>
            
            {clientesFound.length > 0 && (
              <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Encontrados: {clientesFound.length}</span>
                  <button onClick={handleSelectAll} className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1">
                    <CheckSquare className="w-4 h-4" /> Adicionar Todos
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {clientesFound.map(c => (
                    <div key={c.codcli} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg text-sm">
                      <div className="flex-1 truncate pr-2">
                        <span className="font-medium text-slate-900 dark:text-white">{maskData(c.fantasia || c.razao_social)}</span>
                        <span className="text-slate-500 ml-2 text-xs">{maskData(c.telefone)} • Ramo: {c.ramo_atividade || 'N/A'}</span>
                      </div>
                      <button 
                        onClick={() => handleSelectClient(c)}
                        disabled={clientesSelected.some(sel => sel.codcli === c.codcli)}
                        className="text-slate-400 hover:text-blue-500 disabled:opacity-30 p-1"
                        title="Adicionar à lista"
                      >
                        <PlusCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass-card dark:bg-slate-800 p-6 rounded-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">3. Lista de Envio ({clientesSelected.length})</h2>
              {clientesSelected.length > 0 && (
                <button 
                  onClick={() => setClientesSelected([])}
                  className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                >
                  Limpar Lista
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input 
                type="text" 
                placeholder="Adicionar telefone avulso (Ex: 11999999999)"
                value={numeroAvulso}
                onChange={e => setNumeroAvulso(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 text-sm outline-none text-slate-900 dark:text-white"
              />
              <button 
                onClick={handleAddAvulso}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 transition-colors"
              >
                <PlusCircle className="w-4 h-4" /> Adicionar
              </button>
            </div>
            
            <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/30">
              {clientesSelected.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center justify-center h-full">
                  Nenhum cliente selecionado. Busque e adicione os clientes na lista acima.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                  {clientesSelected.map(c => (
                    <div key={c.codcli} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm shadow-sm">
                      <div className="flex-1 truncate pr-2">
                        <span className="font-medium text-slate-900 dark:text-white">{maskData(c.fantasia || c.razao_social)}</span>
                        <span className="text-slate-500 ml-2 text-xs">{maskData(c.telefone)}</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveClient(c.codcli)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Remover"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button 
                onClick={handleSend}
                disabled={sending || clientesSelected.length === 0 || !file}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {sending ? 'Processando envio...' : (
                  <>
                    <Send className="w-5 h-5" />
                    Disparar para {clientesSelected.length} Cliente(s)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

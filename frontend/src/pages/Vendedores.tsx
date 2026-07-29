import { useState, useEffect } from 'react';
import { Search, Edit2, Save, X, Phone, User, Briefcase, RefreshCw, AlertCircle, Info } from 'lucide-react';

interface Vendedor {
  CODUSUR: number;
  NOME: string;
  TELEFONE1: string;
  TELEFONE2: string;
  BLOQUEIO: string;
  CARGO: string;
}

export default function Vendedores() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCacheLoading, setIsCacheLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [editingVendedor, setEditingVendedor] = useState<Vendedor | null>(null);
  const [newTelefone, setNewTelefone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
        setIsCacheLoading(data.isCacheLoading || false);
      }
    } catch (err) {
      console.error('Erro ao buscar vendedores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendedores();
  }, [refreshTrigger]);

  useEffect(() => {
    let timeoutId: any;
    if (isCacheLoading) {
        timeoutId = setTimeout(() => {
            setRefreshTrigger(prev => prev + 1);
        }, 2500);
    }
    return () => clearTimeout(timeoutId);
  }, [isCacheLoading]);

  const handleEditClick = (vendedor: Vendedor) => {
    setEditingVendedor(vendedor);
    setNewTelefone(vendedor.TELEFONE1 || vendedor.TELEFONE2 || '');
    setSaveError('');
  };

  const formatPhone = (phone: string) => {
    if (!phone) return 'Sem contato';
    return phone.replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '+$1 ($2) $3-$4');
  };

  const handleSave = async () => {
    if (!editingVendedor) return;
    
    // Limpa a string deixando apenas números
    const cleanPhone = newTelefone.replace(/\D/g, '');
    
    if (cleanPhone && cleanPhone.length < 10) {
      setSaveError('Número de telefone inválido.');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    try {
      const response = await fetch(`/api/vendedores/${editingVendedor.CODUSUR}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ telefone: cleanPhone }),
      });

      const data = await response.json();

      if (data.success) {
        // Atualiza a lista local sem precisar recarregar tudo
        setVendedores(vendedores.map(v => 
          v.CODUSUR === editingVendedor.CODUSUR 
            ? { ...v, TELEFONE1: cleanPhone, TELEFONE2: '' }
            : v
        ));
        setEditingVendedor(null);
      } else {
        setSaveError(data.message || 'Erro ao salvar contato.');
      }
    } catch (err) {
      setSaveError('Erro de conexão ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredVendedores = vendedores.filter(v => 
    v.NOME?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.CODUSUR.toString().includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Gestão de Vendedores</h1>
          <p className="text-slate-500 dark:text-slate-400">Gerencie os contatos de WhatsApp da equipe comercial.</p>
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
        {/* Busca */}
        <div className="mb-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou matrícula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all dark:text-white"
          />
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <RefreshCw size={32} className="animate-spin text-primary-500 mb-4" />
            <p>Carregando vendedores...</p>
          </div>
        ) : filteredVendedores.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <User size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-lg font-medium">Nenhum vendedor encontrado.</p>
            <p className="text-sm">Verifique o termo de busca utilizado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredVendedores.map(vendedor => (
              <div key={vendedor.CODUSUR} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow group flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-slate-800 dark:text-white truncate pr-2" title={vendedor.NOME}>
                      {vendedor.NOME}
                    </h3>
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0">
                      #{vendedor.CODUSUR}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                    <div className="flex items-center gap-2">
                      <Briefcase size={16} className="text-slate-400" />
                      <span>{vendedor.CARGO || 'VENDEDOR'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={16} className={vendedor.TELEFONE1 || vendedor.TELEFONE2 ? "text-green-500" : "text-rose-400"} />
                      <span className={vendedor.TELEFONE1 || vendedor.TELEFONE2 ? "font-medium text-slate-700 dark:text-slate-300" : "italic"}>
                        {formatPhone(vendedor.TELEFONE1 || vendedor.TELEFONE2)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => handleEditClick(vendedor)}
                  className="w-full py-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-primary-50 dark:hover:bg-primary-500/10 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-semibold border border-transparent hover:border-primary-200 dark:hover:border-primary-500/30"
                >
                  <Edit2 size={16} />
                  Atualizar Contato
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Edição */}
      {editingVendedor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isSaving && setEditingVendedor(null)}></div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Atualizar Contato</h3>
              <button onClick={() => setEditingVendedor(null)} disabled={isSaving} className="text-slate-400 hover:text-rose-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6 flex items-center gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center font-bold text-lg">
                  {editingVendedor.NOME.substring(0,2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">{editingVendedor.NOME}</p>
                  <p className="text-xs text-slate-500">Matrícula: {editingVendedor.CODUSUR}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Número de WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="Ex: 5511999999999"
                      value={newTelefone}
                      onChange={(e) => setNewTelefone(e.target.value)}
                      disabled={isSaving}
                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <Info size={12} />
                    Dica: Inclua o código do país (55) e o DDD. Apenas números.
                  </p>
                </div>

                {saveError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm">
                    <AlertCircle size={16} />
                    {saveError}
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setEditingVendedor(null)}
                  disabled={isSaving}
                  className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-colors font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <Save size={18} />
                  )}
                  {isSaving ? 'Salvando...' : 'Salvar Contato'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

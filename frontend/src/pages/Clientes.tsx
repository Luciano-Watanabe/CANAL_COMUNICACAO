import { useState, useEffect, useRef } from 'react';
import { Search, Filter, UserCheck, Phone, X, Plus, Trash2, Users, Download, Upload } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

export default function Clientes() {
  const { maskData } = usePrivacy();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isGestor = ['BOT_GESTOR', 'GERENTE', 'SUPERVISOR'].includes(user?.role?.toUpperCase());
  
  // Modal states
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [contatos, setContatos] = useState<any[]>([]);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('55');
  const [searchTerm, setSearchTerm] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 600);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  
  const handleExportMissing = () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    window.location.href = `/api/contatos/export-missing/${user.matricula}`;
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/contatos/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      alert(data.message);
      // Opcional: Recarregar dados se precisar
    } catch (err) {
      console.error(err);
      alert('Erro ao importar arquivo');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredClientes = clientes.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      (c.cliente || '').toLowerCase().includes(term) ||
      (c.cnpj || '').includes(term) ||
      (c.fantasia || '').toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    if (!isGestor) return;
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
  }, [isGestor]);

  useEffect(() => {
    const fetchClientes = async () => {
      setLoading(true);
      try {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        const user = JSON.parse(userStr);

        // Regra para não pre-carregar para Gestor
        if (isGestor && !selectedVendedor && !debouncedSearchTerm) {
            setClientes([]);
            setLoading(false);
            return;
        }

        let url = `/api/clientes?codusur=${user.matricula}&role=${user.role}`;
        if (selectedVendedor) {
            url += `&vendedor=${selectedVendedor}`;
        }
        if (debouncedSearchTerm) {
            url += `&busca=${encodeURIComponent(debouncedSearchTerm)}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          setClientes(data.clientes);
        }
      } catch (error) {
        console.error('Erro ao buscar clientes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchClientes();
  }, [selectedVendedor, debouncedSearchTerm, isGestor]);

  const openContatosModal = async (client: any) => {
    setSelectedClient(client);
    setLoadingContatos(true);
    try {
      const response = await fetch(`/api/contatos/${client.codcli}`);
      const data = await response.json();
      if (data.success) setContatos(data.contatos);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingContatos(false);
    }
  };

  const addContato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTelefone) return;

    try {
      const res = await fetch('/api/contatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codcli: selectedClient.codcli, nome: novoNome, telefone: novoTelefone })
      });
      const data = await res.json();
      if (data.success) {
        setContatos([...contatos, { nome: novoNome, telefone: novoTelefone }]);
        setNovoNome('');
        setNovoTelefone('55');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeContato = async (telefone: string) => {
    if (!confirm('Deseja realmente remover este contato?')) return;
    try {
      const res = await fetch('/api/contatos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codcli: selectedClient.codcli, telefone })
      });
      const data = await res.json();
      if (data.success) {
        setContatos(contatos.filter(c => c.telefone !== telefone));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Carteira de Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie seus clientes e visualize o mix de compras.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleExportMissing}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Download size={16} /> Exportar Pendentes
          </button>
          
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleImportFile} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Upload size={16} /> {importing ? 'Importando...' : 'Importar CSV'}
          </button>
          
          {isGestor && (
            <select
              value={selectedVendedor}
              onChange={(e) => setSelectedVendedor(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-slate-900 dark:text-white outline-none"
            >
              <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>Todos os Vendedores</option>
              {vendedores.map(v => (
                <option key={v.codusur || v.CODUSUR} value={v.codusur || v.CODUSUR} style={{ color: '#000', backgroundColor: '#fff' }}>{v.nome || v.NOME}</option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Nome Cliente ou CNPJ/CPF..." 
              className="w-full sm:w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-10 pr-4 focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-slate-900 dark:text-white"
            />
          </div>
          <button className="p-2.5 glass-card text-slate-600 dark:text-slate-300 hover:text-primary-500">
            <Filter size={18} />
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Código</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Cliente</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">CNPJ / Fantasia</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Contato Principal</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Limite (R$)</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">Carregando carteira de clientes...</td>
                </tr>
              ) : (isGestor && !selectedVendedor && !debouncedSearchTerm) ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Selecione um vendedor ou faça uma busca para exibir os clientes.
                  </td>
                </tr>
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">Nenhum cliente encontrado na sua carteira.</td>
                </tr>
              ) : (
                filteredClientes.map((client, i) => (
                  <tr key={client.codcli} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <td className="py-4 px-6 font-medium text-slate-700 dark:text-slate-300">{client.codcli}</td>
                    <td className="py-4 px-6 font-semibold text-slate-900 dark:text-white truncate max-w-[200px]" title={client.cliente}>{maskData(client.cliente)}</td>
                    <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-sm">
                      <div>{maskData(client.cnpj)}</div>
                      <div className="text-xs opacity-70 truncate max-w-[150px]">{maskData(client.fantasia)}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Phone size={14} className="text-primary-500" />
                        {client.telefone ? maskData(client.telefone) : 'Não informado'}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        client.bloqueio === 'S' || client.bloqueio === 'X'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' 
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                      }`}>
                        {client.bloqueio === 'S' || client.bloqueio === 'X' ? (
                          <>Bloqueado</>
                        ) : (
                          <><UserCheck size={12} /> Ativo</>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-700 dark:text-slate-300">
                      {client.limite_credito != null 
                        ? Number(client.limite_credito).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'N/A'
                      }
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button 
                        onClick={() => openContatosModal(client)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm transition-colors font-medium flex items-center gap-2 ml-auto"
                      >
                        <Users size={16} /> Contatos
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Contatos */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Contatos Adicionais</h2>
                <p className="text-sm text-slate-500">{maskData(selectedClient.cliente)}</p>
              </div>
              <button 
                onClick={() => setSelectedClient(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Contatos Cadastrados</h3>
                {loadingContatos ? (
                  <p className="text-slate-500 text-sm">Carregando...</p>
                ) : contatos.length === 0 ? (
                  <p className="text-slate-500 text-sm">Nenhum contato adicional salvo.</p>
                ) : (
                  <ul className="space-y-3">
                    {contatos.map((c, idx) => (
                      <li key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">{c.nome ? maskData(c.nome) : 'Sem nome'}</p>
                          <p className="text-xs text-slate-500 font-mono">{maskData(c.telefone)}</p>
                        </div>
                        <button 
                          onClick={() => removeContato(c.telefone)}
                          className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <form onSubmit={addContato} className="border-t border-slate-100 dark:border-slate-800 pt-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Adicionar Novo</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Nome (Ex: João Compras)</label>
                    <input 
                      type="text" 
                      value={novoNome}
                      onChange={e => setNovoNome(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white border border-transparent dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                      placeholder="Nome do contato"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">WhatsApp</label>
                    <input 
                      type="text" 
                      required
                      value={novoTelefone}
                      onChange={e => setNovoTelefone(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white border border-transparent dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500"
                      placeholder="5511999999999"
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 text-white py-2.5 rounded-xl font-medium transition-colors"
                >
                  <Plus size={18} /> Salvar Contato
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

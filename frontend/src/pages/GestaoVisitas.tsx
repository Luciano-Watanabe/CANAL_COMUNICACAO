import { useState, useEffect } from 'react';
import { Calendar, MapPin, CheckCircle, Clock, Trash2, Plus, MessageSquare } from 'lucide-react';
import clsx from 'clsx';

type Cliente = {
  CODCLI?: number;
  CLIENTE?: string;
  codcli?: number;
  cliente?: string;
};

type Visita = {
  ID: number;
  CODCLI: number;
  CLIENTE: string;
  CODUSUR: number;
  NOME_VENDEDOR: string;
  DATA_AGENDADA: string;
  STATUS: string;
  TIPO_MENSAGEM: string;
  CRIADO_EM: string;
  RETORNO?: string;
};

export default function GestaoVisitas() {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    codcli: '',
    data_agendada: '',
    tipo_mensagem: 'NENHUMA'
  });

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isGestor = ['BOT_GESTOR', 'GERENTE', 'SUPERVISOR'].includes(user?.role?.toUpperCase());

  useEffect(() => {
    if (!isGestor) return;
    const fetchVendedores = async () => {
      try {
        const response = await fetch(`/api/vendedores?codusur=${user?.matricula}&role=${user?.role}`);
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
    fetchVisitas();
    fetchClientes();
  }, [selectedVendedor]);

  const fetchVisitas = async () => {
    setLoading(true);
    try {
      let url = `/api/visitas?codusur=${user?.matricula}&role=${user?.role}`;
      if (selectedVendedor) {
        url += `&vendedor=${selectedVendedor}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setVisitas(data.visitas);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientes = async () => {
    try {
      const res = await fetch(`/api/clientes?codusur=${user?.matricula}&role=${user?.role}`);
      const data = await res.json();
      if (data.success) {
        setClientes(data.clientes);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        codcli: parseInt(form.codcli),
        codusur: user?.matricula,
        data_agendada: new Date(form.data_agendada).toISOString(),
        tipo_mensagem: form.tipo_mensagem
      };

      const res = await fetch('/api/visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        setShowModal(false);
        setForm({ codcli: '', data_agendada: '', tipo_mensagem: 'NENHUMA' });
        fetchVisitas();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao agendar visita');
    }
  };

  const handleStatusUpdate = async (id: number, novoStatus: string) => {
    try {
      const res = await fetch(`/api/visitas/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchVisitas();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir esta visita?')) return;
    try {
      const res = await fetch(`/api/visitas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchVisitas();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 rounded-2xl flex items-center justify-center text-sky-600 dark:text-sky-400">
            <MapPin size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Agendamentos de vendedores</h1>
            <p className="text-slate-500 dark:text-slate-400">Agende visitas aos seus clientes e configure automações.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isGestor && (
            <select
              value={selectedVendedor}
              onChange={(e) => setSelectedVendedor(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500 min-w-[200px]"
            >
              <option value="">Todos os Vendedores</option>
              {vendedores.map(v => (
                <option key={v.CODUSUR} value={v.CODUSUR}>{v.NOME}</option>
              ))}
            </select>
          )}
          <button 
            onClick={() => setShowModal(true)}
            className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-lg shadow-primary-500/30"
          >
            <Plus size={18} /> Agendar Visita
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">Cliente</th>
                {isGestor && <th className="px-6 py-4 font-medium">Vendedor</th>}
                <th className="px-6 py-4 font-medium">Data Agendada</th>
                <th className="px-6 py-4 font-medium">Automação</th>
                <th className="px-6 py-4 font-medium">Retorno</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">Carregando...</td>
                </tr>
              ) : visitas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">Nenhuma visita agendada.</td>
                </tr>
              ) : (
                visitas.map((v) => (
                  <tr key={v.ID} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{v.CLIENTE}</div>
                      <div className="text-xs text-slate-500">Cód: {v.CODCLI}</div>
                    </td>
                    {isGestor && (
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{v.NOME_VENDEDOR}</div>
                        <div className="text-xs text-slate-500">Mat: {v.CODUSUR}</div>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <Calendar size={16} className="text-primary-500" />
                        {new Date(v.DATA_AGENDADA).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full w-fit">
                        <MessageSquare size={12} />
                        {v.TIPO_MENSAGEM}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate" title={v.RETORNO || ''}>
                        {v.RETORNO ? v.RETORNO : <span className="text-slate-400 italic">Sem retorno</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit",
                        v.STATUS === 'REALIZADA' ? "bg-emerald-100 text-emerald-700" :
                        v.STATUS === 'CANCELADA' ? "bg-rose-100 text-rose-700" :
                        "bg-amber-100 text-amber-700"
                      )}>
                        {v.STATUS === 'REALIZADA' && <CheckCircle size={14} />}
                        {v.STATUS === 'PENDENTE' && <Clock size={14} />}
                        {v.STATUS}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {v.STATUS === 'PENDENTE' && (
                          <button 
                            onClick={() => handleStatusUpdate(v.ID, 'REALIZADA')}
                            className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 rounded-lg transition-colors"
                            title="Marcar como Realizada"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(v.ID)}
                          className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Agendar Nova Visita</h2>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cliente (Pesquise por nome ou código)</label>
                <input 
                  list="clientes_list"
                  required
                  placeholder="Digite para pesquisar..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                  value={form.codcli}
                  onChange={(e) => setForm({...form, codcli: e.target.value})}
                />
                <datalist id="clientes_list">
                  {clientes.map(c => (
                    <option key={c.CODCLI || c.codcli} value={c.CODCLI || c.codcli}>
                      {c.CODCLI || c.codcli} - {c.CLIENTE || c.cliente}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data e Hora da Visita</label>
                <input 
                  type="datetime-local"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                  value={form.data_agendada}
                  onChange={(e) => setForm({...form, data_agendada: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Automação de Mensagem</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                  value={form.tipo_mensagem}
                  onChange={(e) => setForm({...form, tipo_mensagem: e.target.value})}
                >
                  <option value="NENHUMA">Não enviar mensagem automática</option>
                  <option value="CHEGADA">Aviso de Chegada (Véspera)</option>
                  <option value="AGRADECIMENTO">Agradecimento (Pós-visita)</option>
                  <option value="AMBAS">Ambas (Chegada e Agradecimento)</option>
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  O bot enviará mensagens automáticas baseadas no agendamento e conclusão desta visita.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 text-white bg-primary-600 hover:bg-primary-700 rounded-xl font-medium transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { ImagePlus, Calendar, CheckCircle2, XCircle, Clock, ChevronDown } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

export default function Campanhas() {
  const { maskData } = usePrivacy();
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [legenda, setLegenda] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [vendedores, setVendedores] = useState<string[]>(['TODOS']);
  const [vendedoresList, setVendedoresList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchAgendamentos();
    fetchVendedores();
  }, []);

  const fetchVendedores = async () => {
    try {
      const res = await fetch('/api/campanhas/vendedores');
      const data = await res.json();
      if (data.success) {
        setVendedoresList(data.vendedores);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAgendamentos = async () => {
    try {
      const res = await fetch('/api/campanhas');
      const data = await res.json();
      if (data.success) {
        setAgendamentos(data.agendamentos);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !dataHora) {
      alert('Selecione uma imagem e uma data/hora.');
      return;
    }

    setLoading(true);
    
    // Converte a data do input datetime-local para o formato do banco (YYYY-MM-DD HH24:MI:SS)
    const formattedDate = dataHora.replace('T', ' ') + ':00';

    const formData = new FormData();
    formData.append('imagem', file);
    formData.append('legenda', legenda);
    formData.append('data_programada', formattedDate);
    formData.append('vendedores', vendedores.includes('TODOS') ? 'TODOS' : JSON.stringify(vendedores));
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : {};
    formData.append('criado_por', user.nome || 'Gerente');

    try {
      const res = await fetch('/api/campanhas/agendar', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert('Agendado com sucesso!');
        setFile(null);
        setLegenda('');
        setDataHora('');
        fetchAgendamentos();
      } else {
        alert('Erro: ' + data.error);
      }
    } catch (err) {
      alert('Erro ao enviar.');
    } finally {
      setLoading(false);
    }
  };

  const handleExcluir = async (id: number) => {
    if (!confirm('Deseja excluir este agendamento?')) return;
    try {
      const res = await fetch(`/api/campanhas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchAgendamentos();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getVendedoresNames = (vendedoresStr: string) => {
    if (vendedoresStr === 'TODOS') return 'Todos';
    try {
      const ids = JSON.parse(vendedoresStr);
      const names = ids.map((id: string) => {
        const v = vendedoresList.find(v => String(v.codusur) === String(id));
        return v ? maskData(v.nome) : `Vendedor ${id}`;
      });
      return names.join(', ');
    } catch (e) {
      return 'Vendedor Específico';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ImagePlus className="w-8 h-8 text-blue-500" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
            Campanhas e Status
          </span>
        </h1>
        <p className="text-slate-500 mt-2">Agende imagens de publicidade para serem enviadas ao Status do WhatsApp dos vendedores.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 glass-card dark:bg-slate-800 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Novo Agendamento</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Imagem do Status</label>
              <input 
                type="file" 
                accept="image/*"
                onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Legenda (Opcional)</label>
              <textarea 
                value={legenda}
                onChange={e => setLegenda(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
                rows={3}
                placeholder="Aproveite a oferta..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data e Hora do Disparo</label>
              <input 
                type="datetime-local" 
                value={dataHora}
                onChange={e => setDataHora(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div ref={dropdownRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Destinatários</label>
              
              <div 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 cursor-pointer flex justify-between items-center text-slate-900 dark:text-white transition-all hover:bg-slate-100 dark:hover:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="truncate pr-4">
                  {vendedores.includes('TODOS') 
                    ? 'Todos os Vendedores' 
                    : `${vendedores.length} Vendedor(es) selecionado(s)`
                  }
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {dropdownOpen && (
                <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                        checked={vendedores.includes('TODOS')}
                        onChange={() => {
                          setVendedores(['TODOS']);
                          setDropdownOpen(false);
                        }}
                      />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-200">Todos os Vendedores</span>
                    </label>

                    {vendedoresList.map(v => (
                      <label key={v.codusur} className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                          checked={vendedores.includes(String(v.codusur))}
                          onChange={(e) => {
                            const val = String(v.codusur);
                            let newVendedores = [...vendedores];
                            
                            if (newVendedores.includes('TODOS')) {
                              newVendedores = [];
                            }

                            if (e.target.checked) {
                              newVendedores.push(val);
                            } else {
                              newVendedores = newVendedores.filter(item => item !== val);
                            }

                            if (newVendedores.length === 0) {
                              newVendedores = ['TODOS'];
                            }

                            setVendedores(newVendedores);
                          }}
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{maskData(v.nome)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? 'Agendando...' : (
                <>
                  <Calendar className="w-5 h-5" />
                  Agendar Status
                </>
              )}
            </button>
          </form>
        </div>

        <div className="md:col-span-2 glass-card dark:bg-slate-800 p-6 rounded-xl overflow-hidden flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Cronograma de Status</h2>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3">Imagem</th>
                  <th className="px-4 py-3">Agendamento</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map(ag => (
                  <tr key={ag.id} className="border-b dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <a href={`/uploads/${ag.imagem}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                        Visualizar
                      </a>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{ag.data_programada}</td>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{getVendedoresNames(ag.vendedores)}</td>
                    <td className="px-4 py-3">
                      {ag.status === 'PENDENTE' && <span className="inline-flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full text-xs font-medium"><Clock className="w-3 h-3"/> Pendente</span>}
                      {ag.status === 'CONCLUIDO' && <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full text-xs font-medium"><CheckCircle2 className="w-3 h-3"/> Concluído</span>}
                      {ag.status.startsWith('ERRO') && <span className="inline-flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-full text-xs font-medium" title={ag.status}><XCircle className="w-3 h-3"/> Falha</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                        <button onClick={() => handleExcluir(ag.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                          Excluir
                        </button>
                    </td>
                  </tr>
                ))}
                {agendamentos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum status agendado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Calendar, Image, Video, Music, FileText, CheckCircle2, XCircle, Clock, Send, Trash2, ChevronDown, User, Smartphone } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

const TIPOS_MIDIA = [
  { value: 'texto', label: 'Texto', icon: FileText },
  { value: 'imagem', label: 'Imagem', icon: Image },
  { value: 'video', label: 'Vídeo', icon: Video },
  { value: 'audio', label: 'Áudio', icon: Music },
] as const;

const FILE_ACCEPTS: Record<string, string> = {
  texto: '',
  imagem: 'image/jpeg,image/png,image/webp',
  video: 'video/mp4,video/webm,video/mov',
  audio: 'audio/mpeg,audio/ogg,audio/wav,audio/m4a',
};

export default function StatusWhats() {
  const { maskData } = usePrivacy();
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [tipoArquivo, setTipoArquivo] = useState('texto');
  const [legenda, setLegenda] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [vendedores, setVendedores] = useState<string[]>(['TODOS']);
  const [vendedoresList, setVendedoresList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState<any>(null);

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
      const res = await fetch('/api/status-whats/vendedores');
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
      const res = await fetch('/api/status-whats');
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
    if (!dataHora) {
      alert('Selecione uma data/hora.');
      return;
    }
    if (tipoArquivo !== 'texto' && !file) {
      alert('Selecione um arquivo.');
      return;
    }
    if (tipoArquivo === 'texto' && !legenda) {
      alert('Digite o texto da mensagem.');
      return;
    }

    setLoading(true);

    const formattedDate = dataHora.replace('T', ' ') + ':00';

    const formData = new FormData();
    formData.append('tipo_midia', tipoArquivo);
    if (file) formData.append('midia', file);
    formData.append('legenda', legenda);
    formData.append('data_programada', formattedDate);
    formData.append('vendedores', vendedores.includes('TODOS') ? 'TODOS' : JSON.stringify(vendedores));
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : {};
    formData.append('criado_por', user.nome || 'Usuário');

    try {
      const res = await fetch('/api/status-whats/agendar', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert('Status agendado com sucesso!');
        setFile(null);
        setLegenda('');
        setDataHora('');
        setTipoArquivo('texto');
        setVendedores(['TODOS']);
        fetchAgendamentos();
      } else {
        alert('Erro: ' + data.message);
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
      const res = await fetch(`/api/status-whats/${id}`, { method: 'DELETE' });
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
      return 'Vendedor(es) específico(s)';
    }
  };

  const formatDateTime = (dt: string) => {
    if (!dt) return '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date(dt);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'texto': return <FileText size={16} className="text-blue-500" />;
      case 'imagem': return <Image size={16} className="text-emerald-500" />;
      case 'video': return <Video size={16} className="text-purple-500" />;
      case 'audio': return <Music size={16} className="text-amber-500" />;
      default: return <FileText size={16} className="text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'PENDENTE') {
      return <span className="inline-flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full text-xs font-medium"><Clock className="w-3 h-3" /> Pendente</span>;
    }
    if (status === 'PROCESSANDO') {
      return <span className="inline-flex items-center gap-1 text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full text-xs font-medium"><Clock className="w-3 h-3" /> Enviando...</span>;
    }
    if (status === 'ENVIADO') {
      return <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full text-xs font-medium"><CheckCircle2 className="w-3 h-3" /> Enviado</span>;
    }
    if (status.startsWith('ERRO')) {
      return <span className="inline-flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-full text-xs font-medium" title={status}><XCircle className="w-3 h-3" /> Falha</span>;
    }
    return <span className="text-xs text-slate-400">{status}</span>;
  };

  const getVendedoresComWhats = () => {
    return vendedoresList.filter(v => v.tem_token);
  };

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Smartphone className="w-8 h-8 text-green-500" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              Status Whats
            </span>
          </h1>
          <p className="text-slate-500 mt-2">Agende envios de texto, imagem, vídeo e áudio como Status do WhatsApp para vendedores conectados.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 glass-card dark:bg-slate-800 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Novo Envio</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Mídia</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_MIDIA.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setTipoArquivo(t.value); setFile(null); }}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                        tipoArquivo === t.value
                          ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Icon size={16} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {tipoArquivo !== 'texto' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Arquivo ({FILE_ACCEPTS[tipoArquivo]})
                </label>
                <input
                  type="file"
                  accept={FILE_ACCEPTS[tipoArquivo]}
                  onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {file && <p className="text-xs text-slate-500 mt-1">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Legenda / Texto</label>
              <textarea
                value={legenda}
                onChange={e => setLegenda(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-500 transition-all text-slate-900 dark:text-white outline-none"
                rows={3}
                placeholder="Digite o texto da mensagem..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data e Hora do Envio</label>
              <input
                type="datetime-local"
                value={dataHora}
                onChange={e => setDataHora(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-500 transition-all text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div ref={dropdownRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Destinatários</label>
              <div
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 cursor-pointer flex justify-between items-center text-slate-900 dark:text-white transition-all hover:bg-slate-100 dark:hover:bg-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="truncate pr-4">
                  {vendedores.includes('TODOS')
                    ? 'Todos os Vendedores'
                    : `${vendedores.length} Vendedor(es) selecionado(s)`}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {dropdownOpen && (
                <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2 space-y-1">
                    <label className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700"
                        checked={vendedores.includes('TODOS')}
                        onChange={() => {
                          setVendedores(['TODOS']);
                          setDropdownOpen(false);
                        }}
                      />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-200">Todos os Vendedores</span>
                    </label>

                    {getVendedoresComWhats().map(v => (
                      <label key={v.codusur} className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700"
                          checked={vendedores.includes(String(v.codusur))}
                          onChange={(e) => {
                            const val = String(v.codusur);
                            let novos = [...vendedores];
                            if (novos.includes('TODOS')) novos = [];
                            if (e.target.checked) {
                              novos.push(val);
                            } else {
                              novos = novos.filter(item => item !== val);
                            }
                            if (novos.length === 0) {
                              novos = ['TODOS'];
                            }
                            setVendedores(novos);
                          }}
                        />
                        <User size={14} className="text-slate-400" />
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{maskData(v.nome)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? 'Agendando...' : (
                <>
                  <Calendar className="w-5 h-5" />
                  Agendar Envio
                </>
              )}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 glass-card dark:bg-slate-800 p-6 rounded-xl overflow-hidden flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Histórico de Envios</h2>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Conteúdo</th>
                  <th className="px-4 py-3">Programado</th>
                  <th className="px-4 py-3">Enviado</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map(ag => (
                  <tr key={ag.id} className="border-b dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getTipoIcon(ag.tipo_midia)}
                        <span className="text-slate-700 dark:text-slate-300 capitalize">{ag.tipo_midia}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ag.tipo_midia === 'texto' ? (
                        <p className="text-slate-700 dark:text-slate-300 truncate max-w-xs">{ag.legenda || (<em className="text-slate-400">Sem texto</em>)}</p>
                      ) : (
                        <button
                          onClick={() => setPreviewOpen(ag)}
                          className="text-blue-500 hover:underline font-medium"
                        >
                          Visualizar
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-200">{formatDateTime(ag.data_programada)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{ag.data_envio ? formatDateTime(ag.data_envio) : '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{getVendedoresNames(ag.vendedores)}</td>
                    <td className="px-4 py-3">{getStatusBadge(ag.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleExcluir(ag.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {agendamentos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhum status agendado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] flex items-center justify-center">
            {previewOpen.tipo_midia === 'imagem' && previewOpen.arquivo_path ? (
              <img src={`/uploads/${previewOpen.arquivo_path}`} alt="Status" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            ) : previewOpen.tipo_midia === 'video' && previewOpen.arquivo_path ? (
              <video src={`/uploads/${previewOpen.arquivo_path}`} controls className="max-w-full max-h-[85vh] rounded-lg" />
            ) : previewOpen.tipo_midia === 'audio' && previewOpen.arquivo_path ? (
              <audio src={`/uploads/${previewOpen.arquivo_path}`} controls className="w-80" />
            ) : (
              <div className="text-white p-4">{previewOpen.legenda}</div>
            )}
            <button
              onClick={() => setPreviewOpen(null)}
              className="absolute top-2 right-2 text-white hover:text-slate-300"
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

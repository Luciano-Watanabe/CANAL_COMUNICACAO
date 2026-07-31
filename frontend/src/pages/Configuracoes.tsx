import { useState, useEffect } from 'react';
import { Save, User, ShieldAlert } from 'lucide-react';
import { WhatsAppMonitor } from '../components/WhatsAppMonitor';
import { usePrivacy } from '../contexts/PrivacyContext';
import clsx from 'clsx';

export default function Configuracoes() {
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [globalUrl, setGlobalUrl] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);
  const { isPrivacyMode, setPrivacyMode, maskData } = usePrivacy();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isGerente = user?.role?.toUpperCase() === 'GERENTE';
  const isBotGestor = user?.role?.toUpperCase() === 'BOT_GESTOR';
  const hasAccess = isGerente || isBotGestor;

  const [modoTeste, setModoTeste] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState('');

  useEffect(() => {
    if (!hasAccess) return;

    const fetchData = async () => {
      try {
        // Fetch Vendedores
        const resVend = await fetch('/api/config/vendedores');
        const dataVend = await resVend.json();
        if (dataVend.success) setVendedores(dataVend.vendedores);

        // Fetch Globals
        const resGlob = await fetch('/api/config/global');
        const dataGlob = await resGlob.json();
        if (dataGlob.success) {
          if (dataGlob.configs['EVOLUTION_API_URL']) {
            setGlobalUrl(dataGlob.configs['EVOLUTION_API_URL']);
          }
          if (dataGlob.configs['GROQ_API_KEY']) {
            setGroqApiKey(dataGlob.configs['GROQ_API_KEY']);
          }
          if (dataGlob.configs['MODO_TESTE_GESTOR']) {
            setModoTeste(dataGlob.configs['MODO_TESTE_GESTOR'] === 'S');
          }
          if (dataGlob.configs['NUMERO_TESTE_GESTOR']) {
            setNumeroTeste(dataGlob.configs['NUMERO_TESTE_GESTOR']);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar configurações:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isGerente]);

  const saveGlobalConfig = async () => {
    setSavingGlobal(true);
    try {
      const response = await fetch('/api/config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: { 
            EVOLUTION_API_URL: globalUrl, 
            GROQ_API_KEY: groqApiKey,
            MODO_TESTE_GESTOR: modoTeste ? 'S' : 'N',
            NUMERO_TESTE_GESTOR: numeroTeste
          }
        })
      });
      const data = await response.json();
      if (data.success) {
        alert('URL Global salva!');
      } else {
        alert('Erro ao salvar URL Global.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar.');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleChange = (codusur: string, field: string, value: string) => {
    setVendedores(prev => prev.map(v => 
      v.codusur === codusur ? { ...v, [field]: value } : v
    ));
  };

  const handleSave = async (vendedor: any) => {
    setSavingId(vendedor.codusur);
    try {
      const response = await fetch('/api/config/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codusur: vendedor.codusur,
          api_token: vendedor.api_token,
          instance_name: vendedor.instance_name,
          api_url: vendedor.api_url
        })
      });
      const data = await response.json();
      if (data.success) {
        alert('Configurações salvas com sucesso!');
      } else {
        alert('Erro: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar token');
    } finally {
      setSavingId(null);
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center animate-fade-in">
        <ShieldAlert size={64} className="text-rose-500/50 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Acesso Restrito</h2>
        <p className="text-slate-500 max-w-md">Esta página é exclusiva para Gerentes ou Bot Gestor. Você não tem permissão para visualizar as configurações do sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Configurações Evolution API</h1>
        <p className="text-slate-500 text-sm mt-1">Vincule os tokens do Evolution GO para cada Representante Comercial (RCA).</p>
      </div>

      <div className="glass-card p-6 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Modo Apresentação (Gravação de Vídeo)
          </h3>
          <p className="text-sm text-slate-500 mt-1">Oculta informações sensíveis (Nomes, CNPJ, IE, Telefones) em toda a aplicação.</p>
        </div>
        <button
          onClick={() => setPrivacyMode(!isPrivacyMode)}
          className={clsx(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
            isPrivacyMode ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
          )}
        >
          <span
            className={clsx(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              isPrivacyMode ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {isBotGestor && (
        <div className="glass-card p-6 mb-6 flex flex-col md:flex-row gap-4 items-center bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
          <div className="flex-1">
            <h3 className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <ShieldAlert size={20} /> Modo Teste do Sistema (Exclusivo Bot Gestor)
            </h3>
            <p className="text-sm text-amber-700/80 dark:text-amber-500/80 mt-1 mb-3">
              Se marcado, <b>TODAS</b> as mensagens enviadas pela aplicação (clientes ou vendedores) serão direcionadas apenas para o número informado abaixo.
            </p>
            <input 
              type="text" 
              value={numeroTeste}
              onChange={(e) => setNumeroTeste(e.target.value)}
              placeholder="Ex: 5511999999999"
              className="w-full md:w-64 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-amber-300 dark:border-amber-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            onClick={() => setModoTeste(!modoTeste)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2",
              modoTeste ? "bg-amber-600" : "bg-slate-300 dark:bg-slate-600"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                modoTeste ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      )}

      <div className="glass-card p-6 flex flex-col md:flex-row gap-4 items-end bg-primary-50 dark:bg-slate-800/50 border border-primary-100 dark:border-slate-700">
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              URL Base Global da Evolution API
            </label>
            <p className="text-xs text-slate-500 mb-3">Esta URL será usada como padrão pelos vendedores.</p>
            <input 
              type="text" 
              value={globalUrl}
              onChange={(e) => setGlobalUrl(e.target.value)}
              placeholder="https://api.evolution.com..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chave de API do Groq (Transcrição de Áudio)
            </label>
            <p className="text-xs text-slate-500 mb-3">Chave para transcrever áudios (inicia com gsk_...).</p>
            <input 
              type="password" 
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <button 
          onClick={saveGlobalConfig}
          disabled={savingGlobal}
          className="whitespace-nowrap px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Save size={18} />
          {savingGlobal ? 'Salvando...' : 'Salvar Global'}
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Usuário</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Nome da Instância</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">URL Base da API</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Token Evolution (Global / Instance)</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Status WhatsApp</th>
                <th className="py-4 px-6 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">Carregando vendedores...</td></tr>
              ) : vendedores.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">Nenhum vendedor encontrado.</td></tr>
              ) : (
                vendedores.map(v => (
                  <tr key={v.codusur} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                          <User size={14} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{maskData(v.nome)}</p>
                          <p className="text-xs text-slate-500">Cód: {v.codusur}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <input 
                        type="text" 
                        value={v.instance_name || ''} 
                        onChange={(e) => handleChange(v.codusur, 'instance_name', e.target.value)}
                        placeholder="Ex: RCA_Joao"
                        className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-4 px-6">
                      <input 
                        type="text" 
                        value={v.api_url || ''} 
                        onChange={(e) => handleChange(v.codusur, 'api_url', e.target.value)}
                        placeholder="https://api.evolution.com..."
                        className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-4 px-6">
                      <input 
                        type="text" 
                        value={v.api_token || ''} 
                        onChange={(e) => handleChange(v.codusur, 'api_token', e.target.value)}
                        placeholder="Colar Token aqui"
                        className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-4 px-6 min-w-[200px]">
                      {v.instance_name ? <WhatsAppMonitor codusur={v.codusur} /> : <span className="text-xs text-slate-400">Instância não informada</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button 
                        onClick={() => handleSave(v)}
                        disabled={savingId === v.codusur}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Save size={16} />
                        {savingId === v.codusur ? 'Salvando...' : 'Salvar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

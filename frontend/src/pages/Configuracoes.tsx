import { useState, useEffect } from 'react';
import { Save, User, ShieldAlert, Clock, Plus, Settings2, Wand2 } from 'lucide-react';
import { WhatsAppMonitor } from '../components/WhatsAppMonitor';
import { usePrivacy } from '../contexts/PrivacyContext';
import { ControleAcessoSAC } from '../components/ControleAcessoSAC';
import { ControleAcessosMenu } from '../components/ControleAcessosMenu';
import clsx from 'clsx';

export default function Configuracoes() {
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [grokApiKey, setGrokApiKey] = useState('');
  const [locationIqToken, setLocationIqToken] = useState('');
  const [geoapifyToken, setGeoapifyToken] = useState('');
  const [cnpjaToken, setCnpjaToken] = useState('');
  const [cnpjPaginas, setCnpjPaginas] = useState(3);
  const [contatoFinanceiro, setContatoFinanceiro] = useState('');
  const [contatoCompras, setContatoCompras] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [catalogoComPreco, setCatalogoComPreco] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [sacBotCodusur, setSacBotCodusur] = useState('');
  const { isPrivacyMode, setPrivacyMode, maskData } = usePrivacy();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isGerente = user?.role?.toUpperCase() === 'GERENTE';
  const isBotGestor = user?.role?.toUpperCase() === 'BOT_GESTOR';
  const hasAccess = isGerente || isBotGestor;

  const [modoTeste, setModoTeste] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState('');

  // Cron schedule config
  const [cronDiasSemana, setCronDiasSemana] = useState<number[]>([1, 2, 3, 4, 5]);
  const [cronHoraInicio, setCronHoraInicio] = useState(8);
  const [cronHoraFim, setCronHoraFim] = useState(18);

  // Webhook Nativo Config
  const [webhookPorta, setWebhookPorta] = useState(3005);
  const [webhookToken, setWebhookToken] = useState('');
  const [webhookAtivo, setWebhookAtivo] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Departments Config
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [novoDeptoNome, setNovoDeptoNome] = useState('');
  const [novoDeptoPai, setNovoDeptoPai] = useState('');
  const [savingDepto, setSavingDepto] = useState(false);
  const [filtroDeptoTable, setFiltroDeptoTable] = useState<string>('');

  // IA Usage state
  const [iaUsage, setIaUsage] = useState<any>(null);

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
          if (dataGlob.configs['GROQ_API_KEY']) {
            setGroqApiKey(dataGlob.configs['GROQ_API_KEY']);
          }
          if (dataGlob.configs['GROK_API_KEY']) {
            setGrokApiKey(dataGlob.configs['GROK_API_KEY']);
          }
          if (dataGlob.configs['LOCATIONIQ_API_KEY']) {
            setLocationIqToken(dataGlob.configs['LOCATIONIQ_API_KEY']);
          }
          if (dataGlob.configs['GEOAPIFY_API_KEY']) {
            setGeoapifyToken(dataGlob.configs['GEOAPIFY_API_KEY']);
          }
          if (dataGlob.configs['CNPJA_API_KEY']) {
            setCnpjaToken(dataGlob.configs['CNPJA_API_KEY']);
          }
          if (dataGlob.configs['CNPJ_TRANSPARENCIA_PAGINAS']) {
            setCnpjPaginas(parseInt(dataGlob.configs['CNPJ_TRANSPARENCIA_PAGINAS'], 10) || 3);
          }
          if (dataGlob.configs['CONTATO_FINANCEIRO']) {
            setContatoFinanceiro(dataGlob.configs['CONTATO_FINANCEIRO']);
          }
          if (dataGlob.configs['CONTATO_COMPRAS']) {
            setContatoCompras(dataGlob.configs['CONTATO_COMPRAS']);
          }
          if (dataGlob.configs['MODO_TESTE_GESTOR']) {
            setModoTeste(dataGlob.configs['MODO_TESTE_GESTOR'] === 'S');
          }
          if (dataGlob.configs['NUMERO_TESTE_GESTOR']) {
            setNumeroTeste(dataGlob.configs['NUMERO_TESTE_GESTOR']);
          }
          if (dataGlob.configs['NOME_EMPRESA']) {
            setNomeEmpresa(dataGlob.configs['NOME_EMPRESA']);
          }
          if (dataGlob.configs['BOT_CATALOGO_COM_PRECO']) {
            setCatalogoComPreco(dataGlob.configs['BOT_CATALOGO_COM_PRECO'] === 'ON');
          }
          if (dataGlob.configs['CRON_DIAS_SEMANA']) {
            try { setCronDiasSemana(JSON.parse(dataGlob.configs['CRON_DIAS_SEMANA'])); } catch (e) {}
          }
          if (dataGlob.configs['CRON_HORA_INICIO']) {
            setCronHoraInicio(parseInt(dataGlob.configs['CRON_HORA_INICIO'], 10));
          }
          if (dataGlob.configs['CRON_HORA_FIM']) {
            setCronHoraFim(parseInt(dataGlob.configs['CRON_HORA_FIM'], 10));
          }
          if (dataGlob.configs['SAC_BOT_CODUSUR']) {
            setSacBotCodusur(dataGlob.configs['SAC_BOT_CODUSUR']);
          }
        }
        
        // Fetch Departamentos SAC
        const resDeptos = await fetch('/api/sac/departamentos');
        if (resDeptos.ok) {
          const dataDeptos = await resDeptos.json();
          setDepartamentos(dataDeptos);
        }
        // Fetch IA Usage
        const resIa = await fetch('/api/sac/grok-usage');
        if (resIa.ok) {
          const dataIa = await resIa.json();
          setIaUsage(dataIa);
        }
        // Fetch Webhook Config
        const resWh = await fetch('/api/webhook-config');
        if (resWh.ok) {
          const dataWh = await resWh.json();
          if (dataWh.success) {
            setWebhookPorta(dataWh.porta);
            setWebhookToken(dataWh.token);
            setWebhookAtivo(dataWh.ativo === 'S');
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

  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      const response = await fetch('/api/webhook-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          porta: webhookPorta,
          token: webhookToken,
          ativo: webhookAtivo ? 'S' : 'N'
        })
      });
      const data = await response.json();
      if (data.success) {
        alert('Configurações do Webhook Nativo salvas!');
      } else {
        alert('Erro ao salvar Webhook: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar webhook.');
    } finally {
      setSavingWebhook(false);
    }
  };

  const saveGlobalConfig = async () => {
    setSavingGlobal(true);
    try {
      const response = await fetch('/api/config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: { 
            EVOLUTION_API_URL: 'https://evo-go.wms-saas.com.br',
            GROQ_API_KEY: groqApiKey,
            GROK_API_KEY: grokApiKey,
            LOCATIONIQ_API_KEY: locationIqToken,
            GEOAPIFY_API_KEY: geoapifyToken,
            CNPJA_API_KEY: cnpjaToken,
            CNPJ_TRANSPARENCIA_PAGINAS: cnpjPaginas.toString(),
            CONTATO_FINANCEIRO: contatoFinanceiro,
            CONTATO_COMPRAS: contatoCompras,
            MODO_TESTE_GESTOR: modoTeste ? 'S' : 'N',
            NUMERO_TESTE_GESTOR: numeroTeste,
            NOME_EMPRESA: nomeEmpresa,
            BOT_CATALOGO_COM_PRECO: catalogoComPreco ? 'ON' : 'OFF',
            CRON_DIAS_SEMANA: JSON.stringify(cronDiasSemana),
            CRON_HORA_INICIO: cronHoraInicio.toString(),
            CRON_HORA_FIM: cronHoraFim.toString(),
            SAC_BOT_CODUSUR: sacBotCodusur
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

  const handleSelectSacBot = async (codusur: string | number) => {
    const codStr = String(codusur);
    setSacBotCodusur(codStr);
    try {
      const response = await fetch('/api/config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: { SAC_BOT_CODUSUR: codStr }
        })
      });
      if (response.ok) {
        alert('Configuração do BOT do SAC salva com sucesso!');
      } else {
        alert('Erro ao gravar no banco de dados.');
      }
    } catch(err) {
      console.error(err);
      alert('Erro de conexão ao salvar BOT do SAC.');
    }
  };

  const toggleDiaSemana = (dia: number) => {
    setCronDiasSemana(prev => 
      prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia].sort()
    );
  };

  const handleChange = (codusur: string, field: string, value: string) => {
    setVendedores(prev => prev.map(v => 
      v.codusur === codusur ? { ...v, [field]: value } : v
    ));
  };

  const handleSave = async (vendedor: any) => {
    if (vendedor.api_token && vendedor.api_token.trim() !== '') {
      const isDuplicate = vendedores.some(v => v.codusur !== vendedor.codusur && v.api_token === vendedor.api_token);
      if (isDuplicate) {
        alert('O TOKEN do vendedor deve ser único. Já existe outro vendedor usando este mesmo token.');
        return;
      }
    }

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

  const handleSaveDepto = async () => {
    if (!novoDeptoNome.trim()) return;
    setSavingDepto(true);
    try {
      const response = await fetch('/api/sac/departamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novoDeptoNome,
          departamentoPaiId: novoDeptoPai ? Number(novoDeptoPai) : null
        })
      });
      if (response.ok) {
        setNovoDeptoNome('');
        setNovoDeptoPai('');
        const resDeptos = await fetch('/api/sac/departamentos');
        setDepartamentos(await resDeptos.json());
      } else {
        alert('Erro ao criar departamento.');
      }
    } catch(err) {
      console.error(err);
      alert('Erro de conexão ao criar departamento.');
    } finally {
      setSavingDepto(false);
    }
  };

  const toggleDeptoAtivo = async (id: number, ativoAtual: string) => {
    try {
      await fetch(`/api/sac/departamentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: ativoAtual === 'S' ? false : true })
      });
      const resDeptos = await fetch('/api/sac/departamentos');
      setDepartamentos(await resDeptos.json());
    } catch(err) {
      console.error(err);
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

      {isBotGestor && (
        <ControleAcessosMenu />
      )}

      <div className="glass-card p-6 flex flex-col md:flex-row gap-4 items-center bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50">
        <div className="flex-1 w-full">
          <h3 className="font-bold text-blue-800 dark:text-blue-400 flex items-center gap-2 mb-3">
            <Clock size={20} /> Agendamento do Cron de Envios
          </h3>
          <p className="text-sm text-blue-700/80 dark:text-blue-500/80 mb-4">
            Defina em quais dias da semana e horários as mensagens da fila de reativação serão enviadas automaticamente.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Dias de Funcionamento</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0, label: 'Dom' },
                  { value: 1, label: 'Seg' },
                  { value: 2, label: 'Ter' },
                  { value: 3, label: 'Qua' },
                  { value: 4, label: 'Qui' },
                  { value: 5, label: 'Sex' },
                  { value: 6, label: 'Sáb' },
                ].map(dia => (
                  <button
                    key={dia.value}
                    onClick={() => toggleDiaSemana(dia.value)}
                    className={clsx(
                      "px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
                      cronDiasSemana.includes(dia.value)
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    )}
                  >
                    {dia.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Hora Inicial</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={cronHoraInicio}
                    onChange={(e) => setCronHoraInicio(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 pr-8 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-2 text-slate-400">h</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Hora Final</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={cronHoraFim}
                    onChange={(e) => setCronHoraFim(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 pr-8 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-2 text-slate-400">h</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 flex flex-col md:flex-row gap-4 items-center bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700/50 mb-6">
        <div className="flex-1 w-full">
          <h3 className="font-bold text-indigo-800 dark:text-indigo-400 flex items-center gap-2 mb-3">
            <Settings2 size={20} /> Webhook Nativo (Tailscale Funnel)
          </h3>
          <p className="text-sm text-indigo-700/80 dark:text-indigo-500/80 mb-4">
            Ative o recebimento de webhooks diretamente nesta instância, criando um túnel seguro via Tailscale. O túnel irá expor a porta configurada abaixo.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Porta do Webhook</label>
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={webhookPorta}
                  onChange={(e) => setWebhookPorta(Number(e.target.value))}
                  disabled={webhookAtivo}
                  title={webhookAtivo ? "Desative o webhook para alterar a porta" : ""}
                  className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center pt-6">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Ativar Túnel</label>
                <button
                  onClick={() => setWebhookAtivo(!webhookAtivo)}
                  className={clsx(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                    webhookAtivo ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      webhookAtivo ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Token de Autenticação</label>
              <input
                type="text"
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}
                placeholder="Ex: meu-token-super-secreto"
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button 
              onClick={handleSaveWebhook}
              disabled={savingWebhook}
              className="whitespace-nowrap px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={18} />
              {savingWebhook ? 'Salvando...' : 'Salvar Webhook'}
            </button>
          </div>
        </div>
      </div>
      <div className="glass-card p-6 flex flex-col md:flex-row gap-4 items-end bg-primary-50 dark:bg-slate-800/50 border border-primary-100 dark:border-slate-700">
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              URL Base Global da Evolution API
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Esta URL será usada como padrão pelos vendedores. <br />
              Para fins de contratação, <a href="https://www.wms-saas.com.br/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">acesse https://www.wms-saas.com.br/</a> para poder criar o acesso e contratar o serviço.
            </p>
            <input 
              type="text" 
              value="https://evo-go.wms-saas.com.br/"
              disabled
              className="w-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome da Empresa (Identificação SAC/Envios)
            </label>
            <p className="text-xs text-slate-500 mb-3">Nome usado para identificar o remetente em mensagens automáticas.</p>
            <input 
              type="text" 
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              placeholder="Ex: Minha Empresa"
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Catálogo com Preço (Global)
            </label>
            <p className="text-xs text-slate-500 mb-3">Define se os PDFs do catálogo (Bot e Tela) terão preços dos produtos por padrão.</p>
            <div className="flex items-center h-[42px]">
              <button
                onClick={() => setCatalogoComPreco(!catalogoComPreco)}
                className={clsx(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                  catalogoComPreco ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    catalogoComPreco ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chave de API do Groq (Transcrição de Áudio)
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Chave para transcrever áudios (inicia com gsk_...).{' '}
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                Clique aqui para obter seu TOKEN
              </a>
            </p>
            <input 
              type="password" 
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chave de API do GROK (xAI - Geração de Textos)
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Chave para geração de textos com IA (xai-...).{' '}
              <a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                Clique aqui para obter seu TOKEN
              </a>
            </p>
            <input 
              type="password" 
              value={grokApiKey}
              onChange={(e) => setGrokApiKey(e.target.value)}
              placeholder="xai-..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Token LocationIQ (Geolocalização)
            </label>
            <p className="text-xs text-slate-500 mb-3">Fallback 1 para busca de coordenadas.</p>
            <input 
              type="text" 
              value={locationIqToken}
              onChange={(e) => setLocationIqToken(e.target.value)}
              placeholder="pk..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Token Geoapify (Geolocalização)
            </label>
            <p className="text-xs text-slate-500 mb-3">Fallback 2 para busca de coordenadas.</p>
            <input 
              type="text" 
              value={geoapifyToken}
              onChange={(e) => setGeoapifyToken(e.target.value)}
              placeholder="c64..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Token CNPJA (Busca de Leads B2B)
            </label>
            <p className="text-xs text-slate-500 mb-3">Usado pelo Radar de Leads para prospecção (cnpja.com).</p>
            <input 
              type="text" 
              value={cnpjaToken}
              onChange={(e) => setCnpjaToken(e.target.value)}
              placeholder="Sua chave do CNPJA"
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Páginas CNPJ Transparência
            </label>
            <p className="text-xs text-slate-500 mb-3">Quantas páginas o robô gratuito deve varrer (Max: 10).</p>
            <input 
              type="number" 
              min="1"
              max="10"
              value={cnpjPaginas}
              onChange={(e) => setCnpjPaginas(Number(e.target.value))}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Contato do Financeiro (WhatsApp)
            </label>
            <p className="text-xs text-slate-500 mb-3">Usado na opção 9 (Fornecedor) do Bot.</p>
            <input 
              type="text" 
              value={contatoFinanceiro}
              onChange={(e) => setContatoFinanceiro(e.target.value)}
              placeholder="Ex: 5511999999999"
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Contato de Compras (WhatsApp)
            </label>
            <p className="text-xs text-slate-500 mb-3">Usado na opção 9 (Fornecedor) do Bot.</p>
            <input 
              type="text" 
              value={contatoCompras}
              onChange={(e) => setContatoCompras(e.target.value)}
              placeholder="Ex: 5511999999999"
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

      {iaUsage && (
        <div className="glass-card p-6 flex flex-col bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
            <Wand2 size={20} className="text-primary-500" />
            Estatísticas de Uso da Inteligência Artificial (SAC)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <span className="text-sm font-semibold text-slate-500 mb-1 relative z-10">Hoje</span>
              <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 relative z-10">{iaUsage.uso?.diario || 0}</div>
              <div className="text-xs text-slate-400 mt-1 relative z-10">Limite: {iaUsage.limites?.diario || 'Sem Limite'}</div>
              {iaUsage.limites?.diario > 0 && (
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 relative z-10">
                  <div 
                    className={clsx("h-2 rounded-full", ((iaUsage.uso?.diario / iaUsage.limites?.diario) * 100) > 90 ? 'bg-red-500' : 'bg-primary-500')} 
                    style={{ width: `${Math.min(((iaUsage.uso?.diario || 0) / iaUsage.limites?.diario) * 100, 100)}%` }}
                  ></div>
                </div>
              )}
              {iaUsage.limites?.diario > 0 && (
                <div className="text-xs font-semibold text-slate-500 mt-1 relative z-10">
                  {Math.round(((iaUsage.uso?.diario || 0) / iaUsage.limites?.diario) * 100)}% Utilizado
                </div>
              )}
            </div>
            
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <span className="text-sm font-semibold text-slate-500 mb-1 relative z-10">Esta Semana</span>
              <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 relative z-10">{iaUsage.uso?.semanal || 0}</div>
              <div className="text-xs text-slate-400 mt-1 relative z-10">Limite: {iaUsage.limites?.semanal || 'Sem Limite'}</div>
              {iaUsage.limites?.semanal > 0 && (
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 relative z-10">
                  <div 
                    className={clsx("h-2 rounded-full", ((iaUsage.uso?.semanal / iaUsage.limites?.semanal) * 100) > 90 ? 'bg-red-500' : 'bg-primary-500')} 
                    style={{ width: `${Math.min(((iaUsage.uso?.semanal || 0) / iaUsage.limites?.semanal) * 100, 100)}%` }}
                  ></div>
                </div>
              )}
              {iaUsage.limites?.semanal > 0 && (
                <div className="text-xs font-semibold text-slate-500 mt-1 relative z-10">
                  {Math.round(((iaUsage.uso?.semanal || 0) / iaUsage.limites?.semanal) * 100)}% Utilizado
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <span className="text-sm font-semibold text-slate-500 mb-1 relative z-10">Este Mês</span>
              <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 relative z-10">{iaUsage.uso?.mensal || 0}</div>
              <div className="text-xs text-slate-400 mt-1 relative z-10">Limite: {iaUsage.limites?.mensal || 'Sem Limite'}</div>
              {iaUsage.limites?.mensal > 0 && (
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 relative z-10">
                  <div 
                    className={clsx("h-2 rounded-full", ((iaUsage.uso?.mensal / iaUsage.limites?.mensal) * 100) > 90 ? 'bg-red-500' : 'bg-primary-500')} 
                    style={{ width: `${Math.min(((iaUsage.uso?.mensal || 0) / iaUsage.limites?.mensal) * 100, 100)}%` }}
                  ></div>
                </div>
              )}
              {iaUsage.limites?.mensal > 0 && (
                <div className="text-xs font-semibold text-slate-500 mt-1 relative z-10">
                  {Math.round(((iaUsage.uso?.mensal || 0) / iaUsage.limites?.mensal) * 100)}% Utilizado
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs">Vendedor / Gestor</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs">Nome da Instância</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs">Apresentação (Atendente)</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs">API URL Global / Específica</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs">API Token (Evolution)</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs">Status do WhatsApp</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs text-center" title="Quem será o robô de triagem">Bot Oficial?</th>
                <th className="py-3 px-6 font-semibold text-slate-500 text-xs text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-500">Carregando vendedores...</td></tr>
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
                        value={v.nome_atendente || ''} 
                        onChange={(e) => handleChange(v.codusur, 'nome_atendente', e.target.value)}
                        placeholder="Ex: Ana (Robô)"
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
                    <td className="py-4 px-6 text-center">
                      <input 
                        type="radio" 
                        name="sacBot"
                        checked={String(sacBotCodusur) === String(v.codusur)}
                        onChange={() => handleSelectSacBot(v.codusur)}
                        className="w-4 h-4 text-primary-600 bg-slate-100 border-slate-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600 cursor-pointer"
                        title="Marcar este usuário como BOT SAC"
                      />
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
      <div className="glass-card p-6 flex flex-col mt-6">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
          <Settings2 size={20} /> Departamentos do SAC (Atendimento Bot)
        </h3>
        <div className="flex gap-4 items-end mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome do Departamento</label>
            <input 
              type="text" 
              value={novoDeptoNome}
              onChange={(e) => setNovoDeptoNome(e.target.value)}
              placeholder="Ex: Financeiro, Logística..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Sub-departamento de (Opcional)</label>
            <select 
              value={novoDeptoPai}
              onChange={(e) => setNovoDeptoPai(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Nenhum (Depto. Principal)</option>
              {departamentos.filter(d => !d.departamentoPaiId).map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={handleSaveDepto}
            disabled={savingDepto || !novoDeptoNome}
            className="whitespace-nowrap px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300">Lista de Departamentos</h4>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-400">Filtrar por Pai:</label>
            <select
              value={filtroDeptoTable}
              onChange={(e) => setFiltroDeptoTable(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Apenas Principais</option>
              <option value="todos">Todos</option>
              {departamentos.filter(d => !d.departamentoPaiId).map(d => (
                <option key={d.id} value={d.id}>Sub-departamentos de {d.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 px-4 font-semibold text-slate-500 text-xs">ID</th>
                <th className="py-2 px-4 font-semibold text-slate-500 text-xs">Departamento</th>
                <th className="py-2 px-4 font-semibold text-slate-500 text-xs">Hierarquia</th>
                <th className="py-2 px-4 font-semibold text-slate-500 text-xs">Status</th>
                <th className="py-2 px-4 font-semibold text-slate-500 text-xs">Ação</th>
              </tr>
            </thead>
            <tbody>
              {departamentos.filter(d => {
                if (filtroDeptoTable === 'todos') return true;
                if (filtroDeptoTable === '') return !d.departamentoPaiId;
                return d.departamentoPaiId === Number(filtroDeptoTable);
              }).map(d => (
                <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-2 px-4 text-sm text-slate-600 dark:text-slate-400">{d.id}</td>
                  <td className="py-2 px-4 text-sm font-medium text-slate-800 dark:text-slate-200">{d.nome}</td>
                  <td className="py-2 px-4 text-sm text-slate-500">
                    {d.departamentoPaiId ? `Sub de: ${departamentos.find(p => p.id === d.departamentoPaiId)?.nome || d.departamentoPaiId}` : 'Principal'}
                  </td>
                  <td className="py-2 px-4">
                    <span className={clsx("px-2 py-1 text-xs font-semibold rounded-full", d.ativo === 'S' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                      {d.ativo === 'S' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-2 px-4">
                    <button 
                      onClick={() => toggleDeptoAtivo(d.id, d.ativo)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {d.ativo === 'S' ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Acessos SAC (Controle por Atendente) */}
      <ControleAcessoSAC />
      
    </div>
  );
}

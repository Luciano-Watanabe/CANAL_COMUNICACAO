import { useState, useEffect, useMemo } from 'react';
import {
  Settings, Save, Plus, Trash2, Edit2, Play, Calendar, Users,
  ShoppingBag, Clock, MessageSquare, Search, RotateCcw, Bot,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff,
  Zap, Filter, RefreshCw
} from 'lucide-react';
import clsx from 'clsx';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Automacao = {
  ID?: number;
  TIPO_REGRA: string;
  DIAS_GATILHO: number | null;
  DIA_ESPECIFICO: string | null;
  TEMPLATE_MENSAGEM: string;
  ATIVO: string;
};

type BotMensagem = {
  chave: string;
  descricao: string;
  grupo: string;
  bot_tipo: 'SAC' | 'VENDEDOR';
  template_padrao: string;
  template_atual: string;
  personalizada: boolean;
  atualizado_em: string | null;
};

type EditState = {
  chave: string;
  valor: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// VARIÁVEIS DE TEMPLATE DISPONÍVEIS
// ─────────────────────────────────────────────────────────────────────────────
const VARIAVEIS_SAC = [
  { tag: '{{nome_cliente}}', desc: 'Nome do cliente' },
  { tag: '{{nome_atendente}}', desc: 'Nome do atendente/instância' },
  { tag: '{{ticket_id}}', desc: 'Número do ticket' },
  { tag: '{{nome_empresa}}', desc: 'Nome da empresa' },
];
const VARIAVEIS_VEND = [
  { tag: '{{nome_vendedor}}', desc: 'Nome do vendedor' },
  { tag: '{{nome_cliente}}', desc: 'Nome do cliente' },
  { tag: '{{nome_empresa}}', desc: 'Nome da empresa' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Card de mensagem do bot
// ─────────────────────────────────────────────────────────────────────────────

function MensagemCard({
  msg,
  onSave,
  onReset,
}: {
  msg: BotMensagem;
  onSave: (chave: string, template: string) => Promise<void>;
  onReset: (chave: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.template_atual);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const variaveis = msg.bot_tipo === 'SAC' ? VARIAVEIS_SAC : VARIAVEIS_VEND;

  const previewText = draft
    .replace(/\{\{nome_cliente\}\}/g, 'João da Silva')
    .replace(/\{\{nome_atendente\}\}/g, 'Central SAC')
    .replace(/\{\{ticket_id\}\}/g, '12345')
    .replace(/\{\{nome_vendedor\}\}/g, 'Carlos Vendas')
    .replace(/\{\{nome_empresa\}\}/g, 'Distribuidora Exemplo');

  const handleSave = async () => {
    setSaving(true);
    await onSave(msg.chave, draft);
    setSaving(false);
    setEditing(false);
  };

  const handleReset = async () => {
    if (!confirm('Restaurar para o texto padrão? Sua personalização será removida.')) return;
    await onReset(msg.chave);
    setDraft(msg.template_padrao);
    setEditing(false);
  };

  const insertTag = (tag: string) => {
    setDraft(d => d + ' ' + tag);
  };

  const isDirty = draft !== msg.template_atual;

  return (
    <div className={clsx(
      'rounded-2xl border transition-all duration-200',
      msg.personalizada
        ? 'border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
    )}>
      {/* Header do card */}
      <div
        className="flex items-start justify-between p-4 cursor-pointer select-none"
        onClick={() => { if (!editing) setExpanded(e => !e); }}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={clsx(
            'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
            msg.personalizada
              ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
          )}>
            <MessageSquare size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                {msg.descricao}
              </span>
              {msg.personalizada ? (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  <CheckCircle size={9} /> PERSONALIZADA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  PADRÃO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{msg.chave}</p>
            {!expanded && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 italic">
                {msg.template_atual.split('\n')[0]}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); setExpanded(true); setDraft(msg.template_atual); }}
              className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              title="Editar mensagem"
            >
              <Edit2 size={14} />
            </button>
          )}
          {msg.personalizada && !editing && (
            <button
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
              title="Restaurar padrão"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            className="p-1.5 text-slate-400 rounded-lg"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Corpo expandido */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          {editing ? (
            <>
              {/* Variáveis disponíveis */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-slate-400 mr-1 self-center">Variáveis:</span>
                {variaveis.map(v => (
                  <button
                    key={v.tag}
                    onClick={() => insertTag(v.tag)}
                    title={v.desc}
                    className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 transition-colors font-mono"
                  >
                    {v.tag}
                  </button>
                ))}
              </div>

              {/* Textarea editor */}
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={6}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary-400"
              />

              {/* Preview toggle */}
              <div>
                <button
                  onClick={() => setShowPreview(p => !p)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showPreview ? 'Ocultar preview' : 'Ver preview com exemplos'}
                </button>
                {showPreview && (
                  <div className="mt-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-3">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Preview (valores de exemplo):</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{previewText}</p>
                  </div>
                )}
              </div>

              {/* Botões de ação */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving || !draft.trim() || !isDirty}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                {msg.personalizada && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-xl transition-colors"
                  >
                    <RotateCcw size={14} /> Restaurar Padrão
                  </button>
                )}
                <button
                  onClick={() => { setEditing(false); setDraft(msg.template_atual); setShowPreview(false); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Visualização do template */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700/50">
                <p className="text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {msg.template_atual}
                </p>
              </div>
              {msg.personalizada && msg.template_atual !== msg.template_padrao && (
                <div className="text-xs text-slate-400">
                  <span className="font-medium text-slate-500">Padrão original:</span>
                  <span className="ml-1 italic line-clamp-2">{msg.template_padrao.split('\n')[0]}...</span>
                </div>
              )}
              {msg.atualizado_em && (
                <p className="text-xs text-slate-400">
                  Atualizado em: {new Date(msg.atualizado_em).toLocaleString('pt-BR')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ConfigMensagens() {
  const [activeTab, setActiveTab] = useState<'bot' | 'automacoes'>('bot');

  // ── Estado das Mensagens do Bot ──
  const [mensagens, setMensagens] = useState<BotMensagem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [buscaMsgs, setBuscaMsgs] = useState('');
  const [filtroBot, setFiltroBot] = useState<'TODOS' | 'SAC' | 'VENDEDOR'>('TODOS');
  const [gruposExpandidos, setGruposExpandidos] = useState<Record<string, boolean>>({});
  const [reloadingCache, setReloadingCache] = useState(false);

  // ── Estado das Automações ──
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [loadingAut, setLoadingAut] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewClientes, setPreviewClientes] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [form, setForm] = useState<Automacao>({
    TIPO_REGRA: 'SEM_VENDA',
    DIAS_GATILHO: 30,
    DIA_ESPECIFICO: '',
    TEMPLATE_MENSAGEM: 'Olá {{nome_cliente}}, sentimos sua falta! Você não compra conosco há {{dias_sem_comprar}} dias. Tem algo que possamos ajudar?',
    ATIVO: 'S'
  });

  const ruleTypes = [
    { id: 'SEM_VENDA', label: 'Clientes sem Vendas', icon: <ShoppingBag size={18} /> },
    { id: 'PERIODO_PROXIMO', label: 'Período de Compra Próximo', icon: <Clock size={18} /> },
    { id: 'VISITA', label: 'Visitas a Clientes', icon: <Users size={18} /> },
    { id: 'DIA_ESPECIFICO', label: 'Dias Específicos', icon: <Calendar size={18} /> }
  ];

  // ── Carregamento inicial ──
  useEffect(() => {
    fetchMensagens();
    fetchAutomacoes();
  }, []);

  // ── API: Mensagens do Bot ──
  const fetchMensagens = async () => {
    setLoadingMsgs(true);
    try {
      const res = await fetch('/api/bot-mensagens');
      const data = await res.json();
      if (data.success) {
        setMensagens(data.mensagens);
        // Expande o primeiro grupo de cada bot por padrão
        const novosExpandidos: Record<string, boolean> = {};
        data.mensagens.forEach((m: BotMensagem) => {
          const key = `${m.bot_tipo}__${m.grupo}`;
          if (novosExpandidos[key] === undefined) novosExpandidos[key] = true;
        });
        setGruposExpandidos(novosExpandidos);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMsgs(false);
    }
  };

  const handleSaveMensagem = async (chave: string, template: string) => {
    try {
      const res = await fetch(`/api/bot-mensagens/${chave}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template })
      });
      const data = await res.json();
      if (data.success) {
        await fetchMensagens();
      } else {
        alert(data.message || 'Erro ao salvar.');
      }
    } catch (err) {
      alert('Erro ao salvar mensagem.');
    }
  };

  const handleResetMensagem = async (chave: string) => {
    try {
      const res = await fetch(`/api/bot-mensagens/${chave}/reset`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchMensagens();
      } else {
        alert(data.message || 'Erro ao restaurar.');
      }
    } catch (err) {
      alert('Erro ao restaurar mensagem.');
    }
  };

  const handleReloadCache = async () => {
    setReloadingCache(true);
    try {
      await fetch('/api/bot-mensagens/reload-cache', { method: 'POST' });
    } finally {
      setReloadingCache(false);
    }
  };

  // ── Filtragem e agrupamento das mensagens ──
  const mensagensFiltradas = useMemo(() => {
    return mensagens.filter(m => {
      const matchBot = filtroBot === 'TODOS' || m.bot_tipo === filtroBot;
      const matchBusca = buscaMsgs === '' ||
        m.descricao.toLowerCase().includes(buscaMsgs.toLowerCase()) ||
        m.chave.toLowerCase().includes(buscaMsgs.toLowerCase()) ||
        m.template_atual.toLowerCase().includes(buscaMsgs.toLowerCase());
      return matchBot && matchBusca;
    });
  }, [mensagens, filtroBot, buscaMsgs]);

  const grupos = useMemo(() => {
    const map: Record<string, { bot_tipo: string; mensagens: BotMensagem[] }> = {};
    for (const m of mensagensFiltradas) {
      const key = `${m.bot_tipo}__${m.grupo}`;
      if (!map[key]) map[key] = { bot_tipo: m.bot_tipo, mensagens: [] };
      map[key].mensagens.push(m);
    }
    return map;
  }, [mensagensFiltradas]);

  const totalPersonalizadas = mensagens.filter(m => m.personalizada).length;

  const toggleGrupo = (key: string) => {
    setGruposExpandidos(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── API: Automações ──
  const fetchAutomacoes = async () => {
    setLoadingAut(true);
    try {
      const res = await fetch('/api/automacoes');
      const data = await res.json();
      if (data.success) setAutomacoes(data.automacoes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAut(false);
    }
  };

  const handleSaveAutomacao = async () => {
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/automacoes/${editingId}` : '/api/automacoes';
      const payload = {
        tipo_regra: form.TIPO_REGRA,
        dias_gatilho: form.DIAS_GATILHO,
        dia_especifico: form.DIA_ESPECIFICO,
        template_mensagem: form.TEMPLATE_MENSAGEM,
        ativo: form.ATIVO
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setEditingId(null);
        fetchAutomacoes();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Erro ao salvar automação');
    }
  };

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreviewClientes([]);
    try {
      const url = `/api/automacoes/preview?tipo_regra=${form.TIPO_REGRA}&dias_gatilho=${form.DIAS_GATILHO || ''}&dia_especifico=${form.DIA_ESPECIFICO || ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setPreviewClientes(data.clientes);
      else alert(data.message);
    } catch (err) {
      alert('Erro ao carregar preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDeleteAutomacao = async (id: number) => {
    if (!confirm('Deseja excluir esta automação?')) return;
    try {
      const res = await fetch(`/api/automacoes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchAutomacoes();
    } catch (err) {
      console.error(err);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center text-primary-600 dark:text-primary-400">
          <Settings size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configurações de Mensagens</h1>
          <p className="text-slate-500 dark:text-slate-400">Personalize todos os textos do BOT e configure automações de envio.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('bot')}
          className={clsx(
            'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors',
            activeTab === 'bot'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          <Bot size={16} />
          Mensagens do Bot
          {totalPersonalizadas > 0 && (
            <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 text-xs font-bold px-2 py-0.5 rounded-full">
              {totalPersonalizadas} personalizadas
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('automacoes')}
          className={clsx(
            'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors',
            activeTab === 'automacoes'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          <Zap size={16} />
          Automações de Disparo
          {automacoes.length > 0 && (
            <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">
              {automacoes.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA: MENSAGENS DO BOT                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'bot' && (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Busca */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por descrição, chave ou conteúdo..."
                value={buscaMsgs}
                onChange={e => setBuscaMsgs(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
            {/* Filtro Bot */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <Filter size={14} className="ml-2 text-slate-400" />
              {(['TODOS', 'SAC', 'VENDEDOR'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setFiltroBot(opt)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                    filtroBot === opt
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
            {/* Reload Cache */}
            <button
              onClick={handleReloadCache}
              disabled={reloadingCache}
              title="Forçar reload do cache do bot (após editar mensagens manualmente no banco)"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl transition-colors"
            >
              <RefreshCw size={14} className={reloadingCache ? 'animate-spin' : ''} />
              Reload Cache
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span>{mensagensFiltradas.length} mensagens</span>
            <span>·</span>
            <span className="text-primary-600 dark:text-primary-400 font-medium">{totalPersonalizadas} personalizadas</span>
            <span>·</span>
            <span>{mensagens.length - totalPersonalizadas} no padrão</span>
          </div>

          {/* Loading */}
          {loadingMsgs ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Carregando mensagens...
            </div>
          ) : Object.keys(grupos).length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center text-slate-500">
              <AlertCircle size={32} className="mx-auto mb-3 text-slate-300" />
              Nenhuma mensagem encontrada para os filtros selecionados.
            </div>
          ) : (
            Object.entries(grupos).map(([key, grupo]) => {
              const [botTipo, grupoNome] = key.split('__');
              const isOpen = gruposExpandidos[key] !== false;
              const personalizadasNoGrupo = grupo.mensagens.filter(m => m.personalizada).length;

              return (
                <div key={key} className="glass-card rounded-2xl overflow-hidden">
                  {/* Header do grupo */}
                  <button
                    onClick={() => toggleGrupo(key)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={clsx(
                        'text-xs font-bold px-2.5 py-1 rounded-full',
                        botTipo === 'SAC'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                      )}>
                        {botTipo}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{grupoNome}</span>
                      <span className="text-xs text-slate-400">{grupo.mensagens.length} mensagens</span>
                      {personalizadasNoGrupo > 0 && (
                        <span className="text-xs bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 px-2 py-0.5 rounded-full font-medium">
                          {personalizadasNoGrupo} personalizada{personalizadasNoGrupo > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>

                  {/* Cards das mensagens */}
                  {isOpen && (
                    <div className="p-4 pt-0 space-y-3">
                      {grupo.mensagens.map(msg => (
                        <MensagemCard
                          key={msg.chave}
                          msg={msg}
                          onSave={handleSaveMensagem}
                          onReset={handleResetMensagem}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA: AUTOMAÇÕES                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'automacoes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
                {editingId ? <Edit2 size={18} /> : <Plus size={18} />}
                {editingId ? 'Editar Automação' : 'Nova Automação'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Regra</label>
                  <select
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-900 dark:text-white"
                    value={form.TIPO_REGRA}
                    onChange={(e) => setForm({ ...form, TIPO_REGRA: e.target.value })}
                  >
                    {ruleTypes.map(rt => (
                      <option key={rt.id} value={rt.id}>{rt.label}</option>
                    ))}
                  </select>
                </div>

                {(form.TIPO_REGRA === 'SEM_VENDA' || form.TIPO_REGRA === 'PERIODO_PROXIMO') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {form.TIPO_REGRA === 'SEM_VENDA' ? 'Dias sem Comprar' : 'Dias para o Vencimento'}
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2"
                      value={form.DIAS_GATILHO || ''}
                      onChange={(e) => setForm({ ...form, DIAS_GATILHO: Number(e.target.value) })}
                      placeholder="Ex: 30"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      {form.TIPO_REGRA === 'SEM_VENDA'
                        ? 'Aciona exatamente quando fizerem X dias da última compra.'
                        : 'Avisa quando faltarem X dias para a data prevista da nova compra.'}
                    </p>
                  </div>
                )}

                {form.TIPO_REGRA === 'DIA_ESPECIFICO' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dia Específico (ex: 05, SEG)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2"
                      value={form.DIA_ESPECIFICO || ''}
                      onChange={(e) => setForm({ ...form, DIA_ESPECIFICO: e.target.value })}
                      placeholder="SEG ou 10"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensagem (Template)</label>
                  <textarea
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 min-h-[120px]"
                    value={form.TEMPLATE_MENSAGEM}
                    onChange={(e) => setForm({ ...form, TEMPLATE_MENSAGEM: e.target.value })}
                    placeholder="Escreva a mensagem aqui..."
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['{{nome_cliente}}', '{{dias_sem_comprar}}', '{{vendedor}}'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setForm(f => ({ ...f, TEMPLATE_MENSAGEM: f.TEMPLATE_MENSAGEM + ' ' + tag }))}
                        className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-300"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ativo"
                    checked={form.ATIVO === 'S'}
                    onChange={(e) => setForm({ ...form, ATIVO: e.target.checked ? 'S' : 'N' })}
                  />
                  <label htmlFor="ativo" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Automação Ativa
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={loadingPreview}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-2 flex items-center justify-center gap-2 font-medium transition-colors"
                >
                  {loadingPreview ? 'Carregando...' : 'Testar Filtro (Preview)'}
                </button>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={handleSaveAutomacao}
                    className="flex-1 bg-primary-600 text-white rounded-xl py-2 flex items-center justify-center gap-2 hover:bg-primary-700"
                  >
                    <Save size={18} /> {editingId ? 'Salvar Alterações' : 'Criar Automação'}
                  </button>
                  {editingId && (
                    <button
                      onClick={() => { setEditingId(null); setForm({ ...form, TEMPLATE_MENSAGEM: '' }); }}
                      className="px-4 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita */}
          <div className="lg:col-span-2 space-y-8">
            {/* Preview */}
            {previewClientes.length > 0 && (
              <div className="space-y-4 animate-fade-in">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users size={18} /> Resultados da Simulação ({previewClientes.length})
                </h2>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl max-h-96 overflow-y-auto shadow-sm">
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewClientes.map((cli, idx) => (
                      <li key={idx} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{cli.CLIENTE}</div>
                            <div className="text-sm text-slate-500 mt-1">{cli.TELEFONE}</div>
                          </div>
                          <span className="inline-block bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-3 py-1 rounded-full text-xs font-bold border border-primary-100 dark:border-primary-800">
                            {form.TIPO_REGRA === 'SEM_VENDA' && `Dias sem comprar: ${cli.VALOR_ANALISE}`}
                            {form.TIPO_REGRA === 'PERIODO_PROXIMO' && `Prazo Médio: ${cli.VALOR_ANALISE} dias`}
                            {form.TIPO_REGRA !== 'SEM_VENDA' && form.TIPO_REGRA !== 'PERIODO_PROXIMO' && `Análise: ${cli.VALOR_ANALISE}`}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Lista de Automações */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Play size={18} /> Automações Configuradas
              </h2>

              {loadingAut ? (
                <div className="text-slate-500">Carregando automações...</div>
              ) : automacoes.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 text-center text-slate-500">
                  Nenhuma automação configurada ainda.
                </div>
              ) : (
                automacoes.map(aut => {
                  const rule = ruleTypes.find(r => r.id === aut.TIPO_REGRA);
                  return (
                    <div key={aut.ID} className={clsx(
                      'glass-card rounded-2xl p-6 transition-all border-l-4',
                      aut.ATIVO === 'S' ? 'border-primary-500' : 'border-slate-300 dark:border-slate-700 opacity-70'
                    )}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            aut.ATIVO === 'S' ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                          )}>
                            {rule?.icon}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              {rule?.label || aut.TIPO_REGRA}
                              <span className={clsx(
                                'text-[10px] px-2 py-0.5 rounded-full font-bold',
                                aut.ATIVO === 'S' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                              )}>
                                {aut.ATIVO === 'S' ? 'ATIVO' : 'INATIVO'}
                              </span>
                            </h3>
                            <p className="text-xs text-slate-500">
                              {aut.TIPO_REGRA === 'SEM_VENDA' && `Dispara aos ${aut.DIAS_GATILHO} dias sem compra.`}
                              {aut.TIPO_REGRA === 'PERIODO_PROXIMO' && `Dispara faltando ${aut.DIAS_GATILHO} dias para próxima compra.`}
                              {aut.TIPO_REGRA === 'DIA_ESPECIFICO' && `Dispara no dia: ${aut.DIA_ESPECIFICO}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(aut.ID!);
                              setForm({
                                TIPO_REGRA: aut.TIPO_REGRA,
                                DIAS_GATILHO: aut.DIAS_GATILHO,
                                DIA_ESPECIFICO: aut.DIA_ESPECIFICO,
                                TEMPLATE_MENSAGEM: aut.TEMPLATE_MENSAGEM,
                                ATIVO: aut.ATIVO
                              });
                              setPreviewClientes([]);
                              setActiveTab('automacoes');
                            }}
                            className="p-2 text-primary-500 hover:bg-primary-50 rounded-xl transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteAutomacao(aut.ID!)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
                        <p className="text-sm text-slate-600 dark:text-slate-300 italic whitespace-pre-wrap">
                          "{aut.TEMPLATE_MENSAGEM}"
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

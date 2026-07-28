import { useState, useEffect } from 'react';
import { Settings, Save, Plus, Trash2, Edit2, Play, Calendar, Users, ShoppingBag, Clock } from 'lucide-react';
import clsx from 'clsx';

type Automacao = {
  ID?: number;
  TIPO_REGRA: string;
  DIAS_GATILHO: number | null;
  DIA_ESPECIFICO: string | null;
  TEMPLATE_MENSAGEM: string;
  ATIVO: string;
};

export default function ConfigMensagens() {
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchAutomacoes();
  }, []);

  const fetchAutomacoes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automacoes');
      const data = await res.json();
      if (data.success) {
        setAutomacoes(data.automacoes);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
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
      console.error(err);
      alert('Erro ao salvar automação');
    }
  };

  const handleEdit = (aut: Automacao) => {
    setEditingId(aut.ID!);
    setForm({
      TIPO_REGRA: aut.TIPO_REGRA,
      DIAS_GATILHO: aut.DIAS_GATILHO,
      DIA_ESPECIFICO: aut.DIA_ESPECIFICO,
      TEMPLATE_MENSAGEM: aut.TEMPLATE_MENSAGEM,
      ATIVO: aut.ATIVO
    });
    setPreviewClientes([]);
  };

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreviewClientes([]);
    try {
      const url = `/api/automacoes/preview?tipo_regra=${form.TIPO_REGRA}&dias_gatilho=${form.DIAS_GATILHO || ''}&dia_especifico=${form.DIA_ESPECIFICO || ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setPreviewClientes(data.clientes);
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir esta automação?')) return;
    try {
      const res = await fetch(`/api/automacoes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchAutomacoes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center text-primary-600 dark:text-primary-400">
          <Settings size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Automações de Mensagens</h1>
          <p className="text-slate-500 dark:text-slate-400">Configure robôs para enviar mensagens automáticas via BOT_GESTOR.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Criação/Edição */}
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

              <div className="pt-2">
                <button 
                  type="button"
                  onClick={handlePreview}
                  disabled={loadingPreview}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-2 flex items-center justify-center gap-2 font-medium transition-colors"
                >
                  {loadingPreview ? 'Carregando...' : 'Testar Filtro (Preview)'}
                </button>
              </div>
              


              <div className="pt-4 flex gap-2">
                <button 
                  onClick={handleSave}
                  className="flex-1 bg-primary-600 text-white rounded-xl py-2 flex items-center justify-center gap-2 hover:bg-primary-700"
                >
                  <Save size={18} /> {editingId ? 'Salvar Alterações' : 'Criar Automação'}
                </button>
                {editingId && (
                  <button 
                    onClick={() => { setEditingId(null); setForm({ ...form, TEMPLATE_MENSAGEM: ''}); }}
                    className="px-4 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna da Direita */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Resultados do Preview */}
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
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-base">{cli.CLIENTE}</div>
                          <div className="text-sm text-slate-500 mt-1">{cli.TELEFONE}</div>
                        </div>
                        <div className="text-right">
                          <span className="inline-block bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-3 py-1 rounded-full text-xs font-bold border border-primary-100 dark:border-primary-800">
                            {form.TIPO_REGRA === 'SEM_VENDA' && `Dias sem comprar: ${cli.VALOR_ANALISE}`}
                            {form.TIPO_REGRA === 'PERIODO_PROXIMO' && `Prazo Médio: ${cli.VALOR_ANALISE} dias`}
                            {form.TIPO_REGRA !== 'SEM_VENDA' && form.TIPO_REGRA !== 'PERIODO_PROXIMO' && `Análise: ${cli.VALOR_ANALISE}`}
                          </span>
                        </div>
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
          
          {loading ? (
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
                  "glass-card rounded-2xl p-6 transition-all border-l-4",
                  aut.ATIVO === 'S' ? "border-primary-500" : "border-slate-300 dark:border-slate-700 opacity-70"
                )}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        aut.ATIVO === 'S' ? "bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      )}>
                        {rule?.icon}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          {rule?.label || aut.TIPO_REGRA}
                          <span className={clsx(
                            "text-[10px] px-2 py-0.5 rounded-full font-bold",
                            aut.ATIVO === 'S' ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
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
                      <button onClick={() => handleEdit(aut)} className="p-2 text-primary-500 hover:bg-primary-50 rounded-xl transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(aut.ID!)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
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
              )
            })
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Shield, Save, Check } from 'lucide-react';
import clsx from 'clsx';

const PERFIS = ['GERENTE', 'SUPERVISOR', 'VENDEDOR', 'ATENDENTE'];

const TODAS_OPCOES_MENU = [
  { id: 'Dashboard', nome: 'Dashboard' },
  { id: 'Carteira de Clientes', nome: 'Carteira de Clientes' },
  { id: 'Chat (Atendimento)', nome: 'Chat (Atendimento)' },
  { id: 'SAC', nome: 'SAC' },
  { id: 'Catálogo', nome: 'Catálogo' },
  { id: 'Logs Identificação', nome: 'Logs Identificação' },
  { id: 'Configurações', nome: 'Configurações' },
  { id: 'Objetivos', nome: 'Objetivos' },
  { id: 'Campanhas (Status)', nome: 'Campanhas (Status)' },
  { id: 'Rotas de Visitas', nome: 'Rotas de Visitas' },
  { id: 'Clientes Inativos', nome: 'Clientes Inativos' },
  { id: 'Análise de CNPJ', nome: 'Análise de CNPJ' },
  { id: 'Análise de I.E.', nome: 'Análise de I.E.' },
  { id: 'Geolocalização', nome: 'Geolocalização' },
  { id: 'Radar de Leads', nome: 'Radar de Leads' },
  { id: 'Gestão de Vendedores', nome: 'Gestão de Vendedores' },
  { id: 'Automação de Mensagens', nome: 'Automação de Mensagens' },
  { id: 'Agendamentos de vendedores', nome: 'Agendamentos de vendedores' },
];

const OPCOES_DASHBOARD = [
  { id: 'Métricas SAC', nome: 'Métricas SAC' },
  { id: 'Mural de Avisos', nome: 'Mural de Avisos' },
  { id: 'Ranking de Vendas', nome: 'Ranking de Vendas' },
  { id: 'Ranking de Clientes', nome: 'Ranking de Clientes' },
  { id: 'Ranking de Produtos', nome: 'Ranking de Produtos' },
  { id: 'Atividade por Hora', nome: 'Atividade por Hora' },
  { id: 'Adesão ao Mix', nome: 'Adesão ao Mix' },
  { id: 'Visão Hierárquica', nome: 'Visão Hierárquica' },
  { id: 'Radar Positivação', nome: 'Radar Positivação' },
  { id: 'Meus Clientes Recentes', nome: 'Meus Clientes Recentes' },
];

const DEFAULT_PERMISSIONS: any = {
  GERENTE: {
    menus: ['Dashboard', 'Carteira de Clientes', 'Chat (Atendimento)', 'SAC', 'Catálogo', 'Logs Identificação', 'Configurações', 'Objetivos', 'Campanhas (Status)', 'Rotas de Visitas', 'Clientes Inativos', 'Análise de CNPJ', 'Análise de I.E.', 'Geolocalização', 'Radar de Leads'],
    dashboard: ['Métricas SAC', 'Mural de Avisos', 'Ranking de Vendas', 'Ranking de Clientes', 'Ranking de Produtos', 'Atividade por Hora', 'Adesão ao Mix', 'Visão Hierárquica', 'Radar Positivação', 'Meus Clientes Recentes']
  },
  SUPERVISOR: {
    menus: ['Dashboard', 'Carteira de Clientes', 'Chat (Atendimento)', 'SAC', 'Catálogo', 'Logs Identificação', 'Objetivos', 'Campanhas (Status)', 'Rotas de Visitas', 'Clientes Inativos', 'Análise de CNPJ', 'Análise de I.E.', 'Geolocalização', 'Radar de Leads'],
    dashboard: ['Métricas SAC', 'Mural de Avisos', 'Ranking de Vendas', 'Ranking de Clientes', 'Ranking de Produtos', 'Atividade por Hora', 'Adesão ao Mix', 'Visão Hierárquica', 'Radar Positivação', 'Meus Clientes Recentes']
  },
  VENDEDOR: {
    menus: ['Dashboard', 'Carteira de Clientes', 'Chat (Atendimento)', 'SAC', 'Catálogo'],
    dashboard: ['Métricas SAC', 'Mural de Avisos', 'Ranking de Vendas', 'Ranking de Clientes', 'Ranking de Produtos', 'Atividade por Hora', 'Radar Positivação', 'Meus Clientes Recentes']
  },
  ATENDENTE: {
    menus: ['Dashboard', 'Chat (Atendimento)', 'SAC', 'Catálogo'],
    dashboard: ['Métricas SAC', 'Mural de Avisos']
  }
};

export function ControleAcessosMenu() {
  const [perfilSelecionado, setPerfilSelecionado] = useState<string>('GERENTE');
  const [permissoes, setPermissoes] = useState<any>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPermissoes = async () => {
      try {
        const res = await fetch('/api/config/global');
        const data = await res.json();
        if (data.success && data.configs['MENU_PERMISSIONS']) {
          try {
            const parsed = JSON.parse(data.configs['MENU_PERMISSIONS']);
            setPermissoes((prev: any) => ({ ...prev, ...parsed }));
          } catch (e) {
            console.error('Erro ao fazer parse de MENU_PERMISSIONS', e);
          }
        }
      } catch (e) {
        console.error('Erro ao buscar permissões', e);
      }
    };
    fetchPermissoes();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: { 
            MENU_PERMISSIONS: JSON.stringify(permissoes)
          }
        })
      });
      const data = await response.json();
      if (data.success) {
        alert('Permissões de Acesso salvas com sucesso!');
      } else {
        alert('Erro ao salvar permissões.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMenu = (menuId: string) => {
    setPermissoes((prev: any) => {
      const atual = prev[perfilSelecionado] || { menus: [], dashboard: [] };
      const hasMenu = atual.menus.includes(menuId);
      return {
        ...prev,
        [perfilSelecionado]: {
          ...atual,
          menus: hasMenu 
            ? atual.menus.filter((m: string) => m !== menuId)
            : [...atual.menus, menuId]
        }
      };
    });
  };

  const toggleDashboardOption = (optionId: string) => {
    setPermissoes((prev: any) => {
      const atual = prev[perfilSelecionado] || { menus: [], dashboard: [] };
      const hasOption = atual.dashboard.includes(optionId);
      return {
        ...prev,
        [perfilSelecionado]: {
          ...atual,
          dashboard: hasOption 
            ? atual.dashboard.filter((o: string) => o !== optionId)
            : [...atual.dashboard, optionId]
        }
      };
    });
  };

  const perfilAtual = permissoes[perfilSelecionado] || { menus: [], dashboard: [] };

  return (
    <div className="glass-card p-6 flex flex-col gap-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Shield size={20} className="text-primary-500" /> Permissões de Acesso ao Menu
          </h3>
          <p className="text-sm text-slate-500 mt-1">Configure o que cada perfil pode acessar no menu lateral e dentro do Dashboard.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {PERFIS.map(perfil => (
          <button
            key={perfil}
            onClick={() => setPerfilSelecionado(perfil)}
            className={clsx(
              "px-4 py-2 rounded-lg font-medium text-sm transition-colors",
              perfilSelecionado === perfil 
                ? "bg-primary-600 text-white" 
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            {perfil}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">Opções do Menu Lateral</h4>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {TODAS_OPCOES_MENU.map(opcao => {
              const checked = perfilAtual.menus.includes(opcao.id);
              return (
                <label key={opcao.id} className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-slate-900 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                  <div className={clsx(
                    "w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors",
                    checked ? "bg-primary-500 border-primary-500 text-white" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  )}>
                    <input 
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => toggleMenu(opcao.id)}
                    />
                    {checked && <Check size={14} />}
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{opcao.nome}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">Sub-itens do Dashboard</h4>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {OPCOES_DASHBOARD.map(opcao => {
              const checked = perfilAtual.dashboard.includes(opcao.id);
              return (
                <label key={opcao.id} className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-slate-900 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                  <div className={clsx(
                    "w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors",
                    checked ? "bg-primary-500 border-primary-500 text-white" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  )}>
                    <input 
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => toggleDashboardOption(opcao.id)}
                    />
                    {checked && <Check size={14} />}
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{opcao.nome}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="whitespace-nowrap px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar Permissões'}
        </button>
      </div>
    </div>
  );
}

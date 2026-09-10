import { useState, useEffect } from 'react';
import { Shield, Save, Check, Link2 } from 'lucide-react';
import clsx from 'clsx';
import { WhatsAppMonitor } from './WhatsAppMonitor';

export function ControleAcessoSAC() {
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  // Chave composta "MATRICULA:TABELA" (ex: "1:PCEMPR" ou "1:PCUSUARI")
  // Evita colisão entre Atendente e Vendedor com o mesmo ID numérico
  const [acessos, setAcessos] = useState<Record<string, number[]>>({});
  const [tipoUsuario, setTipoUsuario] = useState<'atendente' | 'vendedor'>('atendente');
  const [selectedKey, setSelectedKey] = useState<string | null>(null); // chave composta selecionada
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingWa, setSavingWa] = useState<number | null>(null);
  const [waForm, setWaForm] = useState<Record<number, { instance_name: string; api_token: string; linked: boolean }>>({});

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /** Monta a chave composta a partir de ID e tipo de usuário */
  const getAcessoKey = (id: number, tipo: 'atendente' | 'vendedor'): string =>
    `${id}:${tipo === 'vendedor' ? 'PCUSUARI' : 'PCEMPR'}`;

  useEffect(() => {
    Promise.all([
      fetch('/api/config/funcionarios').then(res => {
        if (!res.ok) throw new Error('Falha funcionarios');
        return res.json();
      }),
      fetch('/api/config/vendedores').then(res => {
        if (!res.ok) throw new Error('Falha vendedores');
        return res.json();
      }),
      fetch('/api/sac/departamentos').then(res => {
        if (!res.ok) throw new Error('Falha departamentos');
        return res.json();
      }),
      fetch('/api/config/acessos-sac').then(res => {
        if (!res.ok) throw new Error('Falha acessos');
        return res.json();
      })
    ]).then(([fData, vData, dData, aData]) => {
      setFuncionarios(fData || []);
      setVendedores(vData.success ? vData.vendedores : []);
      setDepartamentos(dData || []);
      setAcessos(aData || {});
      // Pré-preenche instância/token a partir da mesma base usada na lista de Vendedor/Gestor
      const initialWa: Record<number, { instance_name: string; api_token: string; linked: boolean }> = {};
      if (vData && vData.vendedores) {
        vData.vendedores.forEach((v: any) => {
          if (v.codusur != null) {
            initialWa[Number(v.codusur)] = {
              instance_name: v.instance_name || '',
              api_token: v.api_token || '',
              linked: !!(v.instance_name && v.api_token)
            };
          }
        });
      }
      setWaForm(initialWa);
      setErrorMsg(null);
    }).catch(err => {
      console.error(err);
      setErrorMsg('Falha ao conectar com o servidor. Por favor, atualize a página.');
    }).finally(() => setLoading(false));
  }, []);

  const handleToggleDepartamento = (deptId: number) => {
    if (!selectedKey) return;
    setAcessos(prev => {
      const current = prev[selectedKey] || [];
      const isSelected = current.includes(deptId);
      return {
        ...prev,
        [selectedKey]: isSelected 
          ? current.filter(id => id !== deptId)
          : [...current, deptId]
      };
    });
  };

  const handleSave = async () => {
    if (!selectedKey) return;
    // Extrai o ID numérico e a tabela da chave composta
    const [idStr, tabela] = selectedKey.split(':');
    const matricula = Number(idStr);
    setSaving(true);
    try {
      const res = await fetch('/api/config/acessos-sac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricula,
          departamentos: acessos[selectedKey] || [],
          tabela
        })
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        alert('Erro ao salvar acessos.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de comunicação.');
    } finally {
      setSaving(false);
    }
  };

  const handleBindWhats = async (id: number) => {
    const row = waForm[id];
    if (!row) return;
    if (!row.instance_name.trim() || !row.api_token.trim()) {
      alert('Informe o Nome da Instância e o Token para vincular o WhatsApp.');
      return;
    }
    setSavingWa(id);
    try {
      const res = await fetch('/api/config/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codusur: id,
          api_token: row.api_token,
          instance_name: row.instance_name
        })
      });
      if (res.ok) {
        setWaForm(prev => ({ ...prev, [id]: { ...row, linked: true } }));
        alert('Instância vinculada com sucesso! Abra o modal do QR Code para conectar.');
      } else {
        const err = await res.json();
        alert('Erro ao vincular: ' + (err.message || err.error || 'erro desconhecido'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de comunicação ao vincular.');
    } finally {
      setSavingWa(null);
    }
  };

  if (loading) return <div className="p-4 text-slate-500">Carregando permissões...</div>;
  if (errorMsg) return <div className="p-4 text-rose-500 font-medium">{errorMsg}</div>;

  const currentAcessos = selectedKey ? (acessos[selectedKey] || []) : [];

  const usuariosComAcesso = Object.keys(acessos)
    .filter(k => acessos[k] && acessos[k].length > 0)
    .map(k => {
      // Chave composta: "MATRICULA:TABELA"
      const [idStr, tabela] = k.split(':');
      const id = Number(idStr);
      if (tabela === 'PCEMPR') {
        const func = funcionarios.find(f => f.MATRICULA === id);
        return { key: k, id, nome: func ? func.NOME : `Atendente (${id})`, tipo: 'Atendente' as const };
      } else {
        const vend = vendedores.find(v => Number(v.codusur) === id);
        return { key: k, id, nome: vend ? vend.nome : `Vendedor (${id})`, tipo: 'Vendedor' as const };
      }
    });

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-2">
        <Shield className="text-indigo-500" size={20} />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Controle de Acessos por Departamento
        </h2>
      </div>
      
      <div className="p-5">
        {usuariosComAcesso.length > 0 && (
          <div className="mb-8 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Usuários com Acesso Configurado</h3>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-4 font-semibold text-slate-500">Tipo</th>
                  <th className="py-2 px-4 font-semibold text-slate-500">Usuário</th>
                  <th className="py-2 px-4 font-semibold text-slate-500">Departamentos Permitidos</th>
                  {(usuariosComAcesso.some(u => u.tipo === 'Atendente')) && (
                    <>
                      <th className="py-2 px-4 font-semibold text-slate-500">Nome da Instância</th>
                      <th className="py-2 px-4 font-semibold text-slate-500">Token (Evolution)</th>
                      <th className="py-2 px-4 font-semibold text-slate-500 text-center">WhatsApp</th>
                    </>
                  )}
                  <th className="py-2 px-4 font-semibold text-slate-500 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {usuariosComAcesso.map(u => (
                  <tr key={u.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                    <td className="py-2 px-4 text-slate-600 dark:text-slate-400">{u.tipo}</td>
                    <td className="py-2 px-4 font-medium text-slate-800 dark:text-slate-200">{u.nome} (Cód: {u.id})</td>
                    <td className="py-2 px-4 text-slate-600 dark:text-slate-400">
                      {acessos[u.key].map(deptId => departamentos.find(d => d.id === deptId)?.nome || `Dep ${deptId}`).join(', ')}
                    </td>
                    {u.tipo === 'Atendente' ? (
                      <>
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            value={waForm[u.id]?.instance_name || ''}
                            onChange={(e) => setWaForm(prev => ({ ...prev, [u.id]: { instance_name: e.target.value, api_token: prev[u.id]?.api_token || '', linked: prev[u.id]?.linked || false } }))}
                            placeholder="Ex: RCA_Atendente"
                            className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            value={waForm[u.id]?.api_token || ''}
                            onChange={(e) => setWaForm(prev => ({ ...prev, [u.id]: { instance_name: prev[u.id]?.instance_name || '', api_token: e.target.value, linked: prev[u.id]?.linked || false } }))}
                            placeholder="Colar Token aqui"
                            className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-4 text-center">
                          {waForm[u.id]?.linked ? (
                            <WhatsAppMonitor codusur={u.id} />
                          ) : (
                            <button
                              onClick={() => handleBindWhats(u.id)}
                              disabled={savingWa === u.id || !(waForm[u.id]?.instance_name?.trim() && waForm[u.id]?.api_token?.trim())}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors"
                              title="Preencha Nome da Instância e Token para vincular"
                            >
                              <Link2 size={14} />
                              {savingWa === u.id ? 'Vinculando...' : 'Vincular WhatsApp'}
                            </button>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 px-4 text-slate-400">—</td>
                        <td className="py-2 px-4 text-slate-400">—</td>
                        <td className="py-2 px-4 text-center text-slate-400">—</td>
                      </>
                    )}
                    <td className="py-2 px-4 text-right">
                      <button 
                        onClick={() => {
                          setTipoUsuario(u.tipo === 'Vendedor' ? 'vendedor' : 'atendente');
                          setSelectedKey(u.key);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-medium"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-6 border-t border-slate-200 dark:border-slate-700 pt-6">
          <div className="w-full md:w-1/3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Configurar ou Editar Acessos</h3>
            <div className="flex gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button 
                onClick={() => { setTipoUsuario('atendente'); setSelectedKey(null); }}
                className={clsx("flex-1 text-sm py-1.5 rounded-md font-medium transition-colors", tipoUsuario === 'atendente' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
              >
                Atendentes
              </button>
              <button 
                onClick={() => { setTipoUsuario('vendedor'); setSelectedKey(null); }}
                className={clsx("flex-1 text-sm py-1.5 rounded-md font-medium transition-colors", tipoUsuario === 'vendedor' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
              >
                Vendedores
              </button>
            </div>

            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Selecione o {tipoUsuario === 'atendente' ? 'Atendente (PCEMPR)' : 'Vendedor (PCUSUARI)'}
            </label>
            <select
              className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              value={selectedKey ? selectedKey.split(':')[0] : ''}
              onChange={(e) => setSelectedKey(e.target.value ? getAcessoKey(Number(e.target.value), tipoUsuario) : null)}
            >
              <option value="">-- Selecione --</option>
              {tipoUsuario === 'atendente' 
                ? funcionarios.map(f => (
                    <option key={f.MATRICULA} value={f.MATRICULA}>
                      {f.MATRICULA} - {f.NOME} {f.NOME_GUERRA && `(${f.NOME_GUERRA})`}
                    </option>
                  ))
                : vendedores.map(v => (
                    <option key={v.codusur} value={v.codusur}>
                      {v.codusur} - {v.nome}
                    </option>
                  ))
              }
            </select>
            <p className="mt-3 text-xs text-slate-500">
              Selecione um funcionário para configurar quais chamados do SAC ele pode acessar. 
              <br/><br/>
              Se nenhum departamento for marcado, ele não verá nenhum ticket.
            </p>
          </div>

        <div className="flex-1">
          {selectedKey ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Departamentos Permitidos
                </label>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saved ? <Check size={16} /> : <Save size={16} />}
                  {saved ? 'Salvo!' : 'Salvar Permissões'}
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar p-1">
                {departamentos.filter(dept => !dept.departamentoPaiId).map(dept => {
                  const isChecked = currentAcessos.includes(dept.id);
                  return (
                    <label 
                      key={dept.id} 
                      className={clsx(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        isChecked 
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" 
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        handleToggleDepartamento(dept.id);
                      }}
                    >
                      <div className={clsx(
                        "w-5 h-5 rounded flex items-center justify-center border",
                        isChecked ? "bg-indigo-500 border-indigo-500" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      )}>
                        {isChecked && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {dept.nome}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <span className="text-sm text-slate-400">Selecione um funcionário ao lado.</span>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

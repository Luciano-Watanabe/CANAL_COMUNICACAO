import { useState, useEffect } from 'react';
import { Shield, Save, Check } from 'lucide-react';
import clsx from 'clsx';

export function ControleAcessoSAC() {
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [acessos, setAcessos] = useState<Record<number, number[]>>({});
  const [tipoUsuario, setTipoUsuario] = useState<'atendente' | 'vendedor'>('atendente');
  const [selectedMatricula, setSelectedMatricula] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      setErrorMsg(null);
    }).catch(err => {
      console.error(err);
      setErrorMsg('Falha ao conectar com o servidor. Por favor, atualize a página.');
    }).finally(() => setLoading(false));
  }, []);

  const handleToggleDepartamento = (deptId: number) => {
    if (!selectedMatricula) return;
    setAcessos(prev => {
      const current = prev[selectedMatricula] || [];
      const isSelected = current.includes(deptId);
      return {
        ...prev,
        [selectedMatricula]: isSelected 
          ? current.filter(id => id !== deptId)
          : [...current, deptId]
      };
    });
  };

  const handleSave = async () => {
    if (!selectedMatricula) return;
    setSaving(true);
    try {
      const res = await fetch('/api/config/acessos-sac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricula: selectedMatricula,
          departamentos: acessos[selectedMatricula] || [],
          tabela: tipoUsuario === 'atendente' ? 'PCEMPR' : 'PCUSUARI'
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

  if (loading) return <div className="p-4 text-slate-500">Carregando permissões...</div>;
  if (errorMsg) return <div className="p-4 text-rose-500 font-medium">{errorMsg}</div>;

  const currentAcessos = selectedMatricula ? (acessos[selectedMatricula] || []) : [];

  const usuariosComAcesso = Object.keys(acessos)
    .filter(k => acessos[Number(k)] && acessos[Number(k)].length > 0)
    .map(k => {
      const id = Number(k);
      const func = funcionarios.find(f => f.MATRICULA === id);
      if (func) return { id, nome: func.NOME, tipo: 'Atendente' };
      const vend = vendedores.find(v => v.codusur === id);
      if (vend) return { id, nome: vend.nome, tipo: 'Vendedor' };
      return { id, nome: `ID Desconhecido (${id})`, tipo: 'Desconhecido' };
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
                  <th className="py-2 px-4 font-semibold text-slate-500 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {usuariosComAcesso.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-4 text-slate-600 dark:text-slate-400">{u.tipo}</td>
                    <td className="py-2 px-4 font-medium text-slate-800 dark:text-slate-200">{u.nome} (Cód: {u.id})</td>
                    <td className="py-2 px-4 text-slate-600 dark:text-slate-400">
                      {acessos[u.id].map(deptId => departamentos.find(d => d.id === deptId)?.nome || `Dep ${deptId}`).join(', ')}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button 
                        onClick={() => {
                          setTipoUsuario(u.tipo === 'Vendedor' ? 'vendedor' : 'atendente');
                          setSelectedMatricula(u.id);
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
                onClick={() => { setTipoUsuario('atendente'); setSelectedMatricula(null); }}
                className={clsx("flex-1 text-sm py-1.5 rounded-md font-medium transition-colors", tipoUsuario === 'atendente' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
              >
                Atendentes
              </button>
              <button 
                onClick={() => { setTipoUsuario('vendedor'); setSelectedMatricula(null); }}
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
              value={selectedMatricula || ''}
              onChange={(e) => setSelectedMatricula(e.target.value ? Number(e.target.value) : null)}
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
          {selectedMatricula ? (
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

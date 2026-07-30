import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save } from 'lucide-react';

interface Template {
  id: number;
  pagina: string;
  tipo: string;
  template: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  pagina: string;
  onTemplatesChanged: () => void;
}

export function ModalGerenciarTemplates({ isOpen, onClose, pagina, onTemplatesChanged }: ModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ tipo: '', template: '' });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (isOpen) fetchTemplates();
  }, [isOpen, pagina]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates_paginas/${pagina}`);
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdd = async () => {
    try {
      const res = await fetch('/api/templates_paginas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagina, ...editForm })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdding(false);
        setEditForm({ tipo: '', template: '' });
        fetchTemplates();
        onTemplatesChanged();
      } else {
        alert(data.message || data.error || 'Erro ao adicionar template.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de comunicação com o servidor.');
    }
  };

  const handleSaveEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/templates_paginas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingId(null);
        setEditForm({ tipo: '', template: '' });
        fetchTemplates();
        onTemplatesChanged();
      } else {
        alert(data.message || data.error || 'Erro ao atualizar template.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de comunicação com o servidor.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Excluir este template?')) return;
    try {
      const res = await fetch(`/api/templates_paginas/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchTemplates();
        onTemplatesChanged();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (t: Template) => {
    setIsAdding(false);
    setEditingId(t.id);
    setEditForm({ tipo: t.tipo, template: t.template });
  };

  const startAdd = () => {
    setEditingId(null);
    setIsAdding(true);
    setEditForm({ tipo: pagina === 'ROTAS' ? 'PRESENCIAL' : '', template: '' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 rounded-t-xl">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Gerenciar Templates ({pagina})
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure os tipos de mensagens exclusivos para esta tela.
            </p>
            {!isAdding && !editingId && (
              <button 
                onClick={startAdd}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                <Plus size={16} /> Adicionar
              </button>
            )}
          </div>

          {(isAdding || editingId !== null) && (
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-blue-200 dark:border-blue-900/50 mb-6 space-y-4">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {isAdding ? 'Novo Template' : 'Editar Template'}
              </h4>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Tipo</label>
                {pagina === 'ROTAS' ? (
                  <select
                    value={editForm.tipo}
                    onChange={e => setEditForm({ ...editForm, tipo: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="PRESENCIAL">PRESENCIAL</option>
                    <option value="WHATS">WHATS</option>
                    <option value="EMAIL">EMAIL</option>
                    <option value="TELEFONE">TELEFONE</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ex: Lançamentos"
                    value={editForm.tipo}
                    onChange={e => setEditForm({ ...editForm, tipo: e.target.value.toUpperCase() })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensagem Padrão</label>
                <textarea
                  placeholder="Olá, confira as novidades..."
                  value={editForm.template}
                  onChange={e => setEditForm({ ...editForm, template: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={isAdding ? handleSaveAdd : () => handleSaveEdit(editingId!)}
                  disabled={!editForm.tipo || !editForm.template}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  <Save size={16} /> Salvar
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
              Nenhum template cadastrado para esta tela.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div key={t.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex gap-4">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-slate-800 dark:text-white mb-1">{t.tipo}</h5>
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{t.template}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="p-2 text-slate-400 hover:text-blue-500 bg-slate-50 dark:bg-slate-900 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 dark:bg-slate-900 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

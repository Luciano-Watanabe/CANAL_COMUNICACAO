import React, { useState, useEffect } from 'react';
import { Calendar, Save, Check, Truck } from 'lucide-react';

export default function AgendamentoForm({ ticket, onSave }: { ticket: any, onSave: (data: any) => void }) {
    const [dataAgendamento, setDataAgendamento] = useState('');
    const [codprod, setCodprod] = useState('');
    const [qtde, setQtde] = useState('');
    const [motoristaNome, setMotoristaNome] = useState('');
    const [motoristaTel, setMotoristaTel] = useState('');
    const [motoristasList, setMotoristasList] = useState<any[]>([]);
    const [produtosList, setProdutosList] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (ticket) {
            // Se já tiver agendamento salvo, preenche
            if (ticket.dataAgendamento) {
                // Formato YYYY-MM-DD
                setDataAgendamento(ticket.dataAgendamento.split('T')[0]);
            } else {
                setDataAgendamento('');
            }
            setCodprod(ticket.agendamentoCodprod || '');
            setQtde(ticket.agendamentoQtde || '');
            setMotoristaNome(ticket.agendamentoMotoristaNome || '');
            setMotoristaTel(ticket.agendamentoMotoristaTel || '');
            setSaved(false);
        }
    }, [ticket]);

    useEffect(() => {
        fetch('/api/sac/motoristas')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setMotoristasList(data);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (codprod && codprod.length >= 2) {
            const timeout = setTimeout(() => {
                fetch(`/api/sac/produtos?q=${encodeURIComponent(codprod)}`)
                    .then(res => res.json())
                    .then(data => {
                        if (Array.isArray(data)) setProdutosList(data);
                    })
                    .catch(console.error);
            }, 400);
            return () => clearTimeout(timeout);
        } else {
            setProdutosList([]);
        }
    }, [codprod]);

    const handleSelectMotorista = (nome: string, telefone: string) => {
        setMotoristaNome(nome ? nome.toUpperCase() : '');
        setMotoristaTel(telefone);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dataAgendamento || !codprod || !qtde || !motoristaNome || !motoristaTel) {
            alert('Todos os campos do agendamento s\u00e3o obrigat\u00f3rios (Data, Produto, Qtde, Nome e Tel do Motorista).');
            return;
        }

        setSaving(true);
        try {
            const dataToSave = {
                dataAgendamento: `${dataAgendamento} 00:00:00`,
                codprod: codprod ? Number(codprod) : null,
                qtde: qtde ? Number(qtde) : null,
                motoristaNome: motoristaNome || null,
                motoristaTel: motoristaTel || null
            };

            const res = await fetch(`/api/sac/tickets/${ticket.id}/agendamento`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            });

            if (res.ok) {
                setSaved(true);
                onSave(dataToSave);
                setTimeout(() => setSaved(false), 3000);
            } else {
                alert('Erro ao salvar agendamento');
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro de comunicação');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="bg-slate-50 dark:bg-slate-800/80 p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-blue-500" />
                Agendar Retirada (Troca/Devolução)
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Data</label>
                    <input 
                        type="date" 
                        value={dataAgendamento} 
                        onChange={e => setDataAgendamento(e.target.value)}
                        required
                        className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Produto (Cód ou Nome)</label>
                    <input 
                        type="text" 
                        value={codprod} 
                        onChange={e => setCodprod(e.target.value)}
                        list="produtos_list"
                        placeholder="Ex: 12345 ou Pneu"
                        required
                        className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500"
                    />
                    <datalist id="produtos_list">
                        {produtosList.map((p, i) => (
                            <option key={i} value={p.codprod}>
                                {p.descricao}
                            </option>
                        ))}
                    </datalist>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Qtde</label>
                    <input 
                        type="number" 
                        value={qtde} 
                        onChange={e => setQtde(e.target.value)}
                        placeholder="Ex: 1"
                        required
                        className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Motorista</label>
                    <input 
                        type="text" 
                        value={motoristaNome} 
                        onChange={e => setMotoristaNome(e.target.value.toUpperCase())}
                        list="motoristas_list"
                        placeholder="Nome"
                        required
                        className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500"
                    />
                    <datalist id="motoristas_list">
                        {motoristasList.map((m, i) => (
                            <option key={i} value={m.nome} />
                        ))}
                    </datalist>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Tel Motorista</label>
                    <input 
                        type="text" 
                        value={motoristaTel} 
                        onChange={e => setMotoristaTel(e.target.value)}
                        placeholder="Ex: 5511999999999"
                        required
                        className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>
            
            <div className="flex justify-end mt-3 gap-2">
                {motoristasList.length > 0 && motoristaNome === '' && (
                    <div className="flex gap-1 flex-wrap flex-1 items-center">
                        <span className="text-[10px] text-slate-400">Sugestões:</span>
                        {motoristasList.slice(0, 3).map((m, i) => (
                            <button 
                                type="button" 
                                key={i} 
                                onClick={() => handleSelectMotorista(m.nome, m.telefone)}
                                className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-1"
                            >
                                <Truck size={10} /> {m.nome}
                            </button>
                        ))}
                    </div>
                )}
                <button 
                    type="submit" 
                    disabled={saving}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50"
                >
                    {saved ? <Check size={14} /> : <Save size={14} />}
                    {saved ? 'Salvo' : 'Salvar Agendamento'}
                </button>
            </div>
        </form>
    );
}

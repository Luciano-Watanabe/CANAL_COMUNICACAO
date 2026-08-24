import React, { useState, useMemo } from 'react';
import { X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Truck, Printer } from 'lucide-react';
import clsx from 'clsx';

export default function CalendarioSACModal({ isOpen, onClose, tickets }: { isOpen: boolean, onClose: () => void, tickets: any[] }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [printData, setPrintData] = useState<{ dateStr: string, tickets: any[] } | null>(null);

    const scheduledTickets = useMemo(() => {
        return tickets.filter(t => t.dataAgendamento != null);
    }, [tickets]);

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

    if (!isOpen) return null;

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(<div key={`empty-${i}`} className="p-2 border border-slate-100 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-900/30" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTickets = scheduledTickets.filter(t => t.dataAgendamento && t.dataAgendamento.startsWith(dateStr));
        
        days.push(
            <div key={day} className="p-1 border border-slate-100 dark:border-slate-800/50 min-h-[70px] flex flex-col hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{day}</span>
                    {dayTickets.length > 0 && (
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                setPrintData({ dateStr, tickets: dayTickets }); 
                                setTimeout(() => window.print(), 100); 
                            }}
                            className="text-slate-400 hover:text-blue-500 print:hidden"
                            title="Imprimir Agenda do Dia"
                        >
                            <Printer size={14} />
                        </button>
                    )}
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                    {dayTickets.map(t => (
                        <div key={t.id} className="text-[10px] p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800/50 cursor-pointer" title={`Ticket #${t.id} - ${t.nomeCliente}`}>
                            <div className="font-bold">#{t.id}</div>
                            <div className="truncate">{t.nomeCliente || t.telefone}</div>
                            {t.agendamentoMotoristaNome && (
                                <div className="truncate text-blue-500 flex items-center gap-1 mt-0.5">
                                    <Truck size={10}/> {t.agendamentoMotoristaNome}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[80vh]">
                    <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <CalendarIcon className="text-blue-500" /> Calendário de Retiradas
                        </h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="p-4 flex-1 flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 capitalize">
                                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={prevMonth} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                                    <ChevronLeft size={20} />
                                </button>
                                <button onClick={nextMonth} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex-1">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                                <div key={d} className="bg-slate-50 dark:bg-slate-800 p-2 text-center text-xs font-semibold text-slate-500 uppercase">
                                    {d}
                                </div>
                            ))}
                            <div className="col-span-7 grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 overflow-y-auto" style={{ gridAutoRows: 'minmax(70px, auto)' }}>
                               {days.map((day, idx) => React.cloneElement(day as React.ReactElement<any>, { key: `day-${idx}`, className: clsx((day as React.ReactElement<any>).props.className, "bg-white dark:bg-slate-900") }))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {printData && (
                <div className="hidden print:block print:bg-white print:text-black">
                    <style>{`
                        @media print {
                            body * { visibility: hidden; }
                            .print-container, .print-container * { visibility: visible; }
                            .print-container { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
                            @page { size: A4; margin: 15mm; }
                        }
                    `}</style>
                    <div className="print-container">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h1 className="text-2xl font-bold text-gray-800">Agenda de Retiradas</h1>
                            <span className="text-lg font-semibold text-gray-600">
                                Data: {printData.dateStr.split('-').reverse().join('/')}
                            </span>
                        </div>
                        
                        <table className="w-full border-collapse border border-gray-300 text-sm text-left">
                            <thead>
                                <tr className="bg-gray-100 text-gray-700 uppercase text-xs">
                                    <th className="border border-gray-300 p-2 w-16">Ticket</th>
                                    <th className="border border-gray-300 p-2 w-48">Cliente</th>
                                    <th className="border border-gray-300 p-2 w-32">Motorista</th>
                                    <th className="border border-gray-300 p-2">Produto</th>
                                    <th className="border border-gray-300 p-2 text-center w-12">Qtde</th>
                                    <th className="border border-gray-300 p-2 text-center w-24">Visto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.tickets.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-50">
                                        <td className="border border-gray-300 p-2 font-semibold">#{t.id}</td>
                                        <td className="border border-gray-300 p-2 min-w-[200px]">
                                            <div className="font-bold break-words whitespace-normal">{t.nomeCliente || 'S/N'}</div>
                                            <div className="text-gray-500 text-xs">{t.telefone}</div>
                                        </td>
                                        <td className="border border-gray-300 p-2">{t.agendamentoMotoristaNome || '-'}</td>
                                        <td className="border border-gray-300 p-2 min-w-[250px]">
                                            <div className="flex items-start gap-2">
                                                {t.agendamentoCodprod && (
                                                    <img src={`/api/produtos/imagem/${t.agendamentoCodprod}`} alt="" className="w-12 h-12 object-contain rounded bg-white border shrink-0 mt-1" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                                )}
                                                <div className="flex-1">
                                                    <div className="font-bold">{t.agendamentoCodprod || '-'}</div>
                                                    <div className="text-xs text-gray-700 break-words whitespace-normal">{t.agendamentoProdutoNome || ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 p-2 text-center font-bold">{t.agendamentoQtde || '-'}</td>
                                        <td className="border border-gray-300 p-2"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        
                        <div className="mt-8 text-xs text-gray-500 text-center">
                            Documento gerado automaticamente pelo Sistema WMS-SaaS - SAC
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

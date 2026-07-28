import { Trophy, Medal, MessageSquare, ShoppingCart, DollarSign } from 'lucide-react';
import clsx from 'clsx';
import { usePrivacy } from '../contexts/PrivacyContext';

export const TeamRanking = ({ ranking }: { ranking: any[] }) => {
  const { maskData } = usePrivacy();
  if (!ranking || ranking.length === 0) {
    return <div className="text-sm text-slate-400 flex items-center justify-center h-40">Nenhum dado de ranking disponível.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {ranking.map((vendedor, index) => {
        const isFirst = index === 0;
        const isSecond = index === 1;
        const isThird = index === 2;

        const maxChatMedio = Math.max(...ranking.map(r => r.chatMedio || 0));
        const progressWidth = maxChatMedio > 0 ? ((vendedor.chatMedio || 0) / maxChatMedio) * 100 : 0;

        return (
          <div key={vendedor.id} className={clsx(
            "flex flex-col gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02]",
            isFirst ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50" :
            isSecond ? "bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-600" :
            isThird ? "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/50" :
            "bg-white border-transparent shadow-sm dark:bg-slate-900 dark:border-slate-800"
          )}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 shrink-0 flex items-center justify-center font-bold text-xl rounded-full bg-white dark:bg-slate-800 shadow-sm relative">
                {isFirst && <Trophy size={20} className="text-amber-500 absolute -top-2 -right-2" />}
                {isSecond && <Medal size={20} className="text-slate-400 absolute -top-2 -right-2" />}
                {isThird && <Medal size={20} className="text-orange-500 absolute -top-2 -right-2" />}
                <span className={clsx(
                  "text-base",
                  isFirst ? "text-amber-500" :
                  isSecond ? "text-slate-500" :
                  isThird ? "text-orange-500" :
                  "text-slate-400"
                )}>
                  {index + 1}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className={clsx(
                  "font-bold truncate text-base",
                  isFirst ? "text-amber-900 dark:text-amber-100" :
                  "text-slate-800 dark:text-slate-200"
                )}>
                  {maskData(vendedor.nome)}
                </h4>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Vendedor</p>
              </div>
            </div>

            {/* Métricas Lado a Lado */}
            <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                  <MessageSquare size={12} /> Chats
                </span>
                <span className={clsx("font-black text-lg", isFirst ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300")}>
                  {vendedor.atendimentos || 0}
                </span>
              </div>
              
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                  <ShoppingCart size={12} /> Pedidos
                </span>
                <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                  {vendedor.pedidos || 0}
                </span>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                  <DollarSign size={12} /> Faturado
                </span>
                <span className="font-black text-lg text-primary-600 dark:text-primary-400">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(vendedor.vltotal || 0)}
                </span>
              </div>
            </div>

            {/* Barra de Chat Médio */}
            <div className="mt-1">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Chat/Ticket Médio</span>
                <span className="font-bold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(vendedor.chatMedio || 0)}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                <div 
                  className={clsx("h-1.5 rounded-full transition-all duration-500", 
                    progressWidth > 80 ? "bg-emerald-500" : 
                    progressWidth > 40 ? "bg-amber-500" : "bg-red-500"
                  )} 
                  style={{ width: `${Math.min(progressWidth, 100)}%` }}
                ></div>
              </div>
            </div>
            
          </div>
        );
      })}
    </div>
  );
};

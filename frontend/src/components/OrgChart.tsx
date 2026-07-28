
import { Users, User, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { usePrivacy } from '../contexts/PrivacyContext';

const TreeNode = ({ node }: { node: any }) => {
  const { maskData } = usePrivacy();
  const isGerente = node.role === 'Gerente';
  const isSupervisor = node.role === 'Supervisor';
  
  return (
    <div className="flex flex-col items-center">
      <div className={clsx(
        "relative flex flex-col items-center p-3 rounded-xl border min-w-[140px] shadow-sm z-10 transition-transform hover:-translate-y-1",
        isGerente ? "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/50" : 
        isSupervisor ? "bg-primary-50 border-primary-200 dark:bg-primary-900/30 dark:border-primary-700/50" : 
        "bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700"
      )}>
        <div className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center mb-2 shadow-sm text-white",
          isGerente ? "bg-amber-500" : isSupervisor ? "bg-primary-500" : "bg-emerald-500"
        )}>
          {isGerente ? <ShieldAlert size={14} /> : isSupervisor ? <Users size={14} /> : <User size={14} />}
        </div>
        
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 text-center truncate w-full max-w-[120px]" title={node.nome}>
          {maskData(node.nome)}
        </h4>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">{node.role}</p>
        
        {(!isGerente && !isSupervisor) && (
          <div className="flex gap-2 text-[10px] bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md">
            <span className="text-slate-600 dark:text-slate-400 font-medium">{node.clientes || 0} CLI</span>
            <span className="text-primary-600 dark:text-primary-400 font-bold">{node.atendimentos || 0} CHATS</span>
          </div>
        )}
      </div>

      {node.filhos && node.filhos.length > 0 && (
        <div className="relative flex flex-col items-center mt-6">
          {/* Linha vertical descendo do pai */}
          <div className="absolute top-[-24px] w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
          
          {/* Linha horizontal conectando os filhos */}
          {node.filhos.length > 1 && (
            <div className="absolute top-0 h-px bg-slate-300 dark:bg-slate-700" 
              style={{
                width: `calc(100% - ${100 / node.filhos.length}%)`
              }}
            ></div>
          )}

          <div className="flex justify-center gap-4 relative pt-4">
            {node.filhos.map((filho: any) => (
              <div key={filho.id} className="relative flex flex-col items-center">
                {/* Linha vertical subindo de cada filho */}
                <div className="absolute top-[-16px] w-px h-4 bg-slate-300 dark:bg-slate-700"></div>
                <TreeNode node={filho} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const OrgChart = ({ data }: { data: any }) => {
  if (!data) return <div className="text-sm text-slate-400 flex items-center justify-center h-40">Nenhuma hierarquia disponível.</div>;

  return (
    <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
      <div className="min-w-max p-4 flex justify-center">
        <TreeNode node={data} />
      </div>
    </div>
  );
};

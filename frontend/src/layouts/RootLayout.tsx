import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import clsx from 'clsx';
import { LayoutDashboard, Users, MessageSquare, Settings, Menu, X, Sun, Moon, LogOut, ChevronLeft, ChevronRight, ImagePlus, Contact, Calendar, Building } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

const Sidebar = ({ isOpen, setIsOpen, isCollapsed, setIsCollapsed }: any) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const { maskData } = usePrivacy();
  const userName = maskData(user?.nome || 'Usuário');
  const userInitials = userName.substring(0, 2).toUpperCase();
  const userRole = user?.role ? user.role.toUpperCase() : 'VENDEDOR';
  const userCode = user?.matricula || '';

  const links = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Carteira de Clientes', path: '/clientes', icon: Users },
    { name: 'Chat (Atendimento)', path: '/chat', icon: MessageSquare },
  ];

  if (userRole === 'GERENTE') {
    links.push({ name: 'Configurações', path: '/configuracoes', icon: Settings });
  }
  
  if (userRole === 'GERENTE' || userRole === 'SUPERVISOR') {
    links.push({ name: 'Campanhas (Status)', path: '/campanhas', icon: ImagePlus });
    links.push({ name: 'Rotas de Visitas', path: '/rotas', icon: Calendar });
    links.push({ name: 'Clientes Inativos', path: '/inativos', icon: Users });
    links.push({ name: 'Análise de CNPJ', path: '/analisecnpj', icon: Building });
  }

  if (userRole === 'BOT_GESTOR') {
    links.push({ name: 'Gestão de Vendedores', path: '/vendedores', icon: Contact });
    links.push({ name: 'Automação de Mensagens', path: '/mensagens', icon: MessageSquare });
    links.push({ name: 'Agendamentos de vendedores', path: '/visitas', icon: Users });
    links.push({ name: 'Clientes Inativos', path: '/inativos', icon: Users });
    links.push({ name: 'Rotas de Visitas', path: '/rotas', icon: Calendar });
    links.push({ name: 'Análise de CNPJ', path: '/analisecnpj', icon: Building });
    links.push({ name: 'Análise de I.E.', path: '/analise-ie', icon: Building });
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar sidebar-bg */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] transition-all duration-300 ease-in-out flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "w-20" : "w-72"
      )}>
        <div className="flex items-center justify-between h-20 px-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary-500/30">
              CC
            </div>
            {!isCollapsed && (
              <h1 className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 dark:from-white dark:to-slate-400 whitespace-nowrap animate-fade-in">
                Canal de Com.
              </h1>
            )}
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute -right-3 top-24 w-6 h-6 bg-white dark:bg-slate-800 border border-[var(--border-color)] rounded-full items-center justify-center text-slate-500 hover:text-primary-500 transition-colors z-50 cursor-pointer shadow-sm"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto overflow-x-hidden">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
            return (
              <NavLink
                key={link.path}
                to={link.path}
                title={isCollapsed ? link.name : undefined}
                className={clsx(
                  "flex items-center gap-3 px-3 py-3.5 rounded-xl font-medium transition-all duration-200 group relative",
                  isActive 
                    ? "bg-primary-500/10 text-primary-600 dark:text-primary-400" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white",
                  isCollapsed ? "justify-center" : "px-4"
                )}
              >
                <Icon size={22} className={clsx("transition-transform duration-200 flex-shrink-0", isActive ? "scale-110" : "group-hover:scale-110")} />
                {!isCollapsed && <span className="whitespace-nowrap animate-fade-in">{link.name}</span>}
              </NavLink>
            );
          })}
        </nav>
        
        <div className="p-3 border-t border-[var(--border-color)]">
          <div className={clsx("flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 group relative", isCollapsed ? "justify-center" : "")}>
            <div className="w-10 h-10 flex-shrink-0 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
              {userInitials}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0 animate-fade-in">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{userName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userRole} - {userCode}</p>
              </div>
            )}
            <button 
              onClick={handleLogout}
              title="Sair"
              className={clsx("text-slate-400 hover:text-rose-500 transition-colors p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10", isCollapsed ? "absolute -top-12 bg-white dark:bg-slate-800 shadow-sm border border-[var(--border-color)]" : "")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default function RootLayout() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { socket } = useSocket();
  const { maskData } = usePrivacy();
  const [alertasSupervisor, setAlertasSupervisor] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (!socket) return;
    
    const handleSupervisorSolicitado = (data: any) => {
      setAlertasSupervisor(prev => [...prev, data]);
    };

    socket.on('supervisor_solicitado', handleSupervisorSolicitado);
    return () => {
      socket.off('supervisor_solicitado', handleSupervisorSolicitado);
    };
  }, [socket]);

  const dispensarAlerta = (index: number) => {
    setAlertasSupervisor(prev => prev.filter((_, i) => i !== index));
  };

  const atenderAlerta = (index: number, vendedor: string, cliente: string) => {
    dispensarAlerta(index);
    navigate(`/chat?vendedor=${vendedor}&cliente=${cliente}`);
  };

  return (
    <div className="min-h-screen">
      {/* Alertas de Supervisor */}
      <div className="fixed top-24 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
        {alertasSupervisor.map((alerta, index) => (
          <div key={index} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-amber-500 overflow-hidden animate-slide-up">
            <div className="bg-amber-500 px-4 py-2 flex items-center justify-between">
              <h4 className="text-white font-bold text-sm">Pedido de Ajuda</h4>
              <button onClick={() => dispensarAlerta(index)} className="text-white/80 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-slate-700 dark:text-slate-300 text-sm mb-3">
                O vendedor <strong>{maskData(alerta.vendedor)}</strong> precisa de ajuda com o cliente <strong>{maskData(alerta.cliente)}</strong>.
              </p>
              {alerta.motivo && (
                <p className="text-slate-600 dark:text-slate-400 text-xs italic bg-slate-100 dark:bg-slate-900 p-2 rounded-lg mb-3">
                  "{alerta.motivo}"
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => dispensarAlerta(index)} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  Dispensar
                </button>
                <button onClick={() => atenderAlerta(index, alerta.vendedor, alerta.cliente)} className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors">
                  Atender Agora
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Sidebar 
        isOpen={isOpen} 
        setIsOpen={setIsOpen} 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed} 
      />
      
      <main className={clsx(
        "transition-all duration-300 min-h-screen flex flex-col",
        isCollapsed ? "lg:pl-20" : "lg:pl-72"
      )}>
        {/* Header mobile/desktop info */}
        <header className="h-20 glass sticky top-0 z-30 flex items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-xl font-semibold capitalize text-slate-800 dark:text-white hidden sm:block">
              Visão Geral
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:scale-105 transition-transform"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>
        
        <div className="flex-1 p-6 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

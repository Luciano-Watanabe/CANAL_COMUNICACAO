import { useState, useEffect } from 'react';
import { Search, MapPin, Building2, Phone, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface Ramo {
  codatv: string;
  ramo: string;
}

interface Cidade {
  codcidade: string;
  nome: string;
  ibge: string;
}

interface Lead {
  id?: string;
  nome_fantasia: string;
  razao_social: string;
  cnpj: string | null;
  telefone: string | null;
  endereco: string;
  cidade: string;
  origem: string;
  has_whatsapp?: string;
}

export default function Prospeccao() {
  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [cidadesList, setCidadesList] = useState<Cidade[]>([]);
  const [loadingCategorias, setLoadingCategorias] = useState(true);
  
  const [cidadeSelecionada, setCidadeSelecionada] = useState('');
  const [ramoSelecionado, setRamoSelecionado] = useState('');
  const [provedor, setProvedor] = useState('AUTO');
  
  const [isSearching, setIsSearching] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [providerUsed, setProviderUsed] = useState('');

  // Carrega as categorias do backend
  useEffect(() => {
    const fetchDados = async () => {
      try {
        const [resCategorias, resCidades] = await Promise.all([
          fetch('/api/prospeccao/categorias'),
          fetch('/api/prospeccao/cidades')
        ]);
        
        const dataCat = await resCategorias.json();
        const dataCid = await resCidades.json();

        if (dataCat.success) setRamos(dataCat.ramos);
        if (dataCid.success) setCidadesList(dataCid.cidades);
      } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
      } finally {
        setLoadingCategorias(false);
      }
    };
    fetchDados();
  }, []);

  const buscarLeads = async () => {
    if (!cidadeSelecionada || !ramoSelecionado) {
      alert('Preencha a cidade e o ramo de atividade.');
      return;
    }

    const cidadeObj = cidadesList.find(c => c.nome === cidadeSelecionada);
    const codibge = cidadeObj ? cidadeObj.ibge : null;
    
    setIsSearching(true);
    setMensagem('');
    try {
      const res = await fetch('/api/prospeccao/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codatv: ramoSelecionado, cidade: cidadeSelecionada, codibge, provedor })
      });
      const data = await res.json();
      
      if (data.success) {
        setLeads(data.leads);
        setProviderUsed(data.providerUsed);
        setMensagem(data.message);
      } else {
        setMensagem('Erro: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      setMensagem('Erro de conexão com o servidor.');
    } finally {
      setIsSearching(false);
    }
  };

  const verificarWhatsapp = async (lead: Lead, index: number) => {
    if (!lead.telefone) return;
    
    try {
      // Usar a rota /salvos pra pegar o ID gerado (na versão atual é inserido lá dentro e não retorna ID na busca direto, 
      // mas vamos simular um check visual sem ID ou adaptar)
      const res = await fetch('/api/prospeccao/verificar-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: lead.telefone, id: lead.id || 'TEMP' })
      });
      const data = await res.json();
      
      if (data.success) {
        const novosLeads = [...leads];
        novosLeads[index].has_whatsapp = data.has_whatsapp;
        setLeads(novosLeads);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Search className="text-primary-500" />
          Radar de Leads (Prospecção)
        </h1>
        <p className="text-slate-500 text-sm mt-1">Busque novas empresas do mesmo ramo que os seus clientes e que ainda não estão cadastradas.</p>
      </div>

      <div className="glass-card p-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Cidade
            </label>
            <div className="relative">
              <MapPin size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <select
                value={cidadeSelecionada}
                onChange={(e) => setCidadeSelecionada(e.target.value)}
                disabled={loadingCategorias}
                className="w-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary-500 appearance-none"
              >
                <option value="">Selecione a Cidade...</option>
                {cidadesList.map((c, idx) => (
                  <option key={idx} value={c.nome}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ramo de Atividade
            </label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <select
                value={ramoSelecionado}
                onChange={(e) => setRamoSelecionado(e.target.value)}
                disabled={loadingCategorias}
                className="w-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary-500 appearance-none"
              >
                <option value="">Selecione o Ramo...</option>
                {ramos.map(r => (
                  <option key={r.codatv} value={r.codatv}>{r.ramo}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Fonte de Dados
            </label>
            <select
              value={provedor}
              onChange={(e) => setProvedor(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500 appearance-none"
            >
              <option value="AUTO">Automático (Priorizar CNPJA)</option>
              <option value="CNPJ_TRANSPARENCIA">CNPJ Transparência (Gratuito c/ CNPJ)</option>
              <option value="CNPJA">CNPJA API (Requer Token)</option>
              <option value="GEOAPIFY">Geoapify Maps (Sem CNPJ)</option>
            </select>
          </div>

          <div className="md:col-span-1">
            <button
              onClick={buscarLeads}
              disabled={isSearching}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              {isSearching ? 'Buscando...' : 'Encontrar Leads'}
            </button>
          </div>
        </div>

        {mensagem && (
          <div className={clsx(
            "mt-4 p-4 rounded-lg flex items-center gap-3 text-sm",
            leads.length > 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          )}>
            {leads.length > 0 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <div>
              <p className="font-medium">{mensagem}</p>
              {providerUsed && <p className="text-xs mt-0.5 opacity-80">Fonte utilizada: {providerUsed}</p>}
            </div>
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
            <h3 className="font-bold text-slate-800 dark:text-white">Leads Encontrados (Filtrados sem duplicação)</h3>
            <span className="text-xs font-semibold px-2.5 py-1 bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 rounded-full">
              {leads.length} prospect(s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-4 px-5 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Empresa</th>
                  <th className="py-4 px-5 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Contato / Endereço</th>
                  <th className="py-4 px-5 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Origem</th>
                  <th className="py-4 px-5 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800/50">
                {leads.map((lead, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="py-4 px-5 align-top">
                      <div className="font-bold text-slate-800 dark:text-white text-sm">{lead.nome_fantasia}</div>
                      {lead.cnpj && <div className="text-xs text-slate-500 font-mono mt-1">CNPJ: {lead.cnpj}</div>}
                    </td>
                    <td className="py-4 px-5 align-top">
                      <div className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2 mb-1">
                        <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{lead.endereco}</span>
                      </div>
                      {lead.telefone && (
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Phone size={14} className="text-slate-400" />
                          {lead.telefone}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-5 align-top">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                        {lead.origem}
                      </span>
                    </td>
                    <td className="py-4 px-5 align-top text-right">
                      {lead.telefone ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => verificarWhatsapp(lead, idx)}
                            className={clsx(
                              "text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors",
                              lead.has_whatsapp === 'S' 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400"
                                : lead.has_whatsapp === 'N'
                                ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                            )}
                          >
                            {lead.has_whatsapp === 'S' ? <CheckCircle2 size={14} /> : lead.has_whatsapp === 'N' ? <XCircle size={14} /> : <Phone size={14} />}
                            {lead.has_whatsapp === 'S' ? 'Tem WhatsApp' : lead.has_whatsapp === 'N' ? 'Sem WhatsApp' : 'Testar WhatsApp'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sem telefone</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

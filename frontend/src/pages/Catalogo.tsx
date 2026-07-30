import React, { useState, useEffect, useMemo } from 'react';
import { Download, Filter, Eye, EyeOff, Send } from 'lucide-react';
import ModalWhatsAppCatalogo from '../components/ModalWhatsAppCatalogo';

interface Produto {
  codprod: number;
  descricao: string;
  codepto: number;
  departamento: string;
  preco: number;
  ean: string;
  qtunit: number;
  unidade: string;
}

interface Atividade {
  codatv: number;
  ramo: string;
}

export default function Catalogo() {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [codatvSelecionado, setCodatvSelecionado] = useState<string>('');
  const [mostrarPrecos, setMostrarPrecos] = useState(true);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    // Buscar vendedores
    fetch('/api/vendedores')
      .then(r => r.json())
      .then(data => {
        if (data.success) setVendedores(data.vendedores || []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/catalogo/atividades')
      .then(r => r.json())
      .then(data => {
        if (data.success) setAtividades(data.atividades);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = codatvSelecionado 
      ? `/api/catalogo/produtos?codatv1=${codatvSelecionado}` 
      : `/api/catalogo/produtos`;
      
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.success) setProdutos(data.produtos);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [codatvSelecionado]);

  const produtosPorDepartamento = useMemo(() => {
    const agrupado: Record<string, Produto[]> = {};
    produtos.forEach(p => {
      const dep = p.departamento || 'OUTROS';
      if (!agrupado[dep]) agrupado[dep] = [];
      agrupado[dep].push(p);
    });
    return agrupado;
  }, [produtos]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 -m-6 lg:-m-10 p-6 lg:p-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Catálogo de Produtos</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gere catálogos personalizados para seus clientes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 shadow-sm">
            <Filter size={18} className="text-slate-400 mr-2" />
            <select
              className="bg-transparent border-none text-sm text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer outline-none w-48"
              value={codatvSelecionado}
              onChange={(e) => setCodatvSelecionado(e.target.value)}
            >
              <option value="">Todos os Produtos (Geral)</option>
              {atividades.map(a => (
                <option key={a.codatv} value={a.codatv}>
                  {a.ramo}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setMostrarPrecos(!mostrarPrecos)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {mostrarPrecos ? <Eye size={18} /> : <EyeOff size={18} />}
            <span className="text-sm font-medium">{mostrarPrecos ? 'Ocultar Preços' : 'Mostrar Preços'}</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl shadow-lg shadow-green-500/30 transition-colors"
          >
            <Send size={18} />
            <span className="text-sm font-medium">Enviar Whats</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-lg shadow-primary-500/30 transition-colors"
          >
            <Download size={18} />
            <span className="text-sm font-medium">Exportar PDF</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center print:hidden">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="catalog-print-container space-y-12 bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm print:shadow-none print:p-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 pb-6">
            <div className="flex flex-col items-center justify-center gap-4">
              <img src="/logo-ag.png" alt="Logo" className="h-20 object-contain" />
              <div>
                <h1 className="text-4xl font-bold text-slate-900">Catálogo de Produtos</h1>
                {codatvSelecionado && (
                  <p className="text-lg text-slate-500 mt-2">
                    Categoria: {atividades.find(a => String(a.codatv) === String(codatvSelecionado))?.ramo}
                  </p>
                )}
              </div>
            </div>
          </div>

          {Object.entries(produtosPorDepartamento).map(([dep, prods]) => (
            <div key={dep} className="print:break-inside-avoid" style={{ breakInside: 'avoid' }}>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                <span className="w-2 h-8 bg-primary-500 rounded-full print:bg-slate-800"></span>
                {dep}
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 print:grid-cols-5">
                {prods.map(p => (
                  <div key={p.codprod} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700/50 flex flex-col print:border-slate-300 print:bg-white print:break-inside-avoid" style={{ breakInside: 'avoid' }}>
                    <div className="aspect-square bg-white rounded-lg mb-4 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-700 print:border-slate-200">
                      <img 
                        src={`/api/produtos/imagem/${p.codprod}`} 
                        alt={p.descricao}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjYmQ1ZTEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjkuNSIgY3k9IjkuNSIgcj0iMS41Ii8+PHBhdGggZD0ibTIxIDE1LTQuNTEtNC41MWEyLjIgMi4yIDAgMCAwLTMuMSAzLjFsNS44MyA1LjgzeiIvPjwvc3ZnPg==';
                          target.className = 'w-1/2 h-1/2 opacity-50';
                        }}
                      />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs font-mono text-slate-400 dark:text-slate-500 mb-1">Cód: {p.codprod} {p.ean && `| EAN: ${p.ean}`}</span>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight flex-1">
                        {p.descricao}
                      </h4>
                      {mostrarPrecos && (
                        <div className="mt-3 flex items-end justify-between">
                          <span className="text-lg font-bold text-primary-600 dark:text-primary-400 print:text-slate-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">/ {p.unidade}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {Object.keys(produtosPorDepartamento).length === 0 && (
            <div className="text-center py-20 text-slate-500">
              Nenhum produto encontrado para este filtro.
            </div>
          )}
        </div>
      )}

      <ModalWhatsAppCatalogo
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vendedores={vendedores}
        atividades={atividades}
        ramoSelecionado={codatvSelecionado}
        codusurLogged={user?.matricula}
        onSend={async (formData) => {
          const res = await fetch('/api/catalogo/send-whatsapp', {
            method: 'POST',
            body: formData
          });
          const result = await res.json();
          if (!result.success) throw new Error(result.error || 'Erro desconhecido');
          alert('Catálogo enviado com sucesso!');
        }}
      />
    </div>
  );
}

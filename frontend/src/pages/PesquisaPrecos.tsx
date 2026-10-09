import { useState, useEffect } from 'react';
import { 
  Search, Filter, Calendar, MapPin, Package, Barcode, Image as ImageIcon, 
  Trash2, Link2, RefreshCw, ChevronDown, CheckCircle2, X, Store, AlertCircle 
} from 'lucide-react';

export default function PesquisaPrecos() {
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados Modal Vincular
  const [modalVincular, setModalVincular] = useState(false);
  const [vincularEan, setVincularEan] = useState('');
  const [vincularCodprod, setVincularCodprod] = useState('');
  const [vincularCodconcor, setVincularCodconcor] = useState('');
  const [vincularId, setVincularId] = useState<number | null>(null);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [concorrentes, setConcorrentes] = useState<any[]>([]);
  const [loadingConcorrentes, setLoadingConcorrentes] = useState(false);

  // Busca de Produtos no WinThor dentro do Modal
  const [buscaProdutoTexto, setBuscaProdutoTexto] = useState('');
  const [produtosEncontrados, setProdutosEncontrados] = useState<any[]>([]);
  const [buscandoProdutos, setBuscandoProdutos] = useState(false);
  const [produtoSelecionadoInfo, setProdutoSelecionadoInfo] = useState<any | null>(null);

  // Filtros
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [local, setLocal] = useState('');
  const [produto, setProduto] = useState('');
  const [ean, setEan] = useState('');

  const fetchDados = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (dataInicio) query.append('dataInicio', dataInicio);
      if (dataFim) query.append('dataFim', dataFim);
      if (local) query.append('local', local);
      if (produto) query.append('produto', produto);
      if (ean) query.append('ean', ean);

      const response = await fetch(`/api/pesquisa?${query.toString()}`);
      const result = await response.json();
      if (result.success) {
        setDados(result.dados);
      }
    } catch (err) {
      console.error('Erro ao buscar pesquisas:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConcorrentes = async () => {
    setLoadingConcorrentes(true);
    try {
      const res = await fetch('/api/pesquisa/concorrentes');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.concorrentes)) {
        setConcorrentes(data.concorrentes);
      }
    } catch (err) {
      console.error('Erro ao carregar concorrentes da PCCONCOR:', err);
    } finally {
      setLoadingConcorrentes(false);
    }
  };

  useEffect(() => {
    // Buscar lista de concorrentes do WinThor
    fetchConcorrentes();
  }, []);

  useEffect(() => {
    // Buscar últimos 7 dias por padrão
    const hoje = new Date();
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(hoje.getDate() - 7);
    
    const dInicio = seteDiasAtras.toISOString().split('T')[0];
    const dFim = hoje.toISOString().split('T')[0];
    
    setDataInicio(dInicio);
    setDataFim(dFim);
  }, []);

  // Fetch after initial dates are set
  useEffect(() => {
    if (dataInicio && dataFim) {
      fetchDados();
    }
  }, [dataInicio, dataFim]);

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir este registro de pesquisa?')) return;
    
    try {
      const response = await fetch(`/api/pesquisa/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setDados(prev => prev.filter(d => d.ID !== id));
      }
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  };

  const handleBuscarProdutos = async (termo: string) => {
    setBuscaProdutoTexto(termo);
    if (!termo || termo.trim().length < 2) {
      setProdutosEncontrados([]);
      return;
    }
    setBuscandoProdutos(true);
    try {
      const res = await fetch(`/api/pesquisa/produtos-busca?termo=${encodeURIComponent(termo.trim())}`);
      const data = await res.json();
      if (data.success && data.produtos) {
        setProdutosEncontrados(data.produtos);
      }
    } catch (err) {
      console.error('Erro ao buscar produtos:', err);
    } finally {
      setBuscandoProdutos(false);
    }
  };

  const handleSelecionarProduto = (prod: any) => {
    setVincularCodprod(String(prod.CODPROD));
    if (prod.EAN) {
      setVincularEan(String(prod.EAN));
    }
    setProdutoSelecionadoInfo(prod);
    setProdutosEncontrados([]);
  };

  const handleOpenVincular = (item: any) => {
    setVincularId(item.ID);
    setVincularEan(item.EAN || '');
    setVincularCodprod(item.CODPROD ? String(item.CODPROD) : '');

    // Auto-detectar concorrente pelo CODCONCOR ou tentar aproximar pelo LOCAL
    let codconcInicial = item.CODCONCOR ? String(item.CODCONCOR) : '';
    if (!codconcInicial && item.LOCAL && concorrentes.length > 0) {
      const match = concorrentes.find((c: any) => {
        const cNome = (c.CONCORRENTE || c.nome || '').toUpperCase();
        const lNome = (item.LOCAL || '').toUpperCase();
        return cNome.includes(lNome) || lNome.includes(cNome);
      });
      if (match) {
        codconcInicial = String(match.CODCONCOR || match.codconcor);
      }
    }
    setVincularCodconcor(codconcInicial);

    setBuscaProdutoTexto(item.PRODUTO_NOME || '');
    setProdutosEncontrados([]);
    setProdutoSelecionadoInfo(item.CODPROD ? { CODPROD: item.CODPROD, DESCRICAO: item.PRODUTO_NOME } : null);
    setModalVincular(true);
    fetchConcorrentes();

    if (item.CODPROD) {
      handleBuscarProdutos(String(item.CODPROD));
    } else if (item.PRODUTO_NOME && item.PRODUTO_NOME.length >= 3) {
      handleBuscarProdutos(item.PRODUTO_NOME);
    }
  };

  const handleVincular = async () => {
    if (!vincularEan && !vincularCodprod && !vincularCodconcor) {
      alert('Informe ao menos o EAN, Cód. Produto ou Concorrente');
      return;
    }
    setSalvandoVinculo(true);
    try {
      const selectedConc = concorrentes.find(c => String(c.CODCONCOR || c.codconcor) === String(vincularCodconcor));
      const concNome = selectedConc ? (selectedConc.CONCORRENTE || selectedConc.nome) : undefined;

      const response = await fetch(`/api/pesquisa/${vincularId}/vincular`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ean: vincularEan, 
          codprod: vincularCodprod,
          codconcor: vincularCodconcor ? Number(vincularCodconcor) : undefined,
          local: concNome
        })
      });
      const data = await response.json();
      if (data.success) {
        setModalVincular(false);
        fetchDados();
      } else {
        alert('Erro: ' + data.message);
      }
    } catch (err) {
      alert('Erro de conexão ao vincular.');
    } finally {
      setSalvandoVinculo(false);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Pesquisa e Concorrência</h1>
        <p className="text-slate-500 text-sm mt-1">Dados de preços de concorrentes capturados pelo WhatsApp via IA.</p>
      </div>

      <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
          <Filter size={18} /> Filtros
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar size={14} /> Data Inicial</label>
            <input 
              type="date" 
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar size={14} /> Data Final</label>
            <input 
              type="date" 
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin size={14} /> Local / Concorrente</label>
            <input 
              type="text" 
              placeholder="Ex: Mercado XYZ"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Package size={14} /> Produto</label>
            <input 
              type="text" 
              placeholder="Ex: Arroz..."
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Barcode size={14} /> EAN</label>
            <input 
              type="text" 
              placeholder="Código de Barras"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button 
            onClick={fetchDados}
            disabled={loading}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            <Search size={18} />
            {loading ? 'Buscando...' : 'Pesquisar'}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Data/Hora</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Concorrente / Local</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Produto Detectado</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">EAN / Cód. Interno</th>
                <th className="py-3 px-4 font-semibold text-emerald-600 text-xs">Preço Concorrente</th>
                <th className="py-3 px-4 font-semibold text-blue-600 text-xs">Preço Tabela</th>
                <th className="py-3 px-4 font-semibold text-rose-600 text-xs">Custo Interno</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Status WinThor</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Mídia</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {dados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    Nenhum registro de pesquisa encontrado.
                  </td>
                </tr>
              ) : (
                dados.map((d) => (
                  <tr key={d.ID} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {d.DATA_HORA ? new Date(d.DATA_HORA).toLocaleString('pt-BR') : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-800 dark:text-slate-200">
                      <div className="font-medium">{d.LOCAL || '-'}</div>
                      {d.CODCONCOR && (
                        <span className="inline-block text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded mt-0.5 font-mono">
                          PCCONCOR: {d.CODCONCOR}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-800 dark:text-slate-200 max-w-[200px] truncate" title={d.PRODUTO_NOME}>
                      {d.PRODUTO_NOME || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      <div>{d.EAN || '-'}</div>
                      {d.CODPROD && <div className="text-xs text-slate-400 font-mono">Cód: {d.CODPROD}</div>}
                    </td>
                    <td className="py-3 px-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(d.PRECO_ENCONTRADO)}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(d.PRECO_TABELA)}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-rose-600 dark:text-rose-400">
                      {formatCurrency(d.CUSTO)}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {d.STATUS_INTEGRACAO === 'INTEGRADO' ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-medium" title={`Cotação #${d.NUMCOTA || ''}`}>
                          PCCOTA {d.NUMCOTA ? `#${d.NUMCOTA}` : 'OK'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full font-medium">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {d.IMAGEM_URL ? (
                        <a href={d.IMAGEM_URL} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-600 flex items-center gap-1">
                          <ImageIcon size={16} /> Ver Foto
                        </a>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button 
                        onClick={() => handleOpenVincular(d)}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors mr-1"
                        title="Vincular / Integrar WinThor"
                      >
                        <Link2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(d.ID)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalVincular && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <Link2 size={20} className="text-primary-400" />
                  Vincular & Integrar WinThor
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Associe o Concorrente oficial (PCCONCOR) e o Produto (PCPRODUT) para sincronizar diretamente com a tabela PCCOTA.
                </p>
              </div>
              <button 
                onClick={() => setModalVincular(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Seleção do Concorrente Oficial PCCONCOR */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Store size={14} className="text-primary-400" />
                    Concorrente Oficial (PCCONCOR)
                  </label>
                  <button
                    type="button"
                    onClick={fetchConcorrentes}
                    disabled={loadingConcorrentes}
                    className="text-[11px] text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-slate-800"
                    title="Recarregar da tabela PCCONCOR"
                  >
                    <RefreshCw size={12} className={loadingConcorrentes ? 'animate-spin text-primary-400' : ''} />
                    {loadingConcorrentes ? 'Carregando...' : 'Atualizar PCCONCOR'}
                  </button>
                </div>

                <div className="relative">
                  <select 
                    value={vincularCodconcor}
                    onChange={e => setVincularCodconcor(e.target.value)}
                    className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all appearance-none pr-10 cursor-pointer shadow-sm"
                  >
                    <option value="" className="bg-slate-800 text-slate-400">
                      {loadingConcorrentes ? 'Carregando concorrentes da PCCONCOR...' : 'Selecione um concorrente da PCCONCOR (opcional)...'}
                    </option>
                    {concorrentes.map((c) => (
                      <option key={c.CODCONCOR || c.codconcor} value={c.CODCONCOR || c.codconcor} className="bg-slate-800 text-slate-100 py-1.5">
                        {(c.CONCORRENTE || c.nome)} (Cód: {c.CODCONCOR || c.codconcor})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-3 pointer-events-none text-slate-400">
                    <ChevronDown size={16} />
                  </div>
                </div>

                {concorrentes.length > 0 ? (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 px-0.5">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      {concorrentes.length} concorrente(s) carregado(s) da PCCONCOR
                    </span>
                    {vincularCodconcor && (
                      <span className="text-slate-300 font-mono">
                        Cód: <strong className="text-primary-400">{vincularCodconcor}</strong>
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded-lg px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle size={13} />
                      {loadingConcorrentes ? 'Carregando concorrentes da PCCONCOR...' : 'Nenhum concorrente carregado da PCCONCOR.'}
                    </span>
                    <button 
                      type="button" 
                      onClick={fetchConcorrentes}
                      className="underline text-amber-300 hover:text-amber-200 font-medium ml-2"
                    >
                      Tentar carregar
                    </button>
                  </div>
                )}
              </div>

              {/* Busca Inteligente de Produto no WinThor */}
              <div className="border-t border-slate-700/80 pt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Package size={14} className="text-primary-400" />
                    Pesquisar Produto WinThor (Nome ou Código)
                  </label>
                  {buscandoProdutos && (
                    <span className="text-[11px] text-primary-400 font-medium flex items-center gap-1 animate-pulse">
                      <RefreshCw size={11} className="animate-spin" /> Buscando no WinThor...
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input 
                    type="text" 
                    value={buscaProdutoTexto}
                    onChange={e => handleBuscarProdutos(e.target.value)}
                    className="w-full bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all shadow-sm"
                    placeholder="Digite a descrição, código ou EAN... Ex: Goiabada, Heineken, 6062"
                  />
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  {buscaProdutoTexto && (
                    <button 
                      type="button"
                      onClick={() => { setBuscaProdutoTexto(''); setProdutosEncontrados([]); }}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 p-0.5 rounded transition-colors"
                      title="Limpar texto da busca"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Lista de Resultados Encontrados */}
                {produtosEncontrados.length > 0 && (
                  <div className="mt-2.5 max-h-56 overflow-y-auto border border-slate-700 rounded-xl bg-slate-800 divide-y divide-slate-700/60 shadow-2xl backdrop-blur-md">
                    <div className="px-3 py-1.5 bg-slate-800/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex justify-between border-b border-slate-700/60 sticky top-0 z-10 backdrop-blur-sm">
                      <span>{produtosEncontrados.length} produto(s) encontrado(s)</span>
                      <span>Clique para selecionar</span>
                    </div>
                    {produtosEncontrados.map((prod) => (
                      <div 
                        key={prod.CODPROD}
                        onClick={() => handleSelecionarProduto(prod)}
                        className="p-3 hover:bg-slate-700/70 cursor-pointer transition-colors text-xs flex justify-between items-center group"
                      >
                        <div className="pr-3 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/80 shrink-0">
                              #{prod.CODPROD}
                            </span>
                            <span className="font-medium text-slate-100 group-hover:text-primary-300 transition-colors truncate">
                              {prod.DESCRICAO}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                            {prod.EAN && (
                              <span className="flex items-center gap-1 font-mono text-slate-300">
                                <Barcode size={12} className="text-slate-500" /> EAN: {prod.EAN}
                              </span>
                            )}
                            {(prod.EMBALAGEM || prod.UNIDADE) && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <Package size={12} className="text-slate-500" /> Emb: {prod.EMBALAGEM || prod.UNIDADE}
                              </span>
                            )}
                          </div>
                        </div>

                        {prod.PRECO_TABELA && (
                          <div className="text-right shrink-0 pl-2">
                            <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Tabela</span>
                            <span className="font-bold text-emerald-400 text-xs font-mono">
                              {formatCurrency(prod.PRECO_TABELA)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Card de Produto Selecionado */}
                {vincularCodprod && (
                  <div className="mt-3 p-3 bg-slate-800/90 border border-emerald-500/60 rounded-xl text-xs flex items-center justify-between shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-300">Produto selecionado:</span>
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded text-[11px]">
                            Cód: {vincularCodprod}
                          </span>
                        </div>
                        {produtoSelecionadoInfo?.DESCRICAO && (
                          <div className="text-slate-200 font-medium text-xs mt-0.5">
                            {produtoSelecionadoInfo.DESCRICAO}
                          </div>
                        )}
                        {vincularEan && (
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                            <Barcode size={12} className="text-slate-500" /> EAN: {vincularEan}
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setVincularCodprod(''); setProdutoSelecionadoInfo(null); }}
                      className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 px-2.5 py-1 rounded-lg transition-colors ml-2 whitespace-nowrap font-medium border border-rose-900/40"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>

              {/* Ajuste manual de Código e EAN */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/80">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Cód. Produto Interno
                  </label>
                  <input 
                    type="text" 
                    value={vincularCodprod}
                    onChange={e => { setVincularCodprod(e.target.value); setProdutoSelecionadoInfo(null); }}
                    className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    placeholder="Ex: 6062"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    EAN (Código de Barras)
                  </label>
                  <input 
                    type="text" 
                    value={vincularEan}
                    onChange={e => setVincularEan(e.target.value)}
                    className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    placeholder="Ex: 7891234..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-700/80">
              <button 
                onClick={() => setModalVincular(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleVincular}
                disabled={salvandoVinculo}
                className="px-5 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-500 text-white rounded-xl shadow-lg shadow-primary-600/30 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {salvandoVinculo ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Link2 size={14} /> Salvar & Integrar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

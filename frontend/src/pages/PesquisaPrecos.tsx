import { useState, useEffect } from 'react';
import { Search, Filter, Calendar, MapPin, Package, Barcode, Image as ImageIcon, Trash2, Link2 } from 'lucide-react';

export default function PesquisaPrecos() {
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados Modal Vincular
  const [modalVincular, setModalVincular] = useState(false);
  const [vincularEan, setVincularEan] = useState('');
  const [vincularCodprod, setVincularCodprod] = useState('');
  const [vincularId, setVincularId] = useState<number | null>(null);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

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

  const handleOpenVincular = (id: number) => {
    setVincularId(id);
    setVincularEan('');
    setVincularCodprod('');
    setModalVincular(true);
  };

  const handleVincular = async () => {
    if (!vincularEan && !vincularCodprod) {
      alert('Preencha EAN ou Cód Produto');
      return;
    }
    setSalvandoVinculo(true);
    try {
      const response = await fetch(`/api/pesquisa/${vincularId}/vincular`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean: vincularEan, codprod: vincularCodprod })
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
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar size={14} /> Data Final</label>
            <input 
              type="date" 
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin size={14} /> Local / Concorrente</label>
            <input 
              type="text" 
              placeholder="Ex: Mercado XYZ"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Package size={14} /> Produto</label>
            <input 
              type="text" 
              placeholder="Ex: Arroz..."
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Barcode size={14} /> EAN</label>
            <input 
              type="text" 
              placeholder="Código de Barras"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
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
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Local</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Produto Detectado</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">EAN / Cód. Interno</th>
                <th className="py-3 px-4 font-semibold text-emerald-600 text-xs">Preço Concorrente</th>
                <th className="py-3 px-4 font-semibold text-blue-600 text-xs">Preço Tabela</th>
                <th className="py-3 px-4 font-semibold text-rose-600 text-xs">Custo Interno</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs">Mídia</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-xs text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {dados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    Nenhum registro de pesquisa encontrado.
                  </td>
                </tr>
              ) : (
                dados.map((d) => (
                  <tr key={d.ID} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {d.DATA_HORA ? new Date(d.DATA_HORA).toLocaleString('pt-BR') : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {d.LOCAL || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-800 dark:text-slate-200 max-w-[200px] truncate" title={d.PRODUTO_NOME}>
                      {d.PRODUTO_NOME || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      <div>{d.EAN || '-'}</div>
                      {d.CODPROD && <div className="text-xs text-slate-400">Cód: {d.CODPROD}</div>}
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
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {d.IMAGEM_URL ? (
                        <a href={d.IMAGEM_URL} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-600 flex items-center gap-1">
                          <ImageIcon size={16} /> Ver Foto
                        </a>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!d.CODPROD && !d.EAN && (
                        <button 
                          onClick={() => handleOpenVincular(d.ID)}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors mr-1"
                          title="Vincular Produto"
                        >
                          <Link2 size={16} />
                        </button>
                      )}
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white">Vincular Produto</h3>
            <p className="text-sm text-slate-500 mb-4">Informe o EAN ou Cód. Produto interno para atualizar o registro com dados do sistema.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 dark:text-slate-200">EAN</label>
                <input 
                  type="text" 
                  value={vincularEan}
                  onChange={e => setVincularEan(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="Código de Barras"
                />
              </div>
              <div className="text-center text-sm font-semibold text-slate-400">OU</div>
              <div>
                <label className="block text-sm font-semibold mb-1 dark:text-slate-200">Cód. Produto</label>
                <input 
                  type="text" 
                  value={vincularCodprod}
                  onChange={e => setVincularCodprod(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="Código Interno"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => setModalVincular(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleVincular}
                disabled={salvandoVinculo}
                className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {salvandoVinculo ? 'Salvando...' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

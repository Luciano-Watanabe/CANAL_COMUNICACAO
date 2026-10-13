import { useCart } from '../contexts/CartContext';
import { ShoppingCart, Trash2, Download, Minus, Plus, Sparkles, PlusCircle, Send, FileText, Loader2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePrivacy } from '../contexts/PrivacyContext';

export const CartPanel = ({ codcli, telefone }: { codcli: string, telefone?: string }) => {
  const { getCartItems, removeFromCart, updateQuantity, clearCart, getCartTotal, addToCart } = useCart();
  const { maskData } = usePrivacy();
  
  const items = getCartItems(codcli);
  const total = getCartTotal(codcli);

  const [crossSell, setCrossSell] = useState<any[]>([]);
  const [loadingCS, setLoadingCS] = useState(false);
  const [enviandoERP, setEnviandoERP] = useState(false);
  const [modalEscolhaTipo, setModalEscolhaTipo] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setCrossSell([]);
      return;
    }
    const lastItem = items[items.length - 1];
    
    let isMounted = true;
    setLoadingCS(true);
    fetch(`/api/produtos/${lastItem.codprod}/cross-sell`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.success) {
          // Filtrar os que já estão no carrinho
          const filtered = data.sugestoes.filter((s: any) => !items.some((i: any) => i.codprod === s.codprod));
          setCrossSell(filtered.slice(0, 5));
        }
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoadingCS(false);
      });
      
    return () => { isMounted = false; };
  }, [items.length]);

  const exportToCSV = () => {
    if (items.length === 0) return;

    // Linha 1: cabeçalho fixo
    let csvContent = 'CODAUXILIAR;QTD\n';

    items.forEach(item => {
      const codAuxiliar = item.ean || '';
      const qtd = item.qt;
      csvContent += `${codAuxiliar};${qtd}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pedido_${codcli}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleEnviarParaERP = async (tipoEscolhido: 'CARRINHO' | 'ORCAMENTO') => {
    if (items.length === 0) return;
    setEnviandoERP(true);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const matricula = user?.matricula;

      const payload = {
        tipo: tipoEscolhido,
        codcli: codcli,
        codusur: matricula,
        importarImediato: true,
        itens: items.map(item => ({
          codprod: item.codprod,
          qt: item.qt,
          pvenda: item.pvenda,
          ean: item.ean
        }))
      };

      const res = await fetch('/api/chat/pedido-fv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) {
        alert(`Erro ao gravar no ERP: ${data.error || 'Erro desconhecido'}`);
        return;
      }

      const { numpedrca, resultadoImportacao, tipo } = data;
      const descTipo = tipo === 'ORCAMENTO' ? 'Orçamento' : 'Pedido de Venda';
      let msg = `✅ ${descTipo} RCA #${numpedrca} gravado com sucesso!`;
      
      if (resultadoImportacao?.numped) {
        msg += `\n📦 Pedido ERP: ${resultadoImportacao.numped} (Posição: ${resultadoImportacao.posicao || 'L'})`;
      } else if (resultadoImportacao?.importado === 3) {
        msg += `\n⚠️ Rejeitado ou pendente de liberação pela integradora (Posição: ${resultadoImportacao.posicao || 'R'})`;
        if (resultadoImportacao.logs?.length > 0) {
          msg += `\nÚltimo log: ${resultadoImportacao.logs[resultadoImportacao.logs.length - 1].msg}`;
        }
      } else {
        msg += `\n⏳ Registrado na fila PCPEDCFV / PCPEDIFV para importação do WinThor.`;
      }

      alert(msg);
      setModalEscolhaTipo(false);
      if (tipoEscolhido === 'CARRINHO') {
        clearCart(codcli);
      }
    } catch (err: any) {
      console.error('Erro ao enviar pedido para ERP:', err);
      alert('Erro de conexão ao enviar para o ERP.');
    } finally {
      setEnviandoERP(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-slate-400 text-center animate-fade-in">
        <ShoppingCart size={48} className="mb-4 text-slate-300 dark:text-slate-600" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Carrinho Vazio</h3>
        <p className="text-sm">Adicione produtos pelo Mix Inteligente ou Últimos Pedidos.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.map(item => (
          <div key={item.codprod} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm relative group">
            <button 
              onClick={() => removeFromCart(item.codprod, item.codcli)}
              className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={16} />
            </button>
            <p className="text-xs font-semibold text-slate-800 dark:text-white pr-6 line-clamp-2 leading-tight mb-2">
              {item.codprod} - {maskData(item.descricao)}
            </p>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
                <button onClick={() => updateQuantity(item.codprod, item.codcli, item.qt - 1)} className="p-1 text-slate-500 hover:text-primary-500"><Minus size={14} /></button>
                <span className="text-xs font-semibold w-6 text-center text-slate-900 dark:text-white">{item.qt}</span>
                <button onClick={() => updateQuantity(item.codprod, item.codcli, item.qt + 1)} className="p-1 text-slate-500 hover:text-primary-500"><Plus size={14} /></button>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">R$ {Number(item.pvenda).toFixed(2).replace('.', ',')} / un</p>
                <p className="text-xs font-bold text-primary-600 dark:text-primary-400">
                  R$ {(item.qt * item.pvenda).toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Sugestões Compre Junto */}
      {(crossSell.length > 0 || loadingCS) && (
        <div className="bg-primary-50/50 dark:bg-primary-900/10 border-t border-b border-primary-100 dark:border-primary-900/30 p-3 shrink-0">
          <h4 className="text-[11px] font-bold text-primary-600 dark:text-primary-400 mb-2 flex items-center gap-1 uppercase tracking-wide">
            <Sparkles size={12} /> Aproveite e leve também
          </h4>
          
          {loadingCS ? (
            <div className="text-xs text-primary-400 text-center py-2 animate-pulse">Buscando sugestões...</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {crossSell.map((sug) => (
                <div key={sug.codprod} className="bg-white dark:bg-slate-800 border border-primary-200 dark:border-primary-800 rounded-lg p-2 min-w-[140px] max-w-[140px] shrink-0 shadow-sm flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-800 dark:text-white line-clamp-2 leading-tight mb-1" title={sug.descricao}>
                      {maskData(sug.descricao)}
                    </p>
                    <p className="text-[10px] text-primary-600 dark:text-primary-400 font-bold">
                      R$ {Number(sug.preco).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      addToCart({
                        codprod: Number(sug.codprod),
                        descricao: sug.descricao,
                        qt: 1,
                        pvenda: Number(sug.preco),
                        codcli: codcli,
                        ean: sug.ean
                      });

                      const userStr = localStorage.getItem('user');
                      const user = userStr ? JSON.parse(userStr) : null;
                      const matricula = user?.matricula;
                      if (matricula) {
                        fetch('/api/metricas/cross-sell', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ codusur: matricula, codprod: sug.codprod })
                        }).catch(e => console.error('Erro metrica:', e));

                        if (telefone) {
                          let textoMsg = `*${sug.descricao}*`;
                          if (sug.qtunit) {
                            let emb = `${sug.qtunit} ${sug.unidade || ''}`.trimEnd();
                            textoMsg += `\nEmbalagem: ${emb}`;
                          }
                          const uni = sug.tipoembalagem === 'P' ? 'kg' : 'un';
                          textoMsg += `\nR$ ${Number(sug.preco).toFixed(2).replace('.', ',')}/${uni}`;
                          textoMsg += `\nValor Total: R$ ${Number(sug.preco).toFixed(2).replace('.', ',')}`;

                          fetch('/api/chat/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              codusur: matricula,
                              telefone: telefone,
                              texto: textoMsg
                            })
                          }).catch(e => console.error('Erro ao enviar sugestão:', e));
                        }
                      }
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1 py-1 bg-primary-100 hover:bg-primary-200 dark:bg-primary-900/40 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300 rounded text-[10px] font-semibold transition-colors"
                  >
                    <PlusCircle size={10} /> Adicionar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total do Pedido:</span>
          <span className="text-lg font-bold text-slate-900 dark:text-white">R$ {total.toFixed(2).replace('.', ',')}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button 
            onClick={() => clearCart(codcli)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Limpar
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium transition-colors"
          >
            <Download size={16} /> CSV
          </button>
        </div>

        <button 
          onClick={() => setModalEscolhaTipo(true)}
          disabled={enviandoERP}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          {enviandoERP ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Gravar no ERP (WinThor)
        </button>
      </div>

      {/* Modal Escolha de Envio: CARRINHO (Pedido) ou ORÇAMENTO */}
      {modalEscolhaTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Send size={18} className="text-emerald-500" />
                Gravar no ERP WinThor
              </h3>
              <button 
                onClick={() => setModalEscolhaTipo(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
              Como deseja registrar estes <strong>{items.length} itens</strong> (Total: R$ {total.toFixed(2).replace('.', ',')}) nas tabelas de integração (<code>PCPEDCFV</code> / <code>PCPEDIFV</code>)?
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handleEnviarParaERP('CARRINHO')}
                disabled={enviandoERP}
                className="flex items-center justify-start gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-left transition-all"
              >
                <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    Pedido de Venda (CARRINHO)
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    Gera pedido formal de venda no ERP e reserva estoque.
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleEnviarParaERP('ORCAMENTO')}
                disabled={enviandoERP}
                className="flex items-center justify-start gap-3 p-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-left transition-all"
              >
                <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-blue-900 dark:text-blue-100">
                    Orçamento (ORÇAMENTO)
                  </div>
                  <div className="text-[11px] text-blue-700 dark:text-blue-300">
                    Grava como orçamento no ERP sem reserva física de estoque.
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={() => setModalEscolhaTipo(false)}
              className="mt-4 w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-center"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

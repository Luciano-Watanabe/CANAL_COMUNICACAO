const fs = require('fs');
const file = 'src/pages/Chat.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add lucide icons
content = content.replace("Check, CheckCheck, MessageSquare } from 'lucide-react';", "Check, CheckCheck, MessageSquare, ShoppingBag, Plus, Star, Tag } from 'lucide-react';");

// 2. Add state
const statePattern = "const [loadingHistory, setLoadingHistory] = useState(false);";
const stateAdd = `const [loadingHistory, setLoadingHistory] = useState(false);
  const [mixProdutos, setMixProdutos] = useState<any[]>([]);
  const [loadingMix, setLoadingMix] = useState(false);
`;
content = content.replace(statePattern, stateAdd);

// 3. Add fetchMix
const fetchHistoryPattern = "fetchHistory();";
const fetchHistoryAdd = `fetchHistory();

    const fetchMix = async () => {
      setLoadingMix(true);
      try {
        const codcli = activeChatData.id.split('_')[0];
        const response = await fetch(\`/api/produtos/mix/\${codcli}\`);
        const data = await response.json();
        if (data.success) setMixProdutos(data.mix);
      } catch (err) {
        console.error('Erro ao buscar mix:', err);
      } finally {
        setLoadingMix(false);
      }
    };
    fetchMix();
`;
content = content.replace(fetchHistoryPattern, fetchHistoryAdd);

// 4. Update the layout to add the 3rd column
const layoutPattern = `        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
              <MessageSquare size={32} className="text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Nenhuma conversa selecionada</h3>
            <p className="max-w-xs">Escolha um cliente na lista ao lado para iniciar ou continuar um atendimento.</p>
          </div>
        )}
      </div>`;

const layoutAdd = `        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
              <MessageSquare size={32} className="text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Nenhuma conversa selecionada</h3>
            <p className="max-w-xs">Escolha um cliente na lista ao lado para iniciar ou continuar um atendimento.</p>
          </div>
        )}
      </div>

      {/* Painel do Mix de Produtos (3a Coluna) */}
      {activeChat && (
        <div className="w-80 glass-card rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-sm border-l border-[var(--border-color)]">
          <div className="p-4 border-b border-[var(--border-color)] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingBag size={18} className="text-primary-500" /> Mix de Produtos
            </h3>
            <p className="text-xs text-slate-500 mt-1">Baseado na atividade do cliente</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingMix ? (
              <div className="text-center text-slate-400 py-10">Carregando mix...</div>
            ) : mixProdutos.length === 0 ? (
              <div className="text-center text-slate-400 py-10 text-sm">
                Nenhum produto encontrado para o ramo deste cliente.
              </div>
            ) : (
              mixProdutos.map(prod => (
                <div key={prod.codprod} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-[var(--border-color)] relative overflow-hidden group">
                  {prod.sinais.compraMuito && (
                    <div className="absolute top-0 right-0 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-bl-lg flex items-center gap-1">
                      <Star size={10} fill="currentColor" /> ALTA SAÍDA
                    </div>
                  )}
                  {prod.sinais.sugerir && (
                    <div className="absolute top-0 right-0 bg-primary-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                      SUGERIR
                    </div>
                  )}
                  
                  <div className="flex gap-2 items-start mt-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white leading-tight">
                        {prod.codprod} - {prod.descricao}
                      </h4>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center gap-1">
                          <Tag size={12} /> R$ {Number(prod.preco).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {prod.sinais.jaComprou ? (
                          <div className="flex items-center gap-1">
                            <Check size={12} className="text-emerald-500" />
                            Últ. compra: {prod.ultimaCompra ? new Date(prod.ultimaCompra).toLocaleDateString('pt-BR') : 'N/A'}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Cliente nunca comprou</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}`;

content = content.replace(layoutPattern, layoutAdd);

fs.writeFileSync(file, content);
console.log("Chat.tsx modificado com sucesso.");

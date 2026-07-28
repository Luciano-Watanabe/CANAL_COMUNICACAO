const fs = require('fs');
const file = 'src/pages/Chat.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state for selected products
const stateAdd = `const [loadingHistory, setLoadingHistory] = useState(false);
  const [mixProdutos, setMixProdutos] = useState<any[]>([]);
  const [loadingMix, setLoadingMix] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
`;
content = content.replace(/const \[loadingHistory, setLoadingHistory\] = useState\(false\);\s*const \[mixProdutos, setMixProdutos\] = useState<any\[\]>\(\[\]\);\s*const \[loadingMix, setLoadingMix\] = useState\(false\);/, stateAdd);

// 2. Clear selectedProducts on activeChat change
const fetchMixAdd = `
    setSelectedProducts([]); // Limpa a seleção ao trocar de chat
    const fetchMix = async () => {`;
content = content.replace("const fetchMix = async () => {", fetchMixAdd);

// 3. Add handleSendSuggestions function
const sendSuggCode = `
  const handleSendSuggestions = async () => {
    if (selectedProducts.length === 0 || !activeChatData) return;
    
    for (const cod of selectedProducts) {
      const prod = mixProdutos.find(p => p.codprod === cod);
      if (prod) {
        const text = \`Sugestão de Produto:\\n\${prod.codprod} - \${prod.descricao}\\nValor: R$ \${Number(prod.preco).toFixed(2).replace('.', ',')}\`;
        
        const tempId = Date.now() + Math.random();
        setMessages(prev => [...prev, { 
          id: tempId as any, 
          text, 
          sender: 'me', 
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }]);
        
        try {
          const userStr = localStorage.getItem('user');
          const user = userStr ? JSON.parse(userStr) : null;
          await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              codusur: user?.matricula,
              telefone: activeChatData.preview,
              texto: text
            })
          });
        } catch (e) {
          console.error('Erro ao enviar sugestão:', e);
        }
      }
    }
    setSelectedProducts([]);
  };

  const handleSendMessage = async () => {`;
content = content.replace("const handleSendMessage = async () => {", sendSuggCode);

// 4. Update the Mix Panel UI (Header to include a Send button, and Items to include a checkbox)
const oldMixHeader = `<div className="p-4 border-b border-[var(--border-color)] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingBag size={18} className="text-primary-500" /> Mix de Produtos
            </h3>
            <p className="text-xs text-slate-500 mt-1">Baseado na atividade do cliente</p>
          </div>`;

const newMixHeader = `<div className="p-4 border-b border-[var(--border-color)] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag size={18} className="text-primary-500" /> Mix de Produtos
              </h3>
              <p className="text-xs text-slate-500 mt-1">Baseado na atividade do cliente</p>
            </div>
            {selectedProducts.length > 0 && (
              <button 
                onClick={handleSendSuggestions}
                className="bg-primary-500 hover:bg-primary-600 text-white p-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1"
              >
                <Send size={14} /> Enviar ({selectedProducts.length})
              </button>
            )}
          </div>`;
content = content.replace(oldMixHeader, newMixHeader);

// 5. Update the Mix Item to make it selectable
const oldMixItem = `<div key={prod.codprod} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-[var(--border-color)] relative overflow-hidden group">`;
const newMixItem = `<div 
                  key={prod.codprod} 
                  onClick={() => {
                    setSelectedProducts(prev => 
                      prev.includes(prod.codprod) 
                        ? prev.filter(c => c !== prod.codprod)
                        : [...prev, prod.codprod]
                    )
                  }}
                  className={clsx(
                    "rounded-xl p-3 border relative overflow-hidden group cursor-pointer transition-all",
                    selectedProducts.includes(prod.codprod) 
                      ? "bg-primary-50 dark:bg-primary-900/20 border-primary-500 shadow-sm" 
                      : "bg-slate-50 dark:bg-slate-800/50 border-[var(--border-color)] hover:border-slate-300 dark:hover:border-slate-600"
                  )}
                >
                  <div className="absolute top-2 right-2">
                    <div className={clsx(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                      selectedProducts.includes(prod.codprod)
                        ? "bg-primary-500 border-primary-500 text-white"
                        : "border-slate-300 dark:border-slate-600"
                    )}>
                      {selectedProducts.includes(prod.codprod) && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
`;
content = content.replace(/<div key=\{prod\.codprod\} className="bg-slate-50 dark:bg-slate-800\/50 rounded-xl p-3 border border-\[var\(--border-color\)\] relative overflow-hidden group">/g, newMixItem);

// 6. Fix CSS issues caused by absolute top/right since we added a checkbox to top right.
// Move the SUGERIR and ALTA SAÍDA tags slightly to the left.
content = content.replace(/className="absolute top-0 right-0 bg-amber-400/g, 'className="absolute bottom-0 right-0 bg-amber-400');
content = content.replace(/rounded-bl-lg/g, 'rounded-tl-lg');
content = content.replace(/className="absolute top-0 right-0 bg-primary-500/g, 'className="absolute bottom-0 right-0 bg-primary-500');

fs.writeFileSync(file, content);
console.log("Chat.tsx modificado para adicionar selecao de mix e envio multiplo.");

const fs = require('fs');
let content = fs.readFileSync('/opt/CANAL_COMUNICACAO/frontend/src/pages/Chat.tsx', 'utf8');

// 1. Update imports
const importTarget = "import { Search, Info, Smile, Paperclip, Send, AlertCircle, Check, CheckCheck, MessageSquare, Tag, X, ShoppingCart } from 'lucide-react';";
const importReplacement = "import { Search, Info, Smile, Paperclip, Send, AlertCircle, Check, CheckCheck, MessageSquare, Tag, X, ShoppingCart, Download, FileText, Loader2 } from 'lucide-react';";
content = content.replace(importTarget, importReplacement);

// 2. Add State and HandleTranscribe
const stateTarget = "  const [messages, setMessages] = useState<Message[]>([]);";
const stateReplacement = `  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});

  const handleTranscribe = async (messageId: string) => {
    setTranscribing(prev => ({ ...prev, [messageId]: true }));
    try {
      const res = await fetch(\`\${import.meta.env.VITE_API_URL}/chat/transcribe\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });
      const data = await res.json();
      if (data.success) {
        setTranscriptions(prev => ({ ...prev, [messageId]: data.text }));
      } else {
        setTranscriptions(prev => ({ ...prev, [messageId]: '[Erro na transcrição: ' + (data.error || 'Falha') + ']' }));
      }
    } catch (err) {
      setTranscriptions(prev => ({ ...prev, [messageId]: '[Erro ao conectar com API de transcrição]' }));
    } finally {
      setTranscribing(prev => ({ ...prev, [messageId]: false }));
    }
  };`;
content = content.replace(stateTarget, stateReplacement);

// 3. Update message rendering
const renderTarget = `                messages.map((msg) => (
                  <div key={msg.id} className={clsx("flex flex-col max-w-[75%]", msg.sender === 'me' ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div 
                      className={clsx(
                        "px-4 py-2.5 rounded-2xl shadow-sm",
                        msg.sender === 'me' 
                          ? "bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm" 
                          : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-sm border border-[var(--border-color)]"
                      )}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                      {msg.sender === 'me' && <CheckCheck size={12} className="text-primary-500" />}
                    </div>
                  </div>
                ))`;

const renderReplacement = `                messages.map((msg) => {
                  const isAudio = msg.text.startsWith('[AUDIO]');
                  const audioFileId = isAudio ? msg.text.replace('[AUDIO]', '').replace('.ogg', '') : null;
                  const audioUrl = isAudio ? \`\${(import.meta.env.VITE_API_URL || '').replace('/api', '')}/uploads/\${audioFileId}.ogg\` : null;
                  
                  return (
                  <div key={msg.id} className={clsx("flex flex-col max-w-[75%]", msg.sender === 'me' ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div 
                      className={clsx(
                        "px-4 py-2.5 rounded-2xl shadow-sm",
                        msg.sender === 'me' 
                          ? "bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm" 
                          : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-sm border border-[var(--border-color)]"
                      )}
                    >
                      {isAudio ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <MessageSquare size={16} /> Mensagem de Áudio
                          </div>
                          <audio controls src={audioUrl!} className="h-10 w-full" />
                          <div className="flex items-center gap-2 mt-1">
                            <a href={audioUrl!} download={\`\${audioFileId}.ogg\`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-slate-200 dark:border-slate-600">
                              <Download size={14} /> Baixar
                            </a>
                            <button 
                              onClick={() => handleTranscribe(audioFileId!)} 
                              disabled={transcribing[audioFileId!]}
                              className="flex-1 flex items-center justify-center gap-1 py-1 px-2 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-lg text-xs font-medium transition-colors border border-primary-200 dark:border-primary-800 disabled:opacity-50"
                            >
                              {transcribing[audioFileId!] ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} 
                              Transcrever
                            </button>
                          </div>
                          {transcriptions[audioFileId!] && (
                            <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-700 text-sm whitespace-pre-wrap">
                              <span className="text-xs font-semibold text-slate-500 block mb-1">Transcrição:</span>
                              {transcriptions[audioFileId!]}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                      {msg.sender === 'me' && <CheckCheck size={12} className="text-primary-500" />}
                    </div>
                  </div>
                )})`;
content = content.replace(renderTarget, renderReplacement);

fs.writeFileSync('/opt/CANAL_COMUNICACAO/frontend/src/pages/Chat.tsx', content);
console.log("Chat patched");

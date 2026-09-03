import { Printer, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useRef, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart } from 'recharts';
import * as htmlToImage from 'html-to-image';
import ReactMarkdown from 'react-markdown';

export default function RelatorioSAC() {
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [vendedor, setVendedor] = useState('');
  const [nomeVendedor, setNomeVendedor] = useState('Todos');
  const [relatorioData, setRelatorioData] = useState<any[]>([]);
  const [evolutivoData, setEvolutivoData] = useState<any[]>([]);
  const [departamentosEvolutivo, setDepartamentosEvolutivo] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [analiseIA, setAnaliseIA] = useState<string | null>(null);
  const [loadingIA, setLoadingIA] = useState(false);

  const [vendedoresLista, setVendedoresLista] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/relatorios/vendedores')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setVendedoresLista(data.vendedores || []);
        }
      })
      .catch(err => console.error('Erro ao buscar vendedores:', err));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const relatorioRef = useRef<HTMLDivElement>(null);

  const selectedVendedores = vendedor ? vendedor.split(',') : [];

  const toggleVendedor = (cod: string) => {
    let newSelected = [...selectedVendedores];
    if (cod === '') {
      newSelected = [];
    } else {
      if (newSelected.includes(cod)) {
        newSelected = newSelected.filter(c => c !== cod);
      } else {
        newSelected.push(cod);
      }
    }
    setVendedor(newSelected.join(','));
  };

  const getButtonText = () => {
    if (selectedVendedores.length === 0) return 'Todos os Vendedores';
    if (selectedVendedores.length === 1) {
      const v = vendedoresLista.find(v => String(v.CODUSUR) === selectedVendedores[0]);
      return v ? v.NOME : selectedVendedores[0];
    }
    return `${selectedVendedores.length} vendedores selecionados`;
  };

  const gerarAnaliseIADireto = async (tickets: any[], cod: string) => {
    setLoadingIA(true);
    try {
      const res = await fetch('/api/relatorios/analise-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados: tickets, codusur: cod || 'Todos' })
      });
      const data = await res.json();
      if (data.success) {
        setAnaliseIA(data.analise);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIA(false);
    }
  };

  const buscarDados = async () => {
    setLoading(true);
    setAnaliseIA(null);
    try {
      const res = await fetch(`/api/relatorios/sac-vendedor?dataInicio=${dataInicio}&dataFim=${dataFim}&codusur=${vendedor}`);
      const data = await res.json();
      if (data.success) {
        setRelatorioData(data.tickets || []);
        
        // Formatar dados evolutivos para agrupar por MES
        const rawEvo = data.evolutivo || [];
        const groupedEvo: any = {};
        const depts = new Set<string>();
        
        rawEvo.forEach((r: any) => {
          if (!groupedEvo[r.MES]) {
             groupedEvo[r.MES] = { MES: r.MES, MEDIA_GERAL: 0, count: 0, total_nota: 0 };
          }
          groupedEvo[r.MES][r.DEPARTAMENTO] = r.TOTAL_TICKETS;
          groupedEvo[r.MES].total_nota += (r.MEDIA_AVALIACAO * r.TOTAL_TICKETS);
          groupedEvo[r.MES].count += r.TOTAL_TICKETS;
          depts.add(r.DEPARTAMENTO);
        });
        
        const finalEvo = Object.values(groupedEvo).map((g: any) => ({
          ...g,
          MEDIA_GERAL: g.count ? parseFloat((g.total_nota / g.count).toFixed(2)) : 0
        })).sort((a: any, b: any) => a.MES.localeCompare(b.MES));

        setEvolutivoData(finalEvo);
        setDepartamentosEvolutivo(Array.from(depts));
        
        setNomeVendedor(data.nomeVendedor || (vendedor || 'Todos'));
        if (data.tickets && data.tickets.length > 0) {
          gerarAnaliseIADireto(data.tickets, vendedor);
        }
      } else {
        alert(data.error || "Erro ao buscar dados.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro na requisição.");
    } finally {
      setLoading(false);
    }
  };

  const gerarPDF = async () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      await new Promise(resolve => setTimeout(resolve, 100)); // wait for styles to apply
    }

    try {
      const doc = new jsPDF('p', 'pt', 'a4');
      let currentY = 40;
      
      doc.setFontSize(16);
      doc.text(`Relatório SAC - Vendedor: ${nomeVendedor}`, 40, currentY);
      currentY += 20;
      doc.setFontSize(12);
      doc.text(`Período: ${dataInicio} até ${dataFim}`, 40, currentY);
      currentY += 30;

    autoTable(doc, { 
      html: '#tabelaRelatorio', 
      startY: currentY,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [14, 165, 233] }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 30;

    if (currentY > 700) {
      doc.addPage();
      currentY = 40;
    }

    if (relatorioRef.current) {
      try {
        const graficosEl = document.getElementById('graficos-container');
        if (graficosEl) {
          const canvasGraficos = await htmlToImage.toPng(graficosEl, { backgroundColor: '#ffffff' });
          const imgProps = doc.getImageProperties(canvasGraficos);
          const pdfWidth = 515;
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          
          if (currentY + pdfHeight > 800) {
             doc.addPage();
             currentY = 40;
          }
          doc.addImage(canvasGraficos, 'PNG', 40, currentY, pdfWidth, pdfHeight);
          currentY += pdfHeight + 30;
        }

        if (analiseIA) {
            const analiseEl = document.getElementById('analise-container');
            if (analiseEl) {
                const canvasAnalise = await htmlToImage.toPng(analiseEl, { backgroundColor: '#ffffff' });
                const imgProps = doc.getImageProperties(canvasAnalise);
                const pdfWidth = 515;
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                if (currentY + pdfHeight > 800) {
                  doc.addPage();
                  currentY = 40;
                }
                doc.addImage(canvasAnalise, 'PNG', 40, currentY, pdfWidth, pdfHeight);
            }
        }
      } catch(e) {
        console.error("Erro ao gerar imagens pro PDF", e);
      }
    }

    doc.save(`Relatorio_SAC_${vendedor || 'Todos'}.pdf`);
    } finally {
      if (isDark) {
        document.documentElement.classList.add('dark');
      }
    }
  };

  const formatarData = (dt: any) => dt ? new Date(dt).toLocaleDateString('pt-BR') : '-';
  const formatarTempo = (dias: number) => {
    const d = Math.floor(dias);
    const h = Math.floor((dias - d) * 24);
    const m = Math.floor(((dias - d) * 24 - h) * 60);
    return `${d}d ${h}h ${m}m`;
  };

  const pizzaData = relatorioData.reduce((acc, curr) => {
    const depto = curr.DEPARTAMENTO || 'Sem Depto';
    const existing = acc.find((item: any) => item.name === depto);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: depto, value: 1 });
    }
    return acc;
  }, []);

  const COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#64748b'];

  return (
    <div className="p-6 space-y-6" ref={relatorioRef}>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Relatório SAC - Acompanhamento por Vendedor</h1>
        <button onClick={() => window.history.back()} className="text-slate-500 hover:text-slate-700">← Voltar</button>
      </div>

      <div className="glass-card p-6 rounded-xl space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Período Início</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Período Fim</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="p-2 border rounded-lg" />
          </div>
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm text-slate-500 mb-1">Vendedor(es)</label>
            <div 
              className="p-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700 cursor-pointer flex justify-between items-center min-w-[250px]"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span className="truncate max-w-[200px]">{getButtonText()}</span>
              <span className="text-slate-400 text-xs">▼</span>
            </div>
            {isDropdownOpen && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <div 
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2"
                  onClick={() => toggleVendedor('')}
                >
                  <input type="checkbox" checked={selectedVendedores.length === 0} readOnly className="cursor-pointer" />
                  <span className="text-sm">Todos os Vendedores</span>
                </div>
                {vendedoresLista.map(v => (
                  <div 
                    key={v.CODUSUR} 
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2"
                    onClick={() => toggleVendedor(String(v.CODUSUR))}
                  >
                    <input type="checkbox" checked={selectedVendedores.includes(String(v.CODUSUR))} readOnly className="cursor-pointer" />
                    <span className="text-sm truncate">{v.CODUSUR} - {v.NOME}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-end gap-2">
            <button onClick={buscarDados} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Carregando...' : 'Filtrar'}
            </button>
            <button onClick={gerarPDF} disabled={loadingIA || relatorioData.length === 0} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50">
              <Printer size={16} /> Exportar PDF
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 rounded-xl overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Resultados ({relatorioData.length} tickets) {nomeVendedor !== 'Todos' && `- Vendedor: ${nomeVendedor}`}</h2>
        <table id="tabelaRelatorio" className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3">CodCli</th>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Vendedor</th>
              <th className="text-left p-3">Abertura</th>
              <th className="text-left p-3">Fechado</th>
              <th className="text-left p-3">Tempo</th>
              <th className="text-left p-3">Departamento</th>
              <th className="text-left p-3">Avaliação</th>
            </tr>
          </thead>
          <tbody>
            {relatorioData.map((row, i) => (
              <tr key={i} className="border-b">
                <td className="p-3">{row.CODCLI}</td>
                <td className="p-3">{row.NOME_CLIENTE}</td>
                <td className="p-3">{row.NOME_VENDEDOR}</td>
                <td className="p-3">{formatarData(row.CRIADO_EM)}</td>
                <td className="p-3">{formatarData(row.DATA_RESOLUCAO)}</td>
                <td className="p-3">{row.TEMPO_TOTAL ? formatarTempo(row.TEMPO_TOTAL) : '-'}</td>
                <td className="p-3">{row.DEPARTAMENTO} {row.PAI_NOME ? `(${row.PAI_NOME})` : ''}</td>
                <td className="p-3">{row.NOTA_AVALIACAO ? `${row.NOTA_AVALIACAO}/10` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {relatorioData.length === 0 && !loading && (
          <p className="text-center text-slate-400 py-8">Nenhum ticket encontrado para o período selecionado.</p>
        )}
      </div>

      {relatorioData.length > 0 && (
        <div id="graficos-container" className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white dark:bg-slate-900 p-4 rounded-xl mt-6">
          <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
            <h3 className="font-semibold text-lg mb-4 text-center text-slate-800 dark:text-white">Tickets por Departamento</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie isAnimationActive={false} data={pizzaData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} outerRadius={80} fill="#8884d8" dataKey="value">
                    {pizzaData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{color: '#000'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
            <h3 className="font-semibold text-lg mb-4 text-center text-slate-800 dark:text-white">Evolutivo (Últimos 12 Meses)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={evolutivoData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="MES" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 5]} />
                  <RechartsTooltip />
                  <Legend />
                  {departamentosEvolutivo.map((dept, index) => (
                    <Bar key={dept} yAxisId="left" dataKey={dept} stackId="a" fill={`hsl(${index * 45}, 70%, 50%)`} name={dept} />
                  ))}
                  <Line yAxisId="right" type="monotone" dataKey="MEDIA_GERAL" stroke="#f59e0b" name="Nota Média Geral" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {(relatorioData.length > 0 || loadingIA) && (
        <div id="analise-container" className="glass-card p-6 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-800 mt-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4 text-purple-900 dark:text-purple-300 flex items-center gap-2">
            <Sparkles className="text-purple-600 dark:text-purple-400" />
            Análise de Desempenho (IA)
          </h3>
          <div className="prose prose-base dark:prose-invert max-w-none text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
            {loadingIA ? (
               <div className="flex items-center gap-2 text-purple-600 animate-pulse">
                  <Sparkles size={16} /> Gerando análise de desempenho...
               </div>
            ) : (
               <ReactMarkdown>{analiseIA}</ReactMarkdown>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
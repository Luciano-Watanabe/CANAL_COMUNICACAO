import { Printer, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart } from 'recharts';
import * as htmlToImage from 'html-to-image';
import ReactMarkdown from 'react-markdown';

export default function RelatorioSAC() {
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [vendedor, setVendedor] = useState('');
  const [nomeVendedor, setNomeVendedor] = useState('Todos');
  const [relatorioData, setRelatorioData] = useState<any[]>([]);
  const [evolutivoData, setEvolutivoData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [analiseIA, setAnaliseIA] = useState<string | null>(null);
  const [loadingIA, setLoadingIA] = useState(false);

  const relatorioRef = useRef<HTMLDivElement>(null);

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
        setEvolutivoData(data.evolutivo || []);
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
          <div>
            <label className="block text-sm text-slate-500 mb-1">Vendedor (Codusur)</label>
            <input type="text" value={vendedor} onChange={e => setVendedor(e.target.value)} placeholder="Ex: 123" className="p-2 border rounded-lg" />
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
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="MES" tick={{fontSize: 10}} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 10]} />
                  <RechartsTooltip contentStyle={{color: '#000'}} />
                  <Legend />
                  <Bar isAnimationActive={false} yAxisId="left" dataKey="TOTAL_TICKETS" name="Qtd Tickets" fill="#0ea5e9" />
                  <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="MEDIA_AVALIACAO" name="Média Avaliação" stroke="#f59e0b" strokeWidth={2} />
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
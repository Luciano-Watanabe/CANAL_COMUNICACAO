/**
 * metasImageService.js
 *
 * Gera um único PDF com duas seções:
 *  1) Painel de Metas — cards por departamento com barras de progresso.
 *  2) Clientes com Peso Potencial — tabela (sem CNPJ).
 *
 * MES_REF e nome do vendedor exibidos no cabeçalho. CGCENT suprimido.
 */
const PDFDocument = require('pdfkit');

// ─── Paleta ───────────────────────────────────────────────────────────────────
const BG        = '#0D1117';
const CARD_CLR  = '#161B22';
const CARD_BOOM = '#0F3460';
const BAR_TRACK = '#30363D';
const BAR_OK    = '#3FB950';
const BAR_BOOM  = '#FFD700';
const BAR_POT   = '#58A6FF';
const TXT_WHITE = '#F0F6FC';
const TXT_DIM   = '#8B949E';
const TXT_BOOM  = '#FF7B72';
const TXT_GAIN  = '#3FB950';
const BORDER    = '#21262D';
const HEADER_BG = '#161B22';
const TBL_HDR   = '#21262D';
const TBL_ODD   = '#161B22';
const TBL_EVEN  = '#1C2128';

// ─── Layout — Seção 1 (Cards) ─────────────────────────────────────────────────
const COLS   = 2;
const CARD_W = 265;
const CARD_H = 113;   // altura ajustada ao conteúdo
const GAP    = 14;
const MARGIN = 20;
const HEADER = 66;
const RADIUS = 8;
const BAR_H  = 7;

// ─── Layout — Seção 2 (Tabela sem CNPJ) ──────────────────────────────────────
const TBL_COLS = [
    { label: 'Cód.',         w: 38  },
    { label: 'Cliente',      w: 230 },
    { label: 'Últ. Compra', w: 65  },
    { label: 'Dpt',         w: 35  },
    { label: 'Departamento', w: 120 },
    { label: 'Peso (kg)',   w: 56  },
]; // soma = 544

const ROW_H      = 18;
const TBL_HDR_H  = 24;
const SEC2_HDR_H = 42;
const KPI_H      = 58;  // faixa de KPIs entre cabeçalho e cards
const TOP_H      = 80;  // seção Top Oportunidades (24 header + 3×18 rows + 2 border)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trunc(str, maxChars) {
    str = String(str || '');
    return str.length > maxChars ? str.slice(0, maxChars - 1) + '\u2026' : str;
}

function drawBar(doc, x, y, w, perc, label, percStr, barColor) {
    doc.fillColor(TXT_DIM).fontSize(6.5).font('Helvetica')
       .text(label, x, y, { width: w - 40, lineBreak: false });
    doc.fillColor(perc >= 100 ? BAR_BOOM : TXT_WHITE).fontSize(6.5).font('Helvetica-Bold')
       .text(percStr, x + w - 38, y, { width: 38, align: 'right', lineBreak: false });
    const barY = y + 10;
    doc.roundedRect(x, barY, w, BAR_H, 3).fill(BAR_TRACK);
    const fillW = Math.max(3, Math.round(w * Math.min(perc, 100) / 100));
    doc.roundedRect(x, barY, fillW, BAR_H, 3).fill(barColor);
}

function calcPageHeight(numMetasRows, numClientesRows) {
    const numLines  = Math.ceil(numMetasRows / COLS);
    const cardsH    = numLines * (CARD_H + GAP);
    const clientesH = numClientesRows > 0
        ? GAP + TOP_H + GAP + SEC2_HDR_H + TBL_HDR_H + numClientesRows * ROW_H + MARGIN
        : 0;
    return MARGIN * 2 + HEADER + KPI_H + GAP + cardsH + clientesH;
}

// ─── Exportação principal ─────────────────────────────────────────────────────
async function gerarImagemMetas(mesRef, rowsMetas, rowsClientes = [], nomeVendedor = '', resumo = {}) {
    return new Promise((resolve, reject) => {
        // Ordena cards por CODEPTO crescente
        const metasOrdenadas = [...rowsMetas].sort((a, b) => (a.codepto || 0) - (b.codepto || 0));

        // Ordena clientes: DTULTCOMP DESC, CODCLI ASC, CODEPTO ASC
        const clientesOrdenados = [...rowsClientes].sort((a, b) => {
            const parseDt = (s) => {
                if (!s) return '00000000';
                const p = String(s).split('/');
                return p.length === 3 ? p[2] + p[1] + p[0] : String(s).replace(/\D/g, '');
            };
            const dtA = parseDt(a.dtultcomp);
            const dtB = parseDt(b.dtultcomp);
            if (dtB !== dtA) return dtB.localeCompare(dtA);
            const codA = parseInt(a.codcli) || 0;
            const codB = parseInt(b.codcli) || 0;
            if (codA !== codB) return codA - codB;
            return (parseInt(a.codepto) || 0) - (parseInt(b.codepto) || 0);
        });

        const pageW = MARGIN * 2 + COLS * CARD_W + (COLS - 1) * GAP;
        const pageH = calcPageHeight(metasOrdenadas.length, clientesOrdenados.length);

        const doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: true });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
        doc.on('error', reject);

        // ── Fundo ──────────────────────────────────────────────────────────────
        doc.rect(0, 0, pageW, pageH).fill(BG);

        // ── Cabeçalho ──────────────────────────────────────────────────────────
        doc.rect(0, 0, pageW, HEADER + MARGIN).fill(HEADER_BG);
        doc.rect(0, 0, 4, HEADER + MARGIN).fill(BAR_OK);

        doc.fillColor(TXT_WHITE).fontSize(16).font('Helvetica-Bold')
           .text('Painel de Metas', MARGIN + 10, MARGIN + 4, { width: pageW - MARGIN * 2 });

        if (nomeVendedor) {
            doc.fillColor(BAR_OK).fontSize(9).font('Helvetica-Bold')
               .text(nomeVendedor, MARGIN + 10, MARGIN + 24, { width: pageW - MARGIN * 2 });
            doc.fillColor(TXT_DIM).fontSize(8).font('Helvetica')
               .text('Refer\u00eancia: ' + mesRef, MARGIN + 10, MARGIN + 37, { width: pageW - MARGIN * 2 });
        } else {
            doc.fillColor(TXT_DIM).fontSize(9).font('Helvetica')
               .text('Refer\u00eancia: ' + mesRef, MARGIN + 10, MARGIN + 24, { width: pageW - MARGIN * 2 });
        }

        doc.rect(MARGIN, MARGIN + HEADER - 4, pageW - MARGIN * 2, 1).fill(BORDER);

        // ══════════════════════════════════════════════════════════════════════
        //  FAIXA DE KPIs
        // ══════════════════════════════════════════════════════════════════════
        {
            const ky  = MARGIN + HEADER;           // topo da faixa
            const kw  = pageW - MARGIN * 2;        // largura total
            const nKpi = 4;                         // número de colunas
            const colW = Math.floor(kw / nKpi);

            // Fundo da faixa
            doc.rect(MARGIN, ky, kw, KPI_H).fill('#0D1117');

            // Borda superior sutil
            doc.rect(MARGIN, ky, kw, 1).fill(BORDER);
            // Borda inferior sutil
            doc.rect(MARGIN, ky + KPI_H - 1, kw, 1).fill(BORDER);

            const {
                diasRestantes  = 0,
                kgDiaNecessario = 0,
                ativosNoMes    = 0,
                totalCarteira  = 0,
                projecaoPerc   = 0,
                percMesAnt     = null,
                // rankPos     = null,  // ← ativar para exibir ranking
                // rankTotal   = null,
            } = resumo;

            // Calcula diferença de % (atual vs mês anterior)
            const percAtualTotal = metasOrdenadas.length > 0
                ? metasOrdenadas.reduce((s, r) => s + r.realizado, 0) /
                  Math.max(1, metasOrdenadas.reduce((s, r) => s + r.meta, 0)) * 100
                : 0;
            const diffMesAnt = percMesAnt != null ? percAtualTotal - percMesAnt : null;

            const kpis = [
                {
                    label:  'DIAS \u00daT. RESTANTES',
                    value:  diasRestantes + ' dias',
                    sub:    kgDiaNecessario > 0
                                ? (kgDiaNecessario).toFixed(1) + ' kg/dia \u00fatil p/ bater a meta'
                                : 'Meta ja alcancada! Parabens!',
                    color:  diasRestantes <= 3 ? '#FF7B72' : BAR_POT,
                },
                {
                    label:  'CARTEIRA ATIVA',
                    value:  ativosNoMes + ' / ' + totalCarteira,
                    sub:    totalCarteira > 0
                                ? Math.round(ativosNoMes / totalCarteira * 100) + '% dos clientes compraram'
                                : 'clientes no mês',
                    color:  TXT_WHITE,
                },
                {
                    label:  'PROJEÇÃO (RITMO ATUAL)',
                    value:  projecaoPerc.toFixed(1) + '%',
                    sub:    projecaoPerc >= 100 ? 'OK - Meta atingivel no ritmo atual' : 'ao fechar o mes',
                    color:  projecaoPerc >= 100 ? BAR_OK : projecaoPerc >= 80 ? BAR_BOOM : '#FF7B72',
                },
                {
                    label:  'MÊS ANTERIOR',
                    value:  percMesAnt != null ? percMesAnt.toFixed(1) + '%' : '—',
                    sub:    diffMesAnt != null
                                ? (diffMesAnt >= 0 ? '+' : '') + diffMesAnt.toFixed(1) + ' pp vs mês ant'
                                : 'sem meta no período',
                    color:  diffMesAnt != null
                                ? (diffMesAnt >= 0 ? BAR_OK : '#FF7B72')
                                : TXT_DIM,
                },
                // KPI de RANKING (oculto) — descomente o item abaixo para exibir:
                // {
                //     label:  'RANKING',
                //     value:  rankPos != null ? rankPos + 'º' : '—',
                //     sub:    rankPos != null ? 'entre ' + rankTotal + ' vendedores' : '',
                //     color:  rankPos === 1 ? BAR_BOOM : TXT_WHITE,
                // },
            ];

            kpis.forEach((kpi, idx) => {
                const kx = MARGIN + idx * colW;

                // Separador vertical entre colunas (exceto na última)
                if (idx > 0) {
                    doc.rect(kx, ky + 8, 0.5, KPI_H - 16).fill(BORDER);
                }

                // Rótulo superior (pequeno, dimmed)
                doc.fillColor(TXT_DIM).fontSize(6).font('Helvetica-Bold')
                   .text(kpi.label, kx + 10, ky + 8, { width: colW - 14, lineBreak: false });

                // Valor principal (destaque)
                doc.fillColor(kpi.color).fontSize(14).font('Helvetica-Bold')
                   .text(kpi.value, kx + 10, ky + 18, { width: colW - 14, lineBreak: false });

                // Sub-rótulo (pequeno, dimmed)
                doc.fillColor(TXT_DIM).fontSize(6.5).font('Helvetica')
                   .text(kpi.sub, kx + 10, ky + 37, { width: colW - 14, lineBreak: false });
            });
        }

        // ── Cards ──────────────────────────────────────────────────────────────
        const CARDS_START = MARGIN + HEADER + KPI_H + GAP;
        for (let i = 0; i < metasOrdenadas.length; i++) {
            const col  = i % COLS;
            const line = Math.floor(i / COLS);
            const cx   = MARGIN + col  * (CARD_W + GAP);
            const cy   = CARDS_START + line * (CARD_H + GAP);

            const { descricao, percFeito, meta, realizado, falta,
                    pesoPotencial, percPotencial, ganho } = metasOrdenadas[i];
            const bateu = percFeito >= 100;

            doc.roundedRect(cx, cy, CARD_W, CARD_H, RADIUS).fill(bateu ? CARD_BOOM : CARD_CLR);
            doc.roundedRect(cx, cy, CARD_W, CARD_H, RADIUS).lineWidth(0.5).stroke(bateu ? '#1E4D8C' : BORDER);
            doc.roundedRect(cx, cy, 3, CARD_H, RADIUS).fill(bateu ? BAR_BOOM : BAR_OK);

            const px   = cx + 12;
            const barW = CARD_W - 24;

            // ── Linha 1: nome do depto (esq) + % (dir) — mesma fonte ────────
            const FONT_HDR = 11; // mesma para depto e %
            doc.fillColor(bateu ? BAR_BOOM : TXT_WHITE).fontSize(FONT_HDR).font('Helvetica-Bold')
               .text(percFeito.toFixed(1) + '%', px, cy + 5, { width: barW, align: 'right', lineBreak: false });
            doc.fillColor(TXT_DIM).fontSize(FONT_HDR).font('Helvetica-Bold')
               .text(trunc(descricao, 22).toUpperCase(), px, cy + 5, { width: barW - 55, lineBreak: false });

            // Separador
            doc.rect(px, cy + 21, barW, 0.5).fill(BORDER);

            // META / REALIZADO / FALTA
            const thirdW    = Math.floor(barW / 3) - 2;
            const cols3     = [px, px + thirdW + 4, px + (thirdW + 4) * 2];
            const lbls      = ['Meta', 'Realizado', falta < 0 ? 'Acima' : 'Falta'];
            const vals      = [
                meta.toFixed(1) + ' kg',
                realizado.toFixed(1) + ' kg',
                (falta < 0 ? '+' : '') + Math.abs(falta).toFixed(1) + ' kg',
            ];
            const valColors = [TXT_WHITE, TXT_WHITE, falta < 0 ? TXT_BOOM : TXT_WHITE];
            for (let c = 0; c < 3; c++) {
                doc.fillColor(TXT_DIM).fontSize(6.5).font('Helvetica')
                   .text(lbls[c], cols3[c], cy + 25, { width: thirdW, lineBreak: false });
                doc.fillColor(valColors[c]).fontSize(7.5).font('Helvetica-Bold')
                   .text(vals[c], cols3[c], cy + 33, { width: thirdW, lineBreak: false });
            }

            // Barra REALIZADO (logo abaixo dos números)
            drawBar(doc, px, cy + 44, barW, percFeito, 'Realizado', percFeito.toFixed(1) + '%',
                bateu ? BAR_BOOM : BAR_OK);
            // barra termina em cy + 44 + 10 + 7 = cy + 61

            // Separador
            doc.rect(px, cy + 64, barW, 0.5).fill(BORDER);

            // Barra C/ POTENCIAL (próxima da barra de Realizado para comparar)
            if (pesoPotencial > 0) {
                drawBar(doc, px, cy + 68, barW, percPotencial, 'c/ Potencial',
                    percPotencial.toFixed(1) + '%', BAR_POT);
                // barra termina em cy + 68 + 10 + 7 = cy + 85
                doc.fillColor(TXT_DIM).fontSize(6.5).font('Helvetica')
                   .text('Potencial: ', px, cy + 89, { continued: true });
                doc.fillColor(BAR_POT).fontSize(6.5).font('Helvetica-Bold')
                   .text(pesoPotencial.toFixed(1) + ' kg', { continued: ganho != null });
                if (ganho != null) {
                    doc.fillColor(TXT_DIM).fontSize(6.5).font('Helvetica')
                       .text('   Ganho: ', { continued: true });
                    doc.fillColor(TXT_GAIN).fontSize(6.5).font('Helvetica-Bold')
                       .text('+' + ganho.toFixed(1) + ' pp');
                } else {
                    doc.text('');
                }
            } else {
                doc.fillColor(TXT_DIM).fontSize(6.5).font('Helvetica')
                   .text('Sem peso potencial de clientes inativos', px, cy + 70, { width: barW });
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        //  Seção Top Oportunidades
        // ══════════════════════════════════════════════════════════════════════
        if (clientesOrdenados.length > 0) {
            // Agrega peso total por cliente (vários dep. somados)
            const aggMap = {};
            for (const r of clientesOrdenados) {
                const k = String(r.codcli);
                if (!aggMap[k]) aggMap[k] = { cliente: String(r.cliente || ''), peso: 0 };
                aggMap[k].peso += parseFloat(r.peso) || 0;
            }
            const topClientes = Object.values(aggMap)
                .sort((a, b) => b.peso - a.peso)
                .slice(0, 3);

            const numLines = Math.ceil(metasOrdenadas.length / COLS);
            let ty = CARDS_START + numLines * (CARD_H + GAP) + GAP;

            // Cabeçalho da seção
            doc.rect(0, ty, pageW, 24).fill(HEADER_BG);
            doc.rect(0, ty, 4, 24).fill(BAR_BOOM);
            doc.fillColor(BAR_BOOM).fontSize(10).font('Helvetica-Bold')
               .text('TOP OPORTUNIDADES', MARGIN + 10, ty + 7, { width: 200, lineBreak: false });
            doc.fillColor(TXT_DIM).fontSize(7.5).font('Helvetica')
               .text('Clientes com maior potencial n\u00e3o comprado neste m\u00eas',
                     MARGIN + 215, ty + 8, { width: pageW - MARGIN - 220, align: 'right', lineBreak: false });
            ty += 24;

            const medals      = ['1.', '2.', '3.'];
            const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
            const PESO_X  = pageW - MARGIN - 80;

            topClientes.forEach((cli, idx) => {
                const bgClr = idx % 2 === 0 ? TBL_ODD : TBL_EVEN;
                doc.rect(MARGIN, ty, pageW - MARGIN * 2, ROW_H).fill(bgClr);
                doc.rect(MARGIN, ty + ROW_H - 0.5, pageW - MARGIN * 2, 0.5).fill(BORDER);

                // Medalha colorida (1°, 2°, 3° em dourado/prata/bronze)
                doc.fillColor(medalColors[idx]).fontSize(9).font('Helvetica-Bold')
                   .text(medals[idx], MARGIN + 6, ty + 4, { width: 22, lineBreak: false });

                // Nome do cliente
                doc.fillColor(TXT_WHITE).fontSize(8).font('Helvetica')
                   .text(trunc(cli.cliente, 52), MARGIN + 30, ty + 5,
                         { width: PESO_X - MARGIN - 36, lineBreak: false });

                // Peso potencial (destaque azul)
                doc.fillColor(BAR_POT).fontSize(8.5).font('Helvetica-Bold')
                   .text(cli.peso.toFixed(1) + ' kg', PESO_X, ty + 4,
                         { width: 76, align: 'right', lineBreak: false });

                ty += ROW_H;
            });

            // Borda inferior
            doc.rect(MARGIN, ty, pageW - MARGIN * 2, 1).fill(BORDER);
        }

        // ── Seção 2 — Tabela de Clientes ──────────────────────────────────────
        if (clientesOrdenados.length > 0) {
            const numLines = Math.ceil(metasOrdenadas.length / COLS);
            let sy = MARGIN + HEADER + KPI_H + GAP + numLines * (CARD_H + GAP) + GAP + TOP_H + GAP;

            doc.rect(0, sy, pageW, SEC2_HDR_H).fill(HEADER_BG);
            doc.rect(0, sy, 4, SEC2_HDR_H).fill(BAR_POT);
            doc.fillColor(TXT_WHITE).fontSize(13).font('Helvetica-Bold')
               .text('Clientes com Peso Potencial', MARGIN + 10, sy + 8, { width: pageW - MARGIN * 2 });
            doc.fillColor(TXT_DIM).fontSize(8).font('Helvetica')
               .text('Compraram nos \u00FAltimos 90 dias, mas ainda n\u00E3o compraram neste m\u00EAs',
                     MARGIN + 10, sy + 26, { width: pageW - MARGIN * 2 });
            sy += SEC2_HDR_H;

            doc.rect(MARGIN, sy, pageW - MARGIN * 2, TBL_HDR_H).fill(TBL_HDR);
            let hx = MARGIN;
            for (const col of TBL_COLS) {
                doc.fillColor(TXT_DIM).fontSize(7).font('Helvetica-Bold')
                   .text(col.label.toUpperCase(), hx + 4, sy + 8, { width: col.w - 6, lineBreak: false });
                hx += col.w;
            }
            sy += TBL_HDR_H;

            for (let r = 0; r < clientesOrdenados.length; r++) {
                const row   = clientesOrdenados[r];
                const bgClr = r % 2 === 0 ? TBL_ODD : TBL_EVEN;

                doc.rect(MARGIN, sy, pageW - MARGIN * 2, ROW_H).fill(bgClr);
                doc.rect(MARGIN, sy + ROW_H - 0.5, pageW - MARGIN * 2, 0.5).fill(BORDER);

                let rx = MARGIN;
                const cells = [
                    trunc(row.codcli,    6),
                    trunc(row.cliente,   38),
                    trunc(row.dtultcomp, 10),
                    trunc(row.codepto,    4),
                    trunc(row.descricao, 18),
                    parseFloat(row.peso).toFixed(1),
                ];

                for (let c = 0; c < TBL_COLS.length; c++) {
                    const colW  = TBL_COLS[c].w;
                    const align = c === TBL_COLS.length - 1 ? 'right' : 'left';
                    const xOff  = c === TBL_COLS.length - 1 ? 0 : 4;
                    doc.fillColor(c === 0 ? TXT_DIM : TXT_WHITE).fontSize(7).font('Helvetica')
                       .text(cells[c], rx + xOff, sy + 5, { width: colW - 6, align, lineBreak: false });
                    rx += colW;
                }
                sy += ROW_H;
            }

            doc.rect(MARGIN, sy, pageW - MARGIN * 2, 1).fill(BORDER);
        }

        doc.end();
    });
}

module.exports = { gerarImagemMetas };

const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const oraclePool = require('../services/oraclePool');
const OpenAI = require('openai');

router.get('/sac-vendedor', async (req, res) => {
    const { codusur, dataInicio, dataFim } = req.query;
    if (!dataInicio || !dataFim) {
        return res.status(400).json({ success: false, error: 'Parâmetros obrigatórios.' });
    }

    let conn;
    try {
        conn = await oraclePool.getConnection();
        let sql = `
            SELECT 
                t.ID, t.CODCLI, NVL(c.FANTASIA, c.CLIENTE) as NOME_CLIENTE,
                t.CRIADO_EM, t.DATA_RESOLUCAO,
                d.NOME as DEPARTAMENTO, p.NOME as PAI_NOME,
                t.NOTA_AVALIACAO,
                CAST(NVL(t.DATA_RESOLUCAO, SYSDATE) AS DATE) - CAST(t.CRIADO_EM AS DATE) as TEMPO_TOTAL
            FROM CANAL_SAC_TICKETS t
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
            LEFT JOIN PCCLIENT c ON c.CODCLI = t.CODCLI
            WHERE t.CRIADO_EM BETWEEN TO_TIMESTAMP(:di, 'YYYY-MM-DD HH24:MI:SS') 
                                  AND TO_TIMESTAMP(:df, 'YYYY-MM-DD HH24:MI:SS')
        `;
        
        const binds = {
            di: `${dataInicio} 00:00:00`, 
            df: `${dataFim} 23:59:59` 
        };

        if (codusur) {
            sql += ` AND c.CODUSUR1 = :codusur`;
            binds.codusur = codusur;
        }

        sql += ` ORDER BY t.CRIADO_EM DESC`;

        const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        let sqlEvolutivo = `
            SELECT 
                TO_CHAR(t.CRIADO_EM, 'YYYY-MM') as MES,
                NVL(d.NOME, 'Sem Departamento') as DEPARTAMENTO,
                COUNT(t.ID) as TOTAL_TICKETS,
                ROUND(AVG(t.NOTA_AVALIACAO), 2) as MEDIA_AVALIACAO
            FROM CANAL_SAC_TICKETS t
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
            LEFT JOIN PCCLIENT c ON c.CODCLI = t.CODCLI
            WHERE t.CRIADO_EM >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -11)
        `;
        const bindsEvolutivo = {};
        if (codusur) {
            sqlEvolutivo += ` AND c.CODUSUR1 = :codusur`;
            bindsEvolutivo.codusur = codusur;
        }
        sqlEvolutivo += ` GROUP BY TO_CHAR(t.CRIADO_EM, 'YYYY-MM'), d.NOME ORDER BY MES ASC`;

        const resultEvolutivo = await conn.execute(sqlEvolutivo, bindsEvolutivo, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        let nomeVendedor = 'Todos';
        if (codusur) {
            const resultVendedor = await conn.execute(
                `SELECT NOME FROM PCUSUARI WHERE CODUSUR = :codusur`, 
                { codusur }, 
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (resultVendedor.rows.length > 0) {
                nomeVendedor = resultVendedor.rows[0].NOME;
            }
        }

        res.json({ success: true, tickets: result.rows, evolutivo: resultEvolutivo.rows, nomeVendedor });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Erro ao buscar relatório.' });
    } finally {
        if (conn) await conn.close();
    }
});

router.post('/analise-performance', async (req, res) => {
    const { dados, codusur } = req.body;
    
    try {
        let conn = await oraclePool.getConnection();
        const configRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
        const apiKey = configRes.rows.length > 0 ? configRes.rows[0][0] : process.env.GROQ_API_KEY;
        await conn.close();

        if (!apiKey) throw new Error('API Key não configurada');

        const openai = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
        
        const dadosResumidos = dados.map(t => ({
            d: t.DEPARTAMENTO,
            n: t.NOTA_AVALIACAO,
            t: t.TEMPO_TOTAL ? Number(t.TEMPO_TOTAL).toFixed(1) : null
        })).slice(0, 500); // Limit to 500 tickets to prevent payload overflow
        
        const prompt = `Analise o desempenho do vendedor ${codusur} com base nestes tickets SAC (amostra/resumo): ${JSON.stringify(dadosResumidos)}. Foque em agilidade de atendimento (t=dias), qualidade (n=notas) e pontos de melhoria no pós-venda por departamento (d). Apresente o resultado em Markdown, estruturando o texto com Títulos (##), listas ( - ) e palavras em negrito para facilitar a leitura. Seja direto e evite saudações iniciais.`;

        const completion = await openai.chat.completions.create({
            model: "groq/compound",
            messages: [{ role: "user", content: prompt }]
        });

        res.json({ success: true, analise: completion.choices[0].message.content });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Erro na IA.' });
    }
});

module.exports = router;

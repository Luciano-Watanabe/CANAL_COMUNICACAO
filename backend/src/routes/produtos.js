const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const cacheService = require('../services/cacheService');

router.get('/imagem/:codprod', (req, res) => {
    const { codprod } = req.params;
    const imagesDir = process.env.IMAGES_DIR || path.join(__dirname, '../../imagens_produtos');
    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'];

    if (!fs.existsSync(imagesDir)) {
        return res.status(404).json({ success: false, error: 'Diretório de imagens não configurado/encontrado.' });
    }

    for (let ext of extensions) {
        const filePath = path.join(imagesDir, `${codprod}${ext}`);
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
    }
    
    return res.status(404).json({ success: false, error: 'Imagem não encontrada' });
});

router.get('/mix/:codcli', async (req, res) => {
    const isCacheLoading = !cacheService.isLoaded;

    const { codcli } = req.params;
    if (!codcli || codcli === 'null' || codcli === 'undefined' || isNaN(Number(codcli))) {
        return res.status(400).json({ success: false, error: 'Código de cliente inválido' });
    }
    let conn;

    try {
        console.log(`[MIX] Recebeu pedido para codcli: "${codcli}"`);
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Primeiro, busca a atividade do cliente
        const resCli = await conn.execute(`SELECT CODATV1 FROM PCCLIENT WHERE CODCLI = :codcli`, [codcli]);
        console.log(`[MIX] Resultado busca cliente ${codcli}:`, resCli.rows);
        if (resCli.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        }

        const codatv1 = resCli.rows[0] ? resCli.rows[0][0] : null;

        let mixCache = [];
        if (codatv1) {
            mixCache = cacheService.getMixAtividade(codatv1);
        }

        if (!mixCache || mixCache.length === 0) {
            // Fallback para todos os produtos com estoque (Mix Geral)
            mixCache = cacheService.getMixGeral();
        }

        if (!mixCache || mixCache.length === 0) {
            return res.json({ success: true, mix: [] }); 
        }

        // Busca apenas o que o cliente atual comprou no último ano
        const sqlClient = `
            SELECT M.CODPROD, SUM(M.QT) AS QTD_CLIENTE, MAX(M.DTMOV) AS ULTIMA_COMPRA
            FROM PCMOV M
            WHERE M.CODCLI = :codcli AND M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 365
            GROUP BY M.CODPROD
        `;
        const resClient = await conn.execute(sqlClient, { codcli });

        const clientPurchases = {};
        for (const r of resClient.rows) {
            clientPurchases[String(r[0])] = {
                qtdCliente: r[1],
                ultimaCompra: r[2]
            };
        }

        const finalMix = mixCache.map(m => {
            const clientInfo = clientPurchases[String(m.CODPROD)] || { qtdCliente: 0, ultimaCompra: null };
            const qtdCliente = clientInfo.qtdCliente;
            const qtdClientesAtividade = m.QTD_CLIENTES_COMPRARAM || 1;
            const mediaAtividade = m.QTD_TOTAL / qtdClientesAtividade;

            return {
                codprod: m.CODPROD,
                descricao: m.DESCRICAO,
                codepto: m.CODEPTO,
                departamento: m.DEPARTAMENTO || 'SEM DEPARTAMENTO',
                preco: m.PVENDA,
                qtdCliente,
                ultimaCompra: clientInfo.ultimaCompra ? new Date(clientInfo.ultimaCompra).toISOString() : null,
                ean: m.EAN,
                qtunit: m.QTUNIT,
                fatopreco: m.FATOPRECO,
                unidade: m.UNIDADE_EMB || '',
                tipoembalagem: m.TIPOEMBALAGEM || 'U',
                sinais: {
                    jaComprou: qtdCliente > 0,
                    compraMuito: qtdCliente >= mediaAtividade,
                    sugerir: qtdCliente === 0 && qtdClientesAtividade > 1
                }
            };
        });

        res.json({ success: true, mix: finalMix, isCacheLoading });
    } catch (err) {
        console.error('Erro ao buscar mix:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) { }
        }
    }
});

module.exports = router;

// Endpoint para Cross-sell ("Compre Junto")
router.get('/:codprod/cross-sell', async (req, res) => {
    const { codprod } = req.params;
    let conn;

    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Busca produtos comprados nos mesmos pedidos que o CODPROD fornecido (últimos 180 dias)
        const sql = `
            SELECT 
                M2.CODPROD, 
                MAX(P.DESCRICAO) AS DESCRICAO,
                MAX(NVL(PR.PVENDA, 0)) AS PVENDA,
                COUNT(DISTINCT M2.NUMPED) AS FREQUENCIA,
                MAX(PE.CODAUXILIAR) AS EAN,
                MAX(PE.QTUNIT) AS QTUNIT,
                MAX(NVL(PE.FATORPRECO, 1)) AS FATOPRECO,
                MAX(PE.UNMEDIDA) AS UNIDADE,
                MAX(PE.TIPOEMBALAGEM) AS TIPOEMBALAGEM
            FROM PCMOV M1
            JOIN PCMOV M2 ON M1.NUMPED = M2.NUMPED AND M1.CODPROD <> M2.CODPROD
            JOIN PCPRODUT P ON P.CODPROD = M2.CODPROD
            LEFT JOIN PCTABPR PR ON PR.CODPROD = M2.CODPROD AND PR.NUMREGIAO = 1
            LEFT JOIN PCEMBALAGEM PE ON PE.CODPROD = M2.CODPROD AND NVL(PE.ENVIAFV, 'N') = 'S' AND PE.DTINATIVO IS NULL
            WHERE M1.CODPROD = :codprod
              AND M1.DTMOV >= SYSDATE - 180
              AND M1.CODOPER = 'S' AND M2.CODOPER = 'S'
            GROUP BY M2.CODPROD
            ORDER BY FREQUENCIA DESC
            FETCH FIRST 10 ROWS ONLY
        `;

        const result = await conn.execute(sql, { codprod });

        const sugestoes = result.rows.map(row => ({
            codprod: row.CODPROD ?? row.codprod ?? row[0],
            descricao: row.DESCRICAO ?? row.descricao ?? row[1],
            preco: row.PVENDA ?? row.pvenda ?? row[2],
            frequencia: row.FREQUENCIA ?? row.frequencia ?? row[3],
            ean: row.EAN ?? row.ean ?? row[4],
            qtunit: row.QTUNIT ?? row.qtunit ?? row[5],
            fatopreco: row.FATOPRECO ?? row.fatopreco ?? row[6],
            unidade: row.UNIDADE ?? row.unidade ?? row[7],
            tipoembalagem: row.TIPOEMBALAGEM ?? row.tipoembalagem ?? row[8] ?? 'U'
        }));

        res.json({ success: true, sugestoes });
    } catch (err) {
        console.error('Erro ao buscar cross-sell:', err);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
});

// Rota para buscar CODAUXILIAR (EAN) de uma lista de produtos na PCEMBALAGEM
router.post('/eans', async (req, res) => {
    const { codprods } = req.body; // array de números
    if (!Array.isArray(codprods) || codprods.length === 0) {
        return res.json({ success: true, eans: {} });
    }

    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Para cada produto, pega o CODAUXILIAR priorizando embalagem FV ativa,
        // com fallback para qualquer embalagem ativa
        const binds = codprods.map((_, i) => `:p${i}`).join(',');
        const bindObj = {};
        codprods.forEach((c, i) => { bindObj[`p${i}`] = c; });

        const sql = `
            SELECT CODPROD, CODAUXILIAR
            FROM (
                SELECT CODPROD, CODAUXILIAR,
                    ROW_NUMBER() OVER (
                        PARTITION BY CODPROD 
                        ORDER BY 
                            CASE WHEN NVL(ENVIAFV, 'N') = 'S' THEN 0 ELSE 1 END,
                            QTUNIT DESC
                    ) AS RN
                FROM PCEMBALAGEM
                WHERE CODPROD IN (${binds})
                  AND DTINATIVO IS NULL
                  AND CODAUXILIAR IS NOT NULL
                  AND TRIM(TO_CHAR(CODAUXILIAR)) != '0'
            )
            WHERE RN = 1
        `;

        const result = await conn.execute(sql, bindObj);

        const eans = {};
        result.rows.forEach(row => {
            const codprod = row[0] ?? row.CODPROD;
            const ean = row[1] ?? row.CODAUXILIAR;
            if (codprod && ean) eans[String(codprod)] = String(ean).trim();
        });

        res.json({ success: true, eans });
    } catch (err) {
        console.error('Erro ao buscar EANs:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar EANs' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
});

module.exports = router;

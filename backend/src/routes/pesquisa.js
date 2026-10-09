const express = require('express');
const router = express.Router();
const oraclePool = require('../services/oraclePool');
const PesquisaBotService = require('../services/PesquisaBotService');

// GET /api/pesquisa - Buscar relatorio de pesquisa de precos
router.get('/', async (req, res) => {
    let connection;
    try {
        const { dataInicio, dataFim, local, produto, ean } = req.query;
        
        connection = await oraclePool.getConnection();
        
        let sql = `
            SELECT 
                ID, 
                DATA_HORA, 
                TELEFONE_REMETENTE, 
                LOCAL, 
                CODCONCOR,
                PRODUTO_NOME, 
                EAN, 
                CODPROD, 
                PRECO_ENCONTRADO, 
                PRECO_TABELA, 
                CUSTO, 
                IMAGEM_URL,
                CODUSUR,
                NUMCOTA,
                STATUS_INTEGRACAO,
                DATA_INTEGRACAO
            FROM CANAL_PESQUISA_PRECO
            WHERE 1=1
        `;
        const params = {};

        if (dataInicio && dataFim) {
            sql += ` AND DATA_HORA BETWEEN TO_TIMESTAMP(:dataInicio, 'YYYY-MM-DD HH24:MI:SS') AND TO_TIMESTAMP(:dataFim, 'YYYY-MM-DD HH24:MI:SS')`;
            params.dataInicio = `${dataInicio} 00:00:00`;
            params.dataFim = `${dataFim} 23:59:59`;
        }
        
        if (local) {
            sql += ` AND UPPER(LOCAL) LIKE UPPER(:local)`;
            params.local = `%${local}%`;
        }

        if (produto) {
            sql += ` AND UPPER(PRODUTO_NOME) LIKE UPPER(:produto)`;
            params.produto = `%${produto}%`;
        }

        if (ean) {
            sql += ` AND EAN = :ean`;
            params.ean = ean;
        }

        sql += ` ORDER BY DATA_HORA DESC`;

        const result = await connection.execute(sql, params, { outFormat: 4002 /* OBJECT */ });
        
        res.json({ success: true, dados: result.rows });
    } catch (err) {
        console.error('Erro ao buscar pesquisa de preços:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar relatorio.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/pesquisa/concorrentes - Buscar lista de concorrentes da PCCONCOR
router.get('/concorrentes', async (req, res) => {
    let connection;
    try {
        const { termo } = req.query;
        connection = await oraclePool.getConnection();
        let list = [];
        if (termo) {
            const pbService = new PesquisaBotService(null);
            const rawList = await pbService.consultarConcorrentes(termo, connection);
            list = rawList.map(r => ({
                CODCONCOR: String(r.codconcor),
                CONCORRENTE: r.nome
            }));
        } else {
            const resConcor = await connection.execute(
                `SELECT CODCONC, CONCORRENTE FROM PCCONCOR ORDER BY CONCORRENTE`
            );
            if (resConcor && resConcor.rows) {
                list = resConcor.rows.map(r => {
                    if (Array.isArray(r)) {
                        return {
                            CODCONCOR: String(r[0]),
                            CONCORRENTE: (r[1] || '').trim()
                        };
                    }
                    return {
                        CODCONCOR: String(r.CODCONC || r.CODCONCOR || r.codconcor),
                        CONCORRENTE: (r.CONCORRENTE || r.nome || '').trim()
                    };
                });
            }
        }
        console.log(`[PESQUISA-API] Concorrentes retornados: ${list.length}`);
        res.json({ success: true, concorrentes: list });
    } catch (err) {
        console.error('Erro ao buscar concorrentes:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar concorrentes: ' + err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/pesquisa/produtos-busca - Buscar produtos por código ou descrição no WinThor
router.get('/produtos-busca', async (req, res) => {
    let connection;
    try {
        const { termo } = req.query;
        if (!termo || termo.trim().length < 2) {
            return res.json({ success: true, produtos: [] });
        }

        connection = await oraclePool.getConnection();
        const regiao = Number(process.env.TABPR_NUMREGIAO || 1);
        const termoLimpo = termo.trim();
        const termoSemAcento = termoLimpo.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const sql = `
            SELECT 
                P.CODPROD, 
                P.DESCRICAO, 
                P.EMBALAGEM, 
                P.UNIDADE, 
                MAX(PR.PTABELA) AS PRECO_TABELA, 
                MAX(PE.CODAUXILIAR) AS EAN
            FROM PCPRODUT P
            LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = :regiao
            LEFT JOIN PCEMBALAGEM PE ON PE.CODPROD = P.CODPROD
            WHERE (
                TO_CHAR(P.CODPROD) = :tExact
                OR UPPER(P.DESCRICAO) LIKE UPPER(:tLike1)
                OR UPPER(P.DESCRICAO) LIKE UPPER(:tLike2)
                OR TO_CHAR(PE.CODAUXILIAR) = :tExact
            )
            GROUP BY P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE
            ORDER BY P.DESCRICAO
            FETCH FIRST 25 ROWS ONLY
        `;

        const result = await connection.execute(sql, {
            regiao,
            tExact: termoLimpo,
            tLike1: `%${termoLimpo}%`,
            tLike2: `%${termoSemAcento}%`
        }, { outFormat: 4002 /* OBJECT */ });

        res.json({ success: true, produtos: result.rows });
    } catch (err) {
        console.error('Erro ao buscar produtos no WinThor:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar produtos no WinThor.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// DELETE /api/pesquisa/:id - Opcional: apagar registro errado e sua cotação correspondente
router.delete('/:id', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();
        const resRec = await connection.execute(
            `SELECT NUMCOTA FROM CANAL_PESQUISA_PRECO WHERE ID = :id`,
            { id: req.params.id },
            { outFormat: 4002 }
        );
        const numcota = resRec.rows[0]?.NUMCOTA;
        if (numcota) {
            try {
                await connection.execute(`DELETE FROM PCCOTA WHERE CODCOTACAO = :numcota`, { numcota }, { autoCommit: true });
                console.log(`[PESQUISA-API] Cotação #${numcota} removida da PCCOTA na exclusão da pesquisa #${req.params.id}`);
            } catch (errCota) {
                console.warn('[PESQUISA-API] Aviso ao excluir cotação da PCCOTA:', errCota.message);
            }
        }
        await connection.execute(`DELETE FROM CANAL_PESQUISA_PRECO WHERE ID = :id`, { id: req.params.id }, { autoCommit: true });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao apagar registro:', err);
        res.status(500).json({ success: false, message: 'Erro ao apagar.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// PUT /api/pesquisa/:id/vincular - Vincular EAN ou CODPROD manualmente (com atualização de cotação existente)
router.put('/:id/vincular', async (req, res) => {
    let connection;
    try {
        const { ean, codprod } = req.body;
        const { id } = req.params;

        if (!ean && !codprod && !req.body.codconcor) {
            return res.status(400).json({ success: false, message: 'Informe um EAN, Cód. Produto ou Concorrente.' });
        }

        connection = await oraclePool.getConnection();
        const pbService = new PesquisaBotService(null);
        
        let foundInfo = null;
        let finalEan = ean;

        // Se mandou EAN tenta buscar pelo EAN
        if (ean) {
            foundInfo = await pbService.buscarPrecoWinThor(ean, connection);
        } else if (codprod) {
            // Se mandou codprod, vamos achar o EAN (CODAUXILIAR) dele
            const sqlEmbalagem = `
                SELECT E.CODAUXILIAR 
                FROM PCEMBALAGEM E
                WHERE E.CODPROD = :codprod AND ROWNUM = 1
            `;
            const resEmb = await connection.execute(sqlEmbalagem, { codprod });
            if (resEmb.rows.length > 0) {
                finalEan = resEmb.rows[0][0];
                foundInfo = await pbService.buscarPrecoWinThor(finalEan, connection);
            } else {
                // Tenta achar apenas usando o codprod mesmo (buscar o preço/custo dele direto)
                const filial = process.env.ESTOQUE_CODFILIAL || '1';
                const regiao = process.env.TABPR_NUMREGIAO || '1';

                const sqlProd = `SELECT DESCRICAO FROM PCPRODUT WHERE CODPROD = :codprod`;
                const resProd = await connection.execute(sqlProd, { codprod });
                let descricao = resProd.rows.length > 0 ? resProd.rows[0][0] : null;

                let preco = null;
                const sqlPreco = `SELECT PTABELA FROM PCTABPR WHERE CODPROD = :codprod AND NUMREGIAO = :regiao`;
                const resPreco = await connection.execute(sqlPreco, { codprod, regiao });
                if (resPreco.rows.length > 0) preco = resPreco.rows[0][0];

                let custo = null;
                const sqlCusto = `SELECT CUSTOFIN FROM PCEST WHERE CODPROD = :codprod AND CODFILIAL = :filial`;
                const resCusto = await connection.execute(sqlCusto, { codprod, filial });
                if (resCusto.rows.length > 0) custo = resCusto.rows[0][0];

                if (descricao) {
                    foundInfo = { codprod, descricao, preco, custo };
                }
            }
        }

        // Buscar dados do registro atual
        const resRec = await connection.execute(
            `SELECT CODCONCOR, CODPROD, PRECO_ENCONTRADO, CODUSUR, LOCAL, NUMCOTA FROM CANAL_PESQUISA_PRECO WHERE ID = :id`,
            { id },
            { outFormat: 4002 }
        );
        const recAtual = resRec.rows[0] || {};

        if (!foundInfo && !req.body.codconcor && !recAtual.CODPROD) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado no WinThor com este código.' });
        }

        let targetCodconcor = req.body.codconcor !== undefined ? req.body.codconcor : recAtual.CODCONCOR;
        let targetLocal = req.body.local !== undefined ? req.body.local : recAtual.LOCAL;
        let targetCodprod = foundInfo ? foundInfo.codprod : (req.body.codprod ? Number(req.body.codprod) : recAtual.CODPROD);
        let precoEncontrado = recAtual.PRECO_ENCONTRADO;
        let existingNumcota = recAtual.NUMCOTA;

        let numcota = existingNumcota;
        let statusIntegracao = existingNumcota ? 'INTEGRADO' : 'PENDENTE';

        // Atualiza a cotação existente na PCCOTA ou cria somente se não existir
        if (targetCodprod && targetCodconcor && precoEncontrado) {
            numcota = await pbService.gravarCotacaoPCCOTA({
                codconcor: targetCodconcor,
                codprod: targetCodprod,
                preco: precoEncontrado,
                codusur: recAtual.CODUSUR,
                numcota: existingNumcota,
                conn: connection
            });
            if (numcota) {
                statusIntegracao = 'INTEGRADO';
            }
        }

        const updateSql = `
            UPDATE CANAL_PESQUISA_PRECO 
            SET EAN = NVL(:ean, EAN), 
                CODPROD = NVL(:codprod, CODPROD), 
                PRECO_TABELA = NVL(:preco_tab, PRECO_TABELA), 
                CUSTO = NVL(:custo, CUSTO),
                PRODUTO_NOME = NVL(:nome_prod, PRODUTO_NOME),
                CODCONCOR = NVL(:codconcor, CODCONCOR),
                LOCAL = NVL(:local, LOCAL),
                NUMCOTA = NVL(:numcota, NUMCOTA),
                STATUS_INTEGRACAO = :status_int,
                DATA_INTEGRACAO = ${numcota ? 'SYSDATE' : 'DATA_INTEGRACAO'}
            WHERE ID = :id
        `;
        const params = {
            ean: finalEan || null,
            codprod: targetCodprod || null,
            preco_tab: foundInfo ? foundInfo.preco : null,
            custo: foundInfo ? foundInfo.custo : null,
            nome_prod: foundInfo ? foundInfo.descricao : null,
            codconcor: targetCodconcor || null,
            local: targetLocal || null,
            numcota: numcota || null,
            status_int: statusIntegracao,
            id
        };

        await connection.execute(updateSql, params, { autoCommit: true });
        res.json({ 
            success: true, 
            message: numcota ? 'Produto vinculado e cotação sincronizada na PCCOTA com sucesso!' : 'Vinculado com sucesso!', 
            dados: foundInfo,
            numcota,
            statusIntegracao
        });
        
    } catch (err) {
        console.error('Erro ao vincular produto:', err);
        res.status(500).json({ success: false, message: 'Erro ao vincular produto: ' + err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/pesquisa/duplicados-pccota - Diagnóstico de cotações duplicadas na PCCOTA
router.get('/duplicados-pccota', async (req, res) => {
    let connection;
    try {
        const dias = parseInt(req.query.dias, 10) || 7;
        connection = await oraclePool.getConnection();
        const sql = `
            SELECT 
                CODFILIAL, 
                CODCONC, 
                CODPROD, 
                TO_CHAR(DATA, 'YYYY-MM-DD') AS DATA_COTA, 
                COUNT(*) AS QTD_DUPLICADAS, 
                MIN(CODCOTACAO) AS MENOR_CODCOTACAO, 
                MAX(CODCOTACAO) AS MAIOR_CODCOTACAO
            FROM PCCOTA
            WHERE DATA >= TRUNC(SYSDATE) - :dias
            GROUP BY CODFILIAL, CODCONC, CODPROD, TO_CHAR(DATA, 'YYYY-MM-DD')
            HAVING COUNT(*) > 1
            ORDER BY DATA_COTA DESC, CODPROD
        `;
        const result = await connection.execute(sql, { dias }, { outFormat: 4002 });
        res.json({ success: true, diasVerificados: dias, totalGrupos: result.rows.length, duplicados: result.rows });
    } catch (err) {
        console.error('Erro ao verificar duplicados na PCCOTA:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// POST /api/pesquisa/limpar-duplicados-pccota - Limpar registros duplicados na PCCOTA mantendo o mais recente
router.post('/limpar-duplicados-pccota', async (req, res) => {
    let connection;
    try {
        const dias = parseInt(req.query.dias || (req.body && req.body.dias), 10) || 7;
        connection = await oraclePool.getConnection();
        
        // 1. Identificar registros duplicados mantendo o MAX(CODCOTACAO)
        const dupesRes = await connection.execute(`
            SELECT 
                CODFILIAL, 
                CODCONC, 
                CODPROD, 
                TO_CHAR(DATA, 'YYYY-MM-DD') AS DATA_STR, 
                MIN(CODCOTACAO) AS MENOR_COD, 
                MAX(CODCOTACAO) AS MAIOR_COD
            FROM PCCOTA
            WHERE DATA >= TRUNC(SYSDATE) - :dias
            GROUP BY CODFILIAL, CODCONC, CODPROD, TO_CHAR(DATA, 'YYYY-MM-DD')
            HAVING COUNT(*) > 1
        `, { dias }, { outFormat: 4002 });

        let totalRemovidos = 0;

        for (const d of dupesRes.rows) {
            const menor = d.MENOR_COD;
            const maior = d.MAIOR_COD;

            // Re-aponta na CANAL_PESQUISA_PRECO qualquer referência do menor para o maior
            await connection.execute(`
                UPDATE CANAL_PESQUISA_PRECO 
                SET NUMCOTA = :maior 
                WHERE NUMCOTA = :menor
            `, { maior, menor });

            // Remove o duplicado mais antigo da PCCOTA
            const delRes = await connection.execute(`
                DELETE FROM PCCOTA 
                WHERE CODFILIAL = :filial 
                  AND CODCONC = :conc 
                  AND CODPROD = :prod 
                  AND TO_CHAR(DATA, 'YYYY-MM-DD') = :dataStr 
                  AND CODCOTACAO < :maior
            `, {
                filial: d.CODFILIAL,
                conc: d.CODCONC,
                prod: d.CODPROD,
                dataStr: d.DATA_STR,
                maior
            });

            totalRemovidos += (delRes.rowsAffected || 0);
        }

        await connection.commit();
        res.json({ 
            success: true, 
            message: `Deduplicação concluída! ${totalRemovidos} registros duplicados foram limpos da PCCOTA.`,
            diasVerificados: dias,
            gruposAfetados: dupesRes.rows.length,
            totalRemovidos
        });

    } catch (err) {
        console.error('Erro ao limpar duplicados na PCCOTA:', err);
        res.status(500).json({ success: false, message: 'Erro ao limpar duplicados: ' + err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

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
                PRODUTO_NOME, 
                EAN, 
                CODPROD, 
                PRECO_ENCONTRADO, 
                PRECO_TABELA, 
                CUSTO, 
                IMAGEM_URL,
                CODUSUR
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

// DELETE /api/pesquisa/:id - Opcional: apagar registro errado
router.delete('/:id', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();
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

// PUT /api/pesquisa/:id/vincular - Vincular EAN ou CODPROD manualmente
router.put('/:id/vincular', async (req, res) => {
    let connection;
    try {
        const { ean, codprod } = req.body;
        const { id } = req.params;

        if (!ean && !codprod) {
            return res.status(400).json({ success: false, message: 'Informe um EAN ou Cód. Produto.' });
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

        if (!foundInfo) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado no WinThor com este código.' });
        }

        const updateSql = `
            UPDATE CANAL_PESQUISA_PRECO 
            SET EAN = :ean, 
                CODPROD = :codprod, 
                PRECO_TABELA = :preco_tab, 
                CUSTO = :custo,
                PRODUTO_NOME = :nome_prod
            WHERE ID = :id
        `;
        const params = {
            ean: finalEan || null,
            codprod: foundInfo.codprod || null,
            preco_tab: foundInfo.preco || null,
            custo: foundInfo.custo || null,
            nome_prod: foundInfo.descricao || null,
            id
        };

        await connection.execute(updateSql, params, { autoCommit: true });
        res.json({ success: true, message: 'Produto vinculado com sucesso!', dados: foundInfo });
        
    } catch (err) {
        console.error('Erro ao vincular produto:', err);
        res.status(500).json({ success: false, message: 'Erro ao vincular produto.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

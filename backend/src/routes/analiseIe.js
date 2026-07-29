const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const axios = require('axios');

// GET /api/analise-ie
router.get('/', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Traz apenas as IEs problemáticas (BAIXADA, DESATUALIZADA, CNPJ INVALIDO, ERRO)
        const sql = `
            SELECT 
                A.CODCLI, 
                C.CLIENTE, 
                A.CNPJ, 
                A.IE_SISTEMA,
                A.UF_SISTEMA,
                A.SITUACAO_IE, 
                A.IE_NOVA,
                A.DATA_ATUALIZACAO,
                C.CODUSUR1 AS VENDEDOR
            FROM CANAL_ANALISE_IE A
            JOIN PCCLIENT C ON A.CODCLI = C.CODCLI
            WHERE A.SITUACAO_IE <> 'ATIVA'
            ORDER BY A.DATA_ATUALIZACAO DESC
        `;
        
        const result = await connection.execute(sql);

        const analises = result.rows.map(r => ({
            codcli: r[0],
            cliente: r[1],
            cnpj: r[2],
            ie_sistema: r[3],
            uf_sistema: r[4],
            situacao: r[5],
            ie_nova: r[6],
            data_atualizacao: r[7],
            vendedor: r[8]
        }));

        return res.json({ success: true, analises });
    } catch (error) {
        console.error('Erro ao buscar analises IE:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar análises de IE.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// GET /api/analise-ie/status
router.get('/status', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const resultAnalisados = await connection.execute(`SELECT COUNT(*) FROM CANAL_ANALISE_IE`);
        const resultAtivas = await connection.execute(`SELECT COUNT(*) FROM CANAL_ANALISE_IE WHERE SITUACAO_IE = 'ATIVA'`);
        const resultComProblema = await connection.execute(`SELECT COUNT(*) FROM CANAL_ANALISE_IE WHERE SITUACAO_IE <> 'ATIVA'`);

        return res.json({
            success: true,
            totalAnalisados: resultAnalisados.rows[0][0],
            ativas: resultAtivas.rows[0][0],
            comProblema: resultComProblema.rows[0][0]
        });
    } catch (error) {
        console.error('Erro ao buscar status IE:', error);
        return res.status(500).json({ success: false, message: 'Erro ao buscar status' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// POST /api/analise-ie/reconsultar
router.post('/reconsultar', async (req, res) => {
    const { codcli, cnpj, ie_sistema, uf_sistema } = req.body;
    if (!codcli || !cnpj || !ie_sistema || !uf_sistema) {
        return res.status(400).json({ success: false, message: 'codcli, cnpj, ie_sistema e uf_sistema são obrigatórios.' });
    }

    let connection;
    try {
        const apenasNumerosCNPJ = String(cnpj).replace(/\D/g, '');
        const apenasNumerosIE = String(ie_sistema).replace(/\D/g, '');

        let novaSituacao = 'ERRO NA CONSULTA';
        let novaIe = null;

        try {
            const apiRes = await axios.get(`https://publica.cnpj.ws/cnpj/${apenasNumerosCNPJ}`, { timeout: 10000 });
            
            if (apiRes.data && apiRes.data.estabelecimento && apiRes.data.estabelecimento.inscricoes_estaduais) {
                const ies = apiRes.data.estabelecimento.inscricoes_estaduais;
                const ieNoEstado = ies.find(i => i.estado.sigla === uf_sistema);
                
                if (ieNoEstado) {
                    const ieApiFormatada = String(ieNoEstado.inscricao_estadual).replace(/\D/g, '');
                    if (ieApiFormatada === apenasNumerosIE) {
                        novaSituacao = ieNoEstado.ativo ? 'ATIVA' : 'BAIXADA';
                    } else {
                        novaSituacao = ieNoEstado.ativo ? 'DESATUALIZADA' : 'BAIXADA (E DESATUALIZADA)';
                        novaIe = ieNoEstado.inscricao_estadual;
                    }
                } else {
                    novaSituacao = 'NENHUMA IE NO ESTADO';
                }
            } else {
                novaSituacao = 'SEM INSCRIÇÕES ESTADUAIS';
            }
        } catch (apiErr) {
            if (apiErr.response && apiErr.response.status === 404) {
                novaSituacao = 'CNPJ NÃO ENCONTRADO';
            } else if (apiErr.response && apiErr.response.status === 429) {
                novaSituacao = 'LIMITE DE REQUISIÇÕES ATINGIDO';
            } else {
                console.error('Erro na API publica.cnpj.ws:', apiErr.message);
            }
        }

        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Atualiza banco
        await connection.execute(`
            UPDATE CANAL_ANALISE_IE
            SET SITUACAO_IE = :situacao,
                IE_NOVA = :novaIe,
                ATUALIZADO_POR = 'MANUAL',
                DATA_ATUALIZACAO = SYSDATE
            WHERE CODCLI = :codcli
        `, {
            situacao: novaSituacao,
            novaIe: novaIe,
            codcli: codcli
        }, { autoCommit: true });

        // Retorna pro front os novos dados
        const result = await connection.execute(`
            SELECT 
                A.CODCLI, C.CLIENTE, A.CNPJ, A.IE_SISTEMA, A.UF_SISTEMA, A.SITUACAO_IE, A.IE_NOVA, A.DATA_ATUALIZACAO, C.CODUSUR1 AS VENDEDOR
            FROM CANAL_ANALISE_IE A
            JOIN PCCLIENT C ON A.CODCLI = C.CODCLI
            WHERE A.CODCLI = :codcli
        `, { codcli });

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Registro não encontrado após update.' });
        }

        const r = result.rows[0];
        const analiseAtualizada = {
            codcli: r[0],
            cliente: r[1],
            cnpj: r[2],
            ie_sistema: r[3],
            uf_sistema: r[4],
            situacao: r[5],
            ie_nova: r[6],
            data_atualizacao: r[7],
            vendedor: r[8]
        };

        return res.json({ success: true, analise: analiseAtualizada });

    } catch (error) {
        console.error('Erro reconsultar IE:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao reconsultar.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

module.exports = router;

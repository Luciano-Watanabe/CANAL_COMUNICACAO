const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const axios = require('axios');

// Desempenho do Vendedor
router.get('/desempenho/:codusur', async (req, res) => {
    const { codusur } = req.params;
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sqlVisitas = `
            SELECT 
                SUM(CASE WHEN TRUNC(DATA_AGENDADA) >= TRUNC(SYSDATE) - 7 THEN 1 ELSE 0 END) AS AGENDADAS_SEMANA,
                SUM(CASE WHEN TRUNC(DATA_AGENDADA) >= TRUNC(SYSDATE) - 7 AND RETORNO IS NOT NULL THEN 1 ELSE 0 END) AS REALIZADAS_SEMANA,
                SUM(CASE WHEN TRUNC(DATA_AGENDADA) >= TRUNC(SYSDATE) - 30 THEN 1 ELSE 0 END) AS AGENDADAS_MES,
                SUM(CASE WHEN TRUNC(DATA_AGENDADA) >= TRUNC(SYSDATE) - 30 AND RETORNO IS NOT NULL THEN 1 ELSE 0 END) AS REALIZADAS_MES
            FROM CANAL_VISITAS
            WHERE CODUSUR = :codusur
              AND TRUNC(DATA_AGENDADA) >= TRUNC(SYSDATE) - 30
        `;
        
        const sqlNfs = `
            SELECT 
                SUM(CASE WHEN TRUNC(DTSAIDA) >= TRUNC(SYSDATE) - 7 THEN 1 ELSE 0 END) AS NFS_SEMANA,
                SUM(CASE WHEN TRUNC(DTSAIDA) >= TRUNC(SYSDATE) - 30 THEN 1 ELSE 0 END) AS NFS_MES
            FROM PCNFSAID
            WHERE CODUSUR = :codusur
              AND DTCANCEL IS NULL
              AND TRUNC(DTSAIDA) >= TRUNC(SYSDATE) - 30
        `;
        
        const resultVisitas = await connection.execute(sqlVisitas, { codusur });
        const resultNfs = await connection.execute(sqlNfs, { codusur });
        
        const v = resultVisitas.rows[0] || [0,0,0,0];
        const n = resultNfs.rows[0] || [0,0];
        
        res.json({ 
            success: true, 
            desempenho: {
                semana: {
                    agendadas: v[0] || 0,
                    realizadas: v[1] || 0,
                    nfs: n[0] || 0
                },
                mes: {
                    agendadas: v[2] || 0,
                    realizadas: v[3] || 0,
                    nfs: n[1] || 0
                }
            }
        });
    } catch (err) {
        console.error('Erro ao buscar desempenho:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar desempenho.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Sugestões Inteligentes de Rota baseadas no Histórico de Pedidos
router.get('/sugestoes/:codusur', async (req, res) => {
    const { codusur } = req.params;
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Query avançada: últimos 12 meses de vendas deste vendedor
        // Exclui clientes já na PCROTACLI.
        // STATS_MODE acha o dia da semana com mais compras (1=Domingo, 2=Seg, ..., 6=Sexta).
        const sql = `
            SELECT 
                P.CODCLI,
                C.CLIENTE AS RAZAOSOCIAL,
                C.FANTASIA,
                COUNT(P.NUMPED) AS QTD_PEDIDOS,
                TO_CHAR(MAX(P.DATA), 'YYYY-MM-DD') AS ULTIMA_COMPRA,
                STATS_MODE(TO_CHAR(P.DATA, 'D')) AS MELHOR_DIA
            FROM PCPEDC P
            JOIN PCCLIENT C ON C.CODCLI = P.CODCLI
            WHERE P.DATA >= SYSDATE - 365 
            AND P.CONDVENDA IN (1, 2, 3, 7, 9, 10, 13)
            AND P.CODUSUR = :codusur
            AND P.CODCLI NOT IN (SELECT CODCLI FROM PCROTACLI WHERE CODUSUR = :codusur)
            AND P.POSICAO NOT IN ('C')
            GROUP BY P.CODCLI, C.CLIENTE, C.FANTASIA
            ORDER BY MELHOR_DIA ASC, P.CODCLI ASC
            FETCH FIRST 20 ROWS ONLY
        `;
        
        const result = await connection.execute(sql, { codusur });
        
        const diasSemanaMap = {
            '1': 'SEGUNDA', // Se domingo, sugere segunda
            '2': 'SEGUNDA',
            '3': 'TERCA',
            '4': 'QUARTA',
            '5': 'QUINTA',
            '6': 'SEXTA',
            '7': 'SEXTA'    // Se sábado, sugere sexta
        };

        const sugestoes = result.rows.map(row => ({
            codcli: row[0],
            razaosocial: row[1],
            fantasia: row[2],
            qtdPedidos: row[3],
            ultimaCompra: row[4],
            diaSugerido: diasSemanaMap[row[5]] || 'SEGUNDA'
        }));
        
        res.json({ success: true, sugestoes });
    } catch (err) {
        console.error('Erro ao buscar sugestões de rota:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar sugestões.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Analise da sugestão (Detalhes dos pedidos por dia da semana)
router.get('/analise/:codcli', async (req, res) => {
    const { codcli } = req.params;
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT TO_CHAR(DATA, 'D') AS DIA, COUNT(NUMPED) AS QTD 
            FROM PCPEDC 
            WHERE CODCLI = :codcli 
              AND DATA >= SYSDATE - 365 
              AND CONDVENDA IN (1, 2, 3, 7, 9, 10, 13) 
              AND POSICAO NOT IN ('C')
            GROUP BY TO_CHAR(DATA, 'D')
            ORDER BY QTD DESC
        `;
        
        const result = await connection.execute(sql, { codcli });
        
        const diasSemanaMap = {
            '1': 'Domingo',
            '2': 'Segunda-feira',
            '3': 'Terça-feira',
            '4': 'Quarta-feira',
            '5': 'Quinta-feira',
            '6': 'Sexta-feira',
            '7': 'Sábado'
        };

        const analise = result.rows.map(row => ({
            dia: diasSemanaMap[row[0]] || 'Desconhecido',
            qtd: row[1]
        }));
        
        res.json({ success: true, analise });
    } catch (err) {
        console.error('Erro ao buscar análise:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar análise.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar rotas de um vendedor
router.get('/:codusur', async (req, res) => {
    const { codusur } = req.params;
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT R.DIASEMANA, R.CODCLI, C.CLIENTE AS RAZAOSOCIAL, C.FANTASIA, R.SEQUENCIA,
                   C.ENDERENT, C.MUNICENT, C.CEPENT, C.LATITUDE, C.LONGITUDE, R.INTERACAO
            FROM CANAL_ROTAS R
            JOIN PCCLIENT C ON C.CODCLI = R.CODCLI
            WHERE R.CODUSUR = :codusur
            ORDER BY R.SEQUENCIA ASC
        `;
        
        const result = await connection.execute(sql, { codusur });
        
        const sqlVendedor = `
            SELECT NOME, ENDERECO, CEP, LATITUDE, LONGITUDE
            FROM PCUSUARI
            WHERE CODUSUR = :codusur
        `;
        const resultVendedor = await connection.execute(sqlVendedor, { codusur });
        let vendedor = null;
        if (resultVendedor.rows.length > 0) {
            const v = resultVendedor.rows[0];
            vendedor = {
                nome: v[0],
                endereco: v[1],
                cep: v[2],
                lat: v[3],
                lng: v[4]
            };
        }
        
        const rotas = {
            SEGUNDA: [],
            TERCA: [],
            QUARTA: [],
            QUINTA: [],
            SEXTA: []
        };

        const normalizeDia = (dia) => {
            if (!dia) return null;
            const d = dia.toUpperCase().replace('Ç', 'C');
            if (rotas[d]) return d;
            return null;
        };

        result.rows.forEach(row => {
            const diaRaw = row[0];
            const dia = normalizeDia(diaRaw);
            if (dia) {
                rotas[dia].push({
                    codcli: row[1],
                    razaosocial: row[2],
                    fantasia: row[3],
                    sequencia: row[4],
                    endereco: row[5],
                    municipio: row[6],
                    cep: row[7],
                    lat: row[8],
                    lng: row[9],
                    interacao: row[10] || 'PRESENCIAL'
                });
            }
        });

        // Garantir ordenacao
        Object.keys(rotas).forEach(dia => {
            rotas[dia].sort((a, b) => (a.sequencia || 0) - (b.sequencia || 0));
        });

        res.json({ success: true, rotas, vendedor });
    } catch (err) {
        console.error('Erro ao buscar rotas:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar rotas.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Disparar rota presencial para o vendedor
router.post('/:codusur/disparar', async (req, res) => {
    const { codusur } = req.params;
    const { dia, clientes } = req.body;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Pega telefone do vendedor
        const sqlVend = `SELECT TELEFONE1, NOME FROM PCUSUARI WHERE CODUSUR = :codusur`;
        const resultVend = await connection.execute(sqlVend, { codusur });
        if (resultVend.rows.length === 0 || !resultVend.rows[0][0]) {
            return res.json({ success: false, error: 'Vendedor não possui telefone cadastrado.' });
        }
        
        const telefone = resultVend.rows[0][0];
        const nome = resultVend.rows[0][1];

        const configResult = await connection.execute(`
            SELECT T.INSTANCE_NAME, T.API_TOKEN, COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.API_TOKEN = 'TOKEN_121817072026'
        `);
        
        if (configResult.rows.length === 0) {
            return res.json({ success: false, error: 'Evoluton API não configurada.' });
        }

        const instanceName = configResult.rows[0][0];
        const evoToken = configResult.rows[0][1];
        let evoUrl = configResult.rows[0][2];
        if (evoUrl.endsWith('/')) evoUrl = evoUrl.slice(0, -1);

        let texto = `*Sua Rota Presencial - ${dia}*\n\nOlá ${nome.trim()}, aqui está a sequência otimizada das suas visitas de hoje:\n\n`;

        if (clientes && clientes.length > 0) {
            let count = 1;
            clientes.forEach(c => {
                const interacao = c.interacao || 'PRESENCIAL';
                if (interacao === 'PRESENCIAL') {
                    const nomeCli = c.razaosocial || c.CLIENTE || '';
                    const endereco = c.endereco || c.ENDERENT || 'S/ Endereço';
                    const municipio = c.municipio || c.MUNICENT || '';
                    texto += `*${count}º Parada*: ${nomeCli.trim()}\n📍 ${endereco} - ${municipio}\n\n`;
                    count++;
                }
            });
        } else {
            const sql = `
                SELECT C.CLIENTE, NVL(C.ENDERENT, C.ENDERCOB), C.MUNICENT, R.SEQUENCIA
                FROM CANAL_ROTAS R
                JOIN PCCLIENT C ON C.CODCLI = R.CODCLI
                WHERE R.CODUSUR = :codusur AND R.DIASEMANA = :dia AND R.INTERACAO = 'PRESENCIAL'
                ORDER BY R.SEQUENCIA ASC
            `;
            const result = await connection.execute(sql, { codusur, dia });
            
            if (result.rows.length === 0) {
                return res.json({ success: false, error: 'Não há clientes presenciais agendados para este dia.' });
            }

            result.rows.forEach(r => {
                texto += `*${r[3]}º Parada*: ${r[0].trim()}\n📍 ${r[1] || 'S/ Endereço'} - ${r[2] || ''}\n\n`;
            });
        }

        texto += `Boa sorte nas vendas!`;

        let telVendedor = telefone.replace(/[^0-9]/g, '');
        if (!telVendedor.startsWith('55')) telVendedor = '55' + telVendedor;

        const payload = { number: telVendedor, text: texto };
        const headersReq = { 'apikey': evoToken, 'instance': instanceName, 'Content-Type': 'application/json' };

        try {
            await axios.post(`${evoUrl}/send/text`, payload, { headers: headersReq, timeout: 5000 });
        } catch (e) {
            if (e.response && e.response.status === 404) {
                await axios.post(`${evoUrl}/message/sendText/${instanceName}`, payload, { headers: headersReq, timeout: 5000 });
            } else {
                throw e;
            }
        }

        res.json({ success: true, message: 'Rota enviada para o WhatsApp do vendedor!' });
    } catch (err) {
        console.error('Erro ao disparar rota:', err);
        res.status(500).json({ success: false, error: 'Erro ao disparar rota.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Salvar a grade de rotas do vendedor
router.post('/:codusur', async (req, res) => {
    const { codusur } = req.params;
    const { rotas } = req.body; // { SEGUNDA: [...codcli], TERCA: [...codcli] }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        await connection.execute(`DELETE FROM CANAL_ROTAS WHERE CODUSUR = :codusur`, { codusur }, { autoCommit: false });

        // 1. Apagar registros antigos do vendedor (apenas dias úteis)
        await connection.execute(`
            DELETE FROM PCMOVROTACLI 
            WHERE CODUSUR = :codusur 
              AND DIASEMANA IN ('SEGUNDA', 'TERCA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA')
        `, { codusur }, { autoCommit: false });

        await connection.execute(`
            DELETE FROM PCROTACLI 
            WHERE CODUSUR = :codusur 
              AND DIASEMANA IN ('SEGUNDA', 'TERCA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA')
        `, { codusur }, { autoCommit: false });

        // 2. Inserir a nova grade
        const dias = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA'];
        for (const dia of dias) {
            const clientes = rotas[dia] || [];
            
            for (let i = 0; i < clientes.length; i++) {
                const codcli = clientes[i].codcli || clientes[i]; 
                const interacao = clientes[i].interacao || 'PRESENCIAL';
                const sequencia = i + 1;

                await connection.execute(`
                    INSERT INTO CANAL_ROTAS (CODUSUR, DIASEMANA, CODCLI, SEQUENCIA, INTERACAO)
                    VALUES (:codusur, :diasemana, :codcli, :sequencia, :interacao)
                `, {
                    codusur: codusur,
                    diasemana: dia,
                    codcli: codcli,
                    sequencia: sequencia,
                    interacao: interacao
                }, { autoCommit: false });

                if (interacao === 'PRESENCIAL') {
                    await connection.execute(`
                        INSERT INTO PCROTACLI (CODUSUR, DIASEMANA, CODCLI, SEQUENCIA, OBS, NUMSEMANA)
                        VALUES (:codusur, :diasemana, :codcli, :sequencia, 'PRESENCIAL', 1)
                    `, {
                        codusur: codusur,
                        diasemana: dia,
                        codcli: codcli,
                        sequencia: sequencia
                    }, { autoCommit: false });
                }
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Rota salva com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar rota:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) {}
        }
        res.status(500).json({ success: false, error: 'Erro ao salvar rota.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

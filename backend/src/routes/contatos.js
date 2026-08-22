const express = require('express');
const oracledb = require('oracledb');
const router = express.Router();

function formatPhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[^0-9]/g, '');
    p = p.replace(/^0+/, '');
    if (p.length === 10 || p.length === 11) {
        p = '55' + p;
    }
    if (p.startsWith('55') && (p.length === 12 || p.length === 13)) {
        return p;
    }
    return null;
}

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

// Listar contatos de um cliente
router.get('/:codcli', async (req, res) => {
    const { codcli } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const result = await connection.execute(
            `SELECT DISTINCT C.NOMECONTATO AS NOME_CONTATO, NVL(C.TELEFONE, C.CELULAR) AS TELEFONE, W.TEM_WHATS
             FROM PCCONTATO C
             LEFT JOIN CANAL_WHATSAPP_CACHE W ON W.TELEFONE = NVL(C.TELEFONE, C.CELULAR)
             WHERE C.CODCLI = :codcli 
             ORDER BY C.NOMECONTATO`,
            { codcli }
        );

        const contatos = result.rows.map(row => ({
            nome: row.NOME_CONTATO || row.nome_contato || row[0],
            telefone: row.TELEFONE || row.telefone || row[1],
            tem_whats: row.TEM_WHATS || row.tem_whats || row[2]
        }));

        res.json({ success: true, contatos });
    } catch (err) {
        console.error('Erro ao listar contatos:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar contatos.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Listar contatos de todos os clientes de um vendedor
router.get('/vendedor/:codusur', async (req, res) => {
    const { codusur } = req.params;
    let { role } = req.query; // role can be passed from frontend
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = `
            SELECT TO_CHAR(CODCLI) AS CODCLI, NOME_CONTATO, TELEFONE, CLIENTE, MAX(TAGS) AS TAGS
            FROM (
                SELECT TO_CHAR(CC.CODCLI) AS CODCLI, CC.NOMECONTATO AS NOME_CONTATO, NVL(CC.TELEFONE, CC.CELULAR) AS TELEFONE, C.CLIENTE, CC.OBS AS TAGS
                FROM PCCONTATO CC
                JOIN PCCLIENT C ON CC.CODCLI = C.CODCLI
                WHERE 1=1
        `;
        let binds = {};

        if (role === 'bot_gestor') {
            // bot_gestor vê carteira GERAL e também vendedores
            sql += `
            )
            GROUP BY CODCLI, NOME_CONTATO, TELEFONE, CLIENTE
            UNION ALL
            SELECT 
                'V' || U.CODUSUR AS CODCLI,
                U.NOME AS NOME_CONTATO,
                NVL(U.TELEFONE1, U.TELEFONE2) AS TELEFONE,
                '[VENDEDOR] ' || U.NOME AS CLIENTE,
                'VENDEDOR' AS TAGS
            FROM PCUSUARI U
            WHERE (U.BLOQUEIO = 'N' OR U.BLOQUEIO IS NULL)
              AND NVL(U.TELEFONE1, U.TELEFONE2) IS NOT NULL
            `;
        } else if (role === 'gerente') {
            sql += ` AND C.CODUSUR1 IN (
                        SELECT U.CODUSUR FROM PCUSUARI U 
                        JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR 
                        WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :codusur)
                     )
            )
            GROUP BY CODCLI, NOME_CONTATO, TELEFONE, CLIENTE
            `;
            binds.codusur = codusur;
        } else if (role === 'supervisor') {
            sql += ` AND C.CODUSUR1 IN (
                        SELECT U.CODUSUR FROM PCUSUARI U 
                        JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR 
                        WHERE S.COD_CADRCA = :codusur
                     )
            )
            GROUP BY CODCLI, NOME_CONTATO, TELEFONE, CLIENTE
            `;
            binds.codusur = codusur;
        } else {
            sql += ` AND C.CODUSUR1 = :codusur
            )
            GROUP BY CODCLI, NOME_CONTATO, TELEFONE, CLIENTE
            `;
            binds.codusur = codusur;
        }

        const result = await connection.execute(sql, binds);

        const contatos = result.rows.map(row => ({
            codcli: row[0],
            nome_contato: row[1],
            telefone: row[2],
            cliente: row[3],
            tags: row[4]
        }));

        res.json({ success: true, contatos });
    } catch (err) {
        console.error('Erro ao listar contatos do vendedor:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar contatos.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Adicionar um contato para um cliente
router.post('', async (req, res) => {
    const { codcli, nome, telefone } = req.body;
    
    if (!codcli || !telefone) {
        return res.status(400).json({ success: false, message: 'Cliente e Telefone são obrigatórios.' });
    }

    const formattedPhone = formatPhone(telefone);
    if (!formattedPhone) {
        return res.status(400).json({ success: false, message: 'Número de telefone/celular inválido.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Verifica se o número já está cadastrado para o cliente
        const checkPhoneSql = `SELECT NOMECONTATO FROM PCCONTATO WHERE CODCLI = :codcli AND (TELEFONE = :telefone OR CELULAR = :telefone)`;
        const checkPhoneRes = await connection.execute(checkPhoneSql, { codcli, telefone: formattedPhone });
        if (checkPhoneRes.rows.length > 0) {
            return res.status(400).json({ success: false, message: `Número já cadastrado para o contato: ${checkPhoneRes.rows[0][0]}` });
        }

        const finalNome = (nome || 'Contato').substring(0, 40);
        
        // Verifica se o nome já está cadastrado para o cliente
        const checkNameSql = `SELECT NOMECONTATO FROM PCCONTATO WHERE CODCLI = :codcli AND NOMECONTATO = :nome`;
        const checkNameRes = await connection.execute(checkNameSql, { codcli, nome: finalNome });
        if (checkNameRes.rows.length > 0) {
            return res.status(400).json({ success: false, message: `O nome '${finalNome}' já está cadastrado para este cliente.` });
        }

        const sql = `
            INSERT INTO PCCONTATO (CODCONTATO, CODCLI, NOMECONTATO, TELEFONE, TIPOCONTATO, AUTORCH)
            VALUES (DFSEQ_PCCONTATO.NEXTVAL, :codcli, :nome, :telefone, 'C', 'N')
        `;
        
        await connection.execute(sql, { codcli, nome: finalNome, telefone: formattedPhone }, { autoCommit: true });
        
        res.json({ success: true, message: 'Contato salvo com sucesso!' });
    } catch (err) {
        console.error('Erro ao inserir contato:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar contato.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Remover um contato (opcional, por segurança e flexibilidade futura)
router.delete('', async (req, res) => {
    const { codcli, telefone } = req.body;
    
    if (!codcli || !telefone) {
        return res.status(400).json({ success: false, message: 'Cliente e Telefone são obrigatórios.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            DELETE FROM PCCONTATO WHERE CODCLI = :codcli AND (TELEFONE = :telefone OR CELULAR = :telefone)
        `;
        
        await connection.execute(sql, { codcli, telefone }, { autoCommit: true });
        
        res.json({ success: true, message: 'Contato removido com sucesso!' });
    } catch (err) {
        console.error('Erro ao remover contato:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao remover contato.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

// Atualizar tags de um contato
router.put('/tags', async (req, res) => {
    const { codcli, telefone, tags } = req.body;
    
    if (!codcli || !telefone) {
        return res.status(400).json({ success: false, message: 'Cliente e Telefone são obrigatórios.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            UPDATE PCCONTATO 
            SET OBS = :tags
            WHERE CODCLI = :codcli AND (TELEFONE = :telefone OR CELULAR = :telefone)
        `;
        
        await connection.execute(sql, { tags: tags || '', codcli, telefone }, { autoCommit: true });
        
        res.json({ success: true, message: 'Tags atualizadas com sucesso!' });
    } catch (err) {
        console.error('Erro ao atualizar tags:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar tags.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

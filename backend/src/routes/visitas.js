const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

// Listar todas as visitas (com filtros)
router.get('/', async (req, res) => {
    const { codusur, role, vendedor } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, message: 'codusur é obrigatório' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = `
            SELECT V.ID, V.CODCLI, C.CLIENTE, V.CODUSUR, U.NOME AS NOME_VENDEDOR,
                   V.DATA_AGENDADA, V.STATUS, V.TIPO_MENSAGEM, V.CRIADO_EM, V.RETORNO, V.SINALIZADO_VENDEDOR
            FROM CANAL_VISITAS V
            JOIN PCCLIENT C ON V.CODCLI = C.CODCLI
            JOIN PCUSUARI U ON V.CODUSUR = U.CODUSUR
            WHERE 1=1
        `;
        let binds = {};

        const roleUpper = (role || '').toUpperCase();

        if (roleUpper === 'BOT_GESTOR') {
            if (vendedor) {
                sql += ` AND V.CODUSUR = :vendedor`;
                binds.vendedor = vendedor;
            }
        } else if (roleUpper === 'GERENTE') {
            if (vendedor) {
                sql += ` AND V.CODUSUR = :vendedor`;
                binds.vendedor = vendedor;
            }
            sql += ` AND V.CODUSUR IN (
                SELECT U2.CODUSUR 
                FROM PCUSUARI U2
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U2.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :codusur)
            )`;
            binds.codusur = codusur;
        } else if (roleUpper === 'SUPERVISOR') {
            if (vendedor) {
                sql += ` AND V.CODUSUR = :vendedor`;
                binds.vendedor = vendedor;
            }
            sql += ` AND V.CODUSUR IN (
                SELECT U2.CODUSUR 
                FROM PCUSUARI U2
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U2.CODSUPERVISOR
                WHERE S.COD_CADRCA = :codusur
            )`;
            binds.codusur = codusur;
        } else {
            sql += ` AND V.CODUSUR = :codusur`;
            binds.codusur = codusur;
        }

        sql += ` ORDER BY V.DATA_AGENDADA DESC`;

        const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ success: true, visitas: result.rows });
    } catch (err) {
        console.error('Erro ao listar visitas:', err);
        res.status(500).json({ success: false, message: 'Erro ao listar visitas' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Criar nova visita
router.post('/', async (req, res) => {
    const { codcli, codusur, data_agendada, tipo_mensagem } = req.body;
    
    if (!codcli || !codusur || !data_agendada) {
        return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Tentar formatar a data string do JS (ex: 2023-10-25) para DATE do Oracle
        const sql = `
            INSERT INTO CANAL_VISITAS (CODCLI, CODUSUR, DATA_AGENDADA, STATUS, TIPO_MENSAGEM)
            VALUES (:codcli, :codusur, :data_agendada, 'PENDENTE', :tipo_mensagem)
        `;
        
        await connection.execute(sql, { 
            codcli, 
            codusur, 
            data_agendada: new Date(data_agendada),
            tipo_mensagem: tipo_mensagem || 'NENHUMA'
        }, { autoCommit: true });
        
        res.json({ success: true, message: 'Visita agendada com sucesso' });
    } catch (err) {
        console.error('Erro ao agendar visita:', err);
        res.status(500).json({ success: false, message: 'Erro ao agendar visita' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Atualizar status da visita
router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
        return res.status(400).json({ success: false, message: 'Status obrigatório' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            UPDATE CANAL_VISITAS 
            SET STATUS = :status, ATUALIZADO_EM = SYSDATE 
            WHERE ID = :id
        `;
        
        const result = await connection.execute(sql, { status, id }, { autoCommit: true });
        
        if (result.rowsAffected === 0) {
            return res.status(404).json({ success: false, message: 'Visita não encontrada' });
        }
        
        res.json({ success: true, message: 'Status atualizado com sucesso' });
    } catch (err) {
        console.error('Erro ao atualizar visita:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar visita' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Deletar visita
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `DELETE FROM CANAL_VISITAS WHERE ID = :id`;
        const result = await connection.execute(sql, { id }, { autoCommit: true });
        
        if (result.rowsAffected === 0) {
            return res.status(404).json({ success: false, message: 'Visita não encontrada' });
        }
        
        res.json({ success: true, message: 'Visita excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir visita:', err);
        res.status(500).json({ success: false, message: 'Erro ao excluir visita' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuração do multer para upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `status_${Date.now()}${ext}`);
    }
});

const upload = multer({ storage });

// Rota para agendar campanha (upload de imagem + dados)
router.post('/campanhas/agendar', upload.single('imagem'), async (req, res) => {
    const { legenda, data_programada, vendedores, criado_por } = req.body;
    
    if (!req.file || !data_programada || !vendedores || !criado_por) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            INSERT INTO CANAL_AGENDAMENTO_STATUS (
                ARQUIVO_PATH, LEGENDA, DATA_PROGRAMADA, VENDEDORES_DESTINO, CRIADO_POR
            ) VALUES (
                :path, :legenda, TO_TIMESTAMP(:data_prog, 'YYYY-MM-DD HH24:MI:SS'), :vendedores, :criado_por
            )
        `;

        await connection.execute(sql, {
            path: req.file.filename,
            legenda: legenda || '',
            data_prog: data_programada, // Ex: '2023-10-25 15:30:00'
            vendedores: vendedores, // JSON Array stringificado
            criado_por: criado_por
        }, { autoCommit: true });

        res.json({ success: true, message: 'Status agendado com sucesso!' });
    } catch (err) {
        console.error('Erro ao agendar status:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Listar vendedores que tem token configurado
router.get('/campanhas/vendedores', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT T.CODUSUR, U.NOME, T.INSTANCE_NAME 
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN PCUSUARI U ON U.CODUSUR = T.CODUSUR
            ORDER BY U.NOME ASC
        `;
        
        const result = await connection.execute(sql);
        
        const vendedores = result.rows.map(row => ({
            codusur: row[0],
            nome: row[1],
            instancia: row[2]
        }));

        res.json({ success: true, vendedores });
    } catch (err) {
        console.error('Erro ao listar vendedores:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Listar agendamentos
router.get('/campanhas', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT ID, ARQUIVO_PATH, LEGENDA, 
                   TO_CHAR(DATA_PROGRAMADA, 'YYYY-MM-DD HH24:MI:SS') AS DATA_PROGRAMADA,
                   VENDEDORES_DESTINO, STATUS_ENVIO, CRIADO_POR
            FROM CANAL_AGENDAMENTO_STATUS
            ORDER BY DATA_PROGRAMADA DESC
        `;
        
        const result = await connection.execute(sql);
        
        const agendamentos = result.rows.map(row => ({
            id: row[0],
            imagem: row[1],
            legenda: row[2],
            data_programada: row[3],
            vendedores: row[4],
            status: row[5],
            criado_por: row[6]
        }));

        res.json({ success: true, agendamentos });
    } catch (err) {
        console.error('Erro ao listar campanhas:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Excluir agendamento
router.delete('/campanhas/:id', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        await connection.execute(`DELETE FROM CANAL_AGENDAMENTO_STATUS WHERE ID = :id`, { id: req.params.id }, { autoCommit: true });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao apagar campanha:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

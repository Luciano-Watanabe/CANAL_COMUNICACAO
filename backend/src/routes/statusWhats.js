const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const oraclePool = require('../services/oraclePool');

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
        cb(null, `statuswhats_${Date.now()}${ext}`);
    }
});

const upload = multer({ storage });

function getAllowedMimes(tipo) {
    if (tipo === 'imagem') return ['image/jpeg', 'image/png', 'image/webp'];
    if (tipo === 'video') return ['video/mp4', 'video/webm'];
    if (tipo === 'audio') return ['audio/mpeg', 'audio/ogg', 'audio/wav'];
    return [];
}

function getAllowedExts(tipo) {
    if (tipo === 'imagem') return ['.jpg', '.jpeg', '.png', '.webp'];
    if (tipo === 'video') return ['.mp4', '.webm', '.mov'];
    if (tipo === 'audio') return ['.mp3', '.ogg', '.wav', '.m4a'];
    return [];
}

function fileFilterFactory(tipo) {
    const allowedMimes = getAllowedMimes(tipo);
    const allowedExts = getAllowedExts(tipo);
    return (req, file, cb) => {
        if (allowedMimes.includes(file.mimetype) || allowedExts.includes(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de arquivo inválido para ${tipo}.`), true);
        }
    };
}

router.use((req, res, next) => {
    if (req.fileValidationError) {
        return res.status(400).json({ success: false, message: req.fileValidationError });
    }
    next();
});

router.post('/status-whats/agendar', upload.single('midia'), async (req, res) => {
    const { tipo_midia, legenda, data_programada, vendedores, criado_por } = req.body;

    if (!tipo_midia || !data_programada || !vendedores || !criado_por) {
        return res.status(400).json({ success: false, message: 'Dados incompletos. tipo_midia, data_programada, vendedores e criado_por são obrigatórios.' });
    }

    const allowedTypes = ['texto', 'imagem', 'video', 'audio'];
    if (!allowedTypes.includes(tipo_midia)) {
        return res.status(400).json({ success: false, message: 'tipo_midia inválido. Valores: texto, imagem, video, audio.' });
    }

    if (tipo_midia !== 'texto' && !req.file) {
        return res.status(400).json({ success: false, message: 'Arquivo de mídia é obrigatório para este tipo.' });
    }

    if (tipo_midia === 'texto' && !legenda) {
        return res.status(400).json({ success: false, message: 'Legenda (texto) é obrigatória para envio de texto.' });
    }

    const arquivoPath = req.file ? req.file.filename : null;

    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `
            INSERT INTO CANAL_STATUS_WHATS (
                TIPO_MIDIA, ARQUIVO_PATH, LEGENDA, DATA_PROGRAMADA, VENDEDORES_DESTINO, CRIADO_POR
            ) VALUES (
                :tipo_midia, :arquivo, :legenda, TO_TIMESTAMP(:data_prog, 'YYYY-MM-DD HH24:MI:SS'), :vendedores, :criado_por
            )
        `;

        await connection.execute(sql, {
            tipo_midia,
            arquivo: arquivoPath,
            legenda: legenda || '',
            data_prog: data_programada,
            vendedores,
            criado_por
        }, { autoCommit: true });

        res.json({ success: true, message: 'Status agendado com sucesso!' });
    } catch (err) {
        console.error('Erro ao agendar status:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/status-whats/vendedores', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `
            SELECT T.CODUSUR, U.NOME, T.INSTANCE_NAME, T.API_TOKEN
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN PCUSUARI U ON U.CODUSUR = T.CODUSUR
            WHERE T.INSTANCE_NAME IS NOT NULL
            ORDER BY U.NOME ASC
        `;

        const result = await connection.execute(sql);

        const vendedores = result.rows.map(row => ({
            codusur: row[0],
            nome: row[1],
            instancia: row[2],
            tem_token: !!row[3]
        }));

        res.json({ success: true, vendedores });
    } catch (err) {
        console.error('Erro ao listar vendedores:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/status-whats', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `
            SELECT ID, TIPO_MIDIA, ARQUIVO_PATH, LEGENDA,
                   TO_CHAR(DATA_PROGRAMADA, 'YYYY-MM-DD HH24:MI:SS') AS DATA_PROGRAMADA,
                   VENDEDORES_DESTINO, STATUS_ENVIO, DATA_ENVIO, LOG_ERRO, CRIADO_POR
            FROM CANAL_STATUS_WHATS
            ORDER BY DATA_PROGRAMADA DESC
            FETCH FIRST 200 ROWS ONLY
        `;

        const result = await connection.execute(sql, [], {
            fetchInfo: {
                "VENDEDORES_DESTINO": { type: oracledb.STRING },
                "LEGENDA": { type: oracledb.STRING },
                "LOG_ERRO": { type: oracledb.STRING }
            },
            outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const agendamentos = result.rows.map(row => ({
            id: row.ID,
            tipo_midia: row.TIPO_MIDIA,
            arquivo_path: row.ARQUIVO_PATH,
            legenda: row.LEGENDA || '',
            data_programada: row.DATA_PROGRAMADA,
            vendedores: row.VENDEDORES_DESTINO,
            status: row.STATUS_ENVIO,
            data_envio: row.DATA_ENVIO,
            log_erro: row.LOG_ERRO,
            criado_por: row.CRIADO_POR
        }));

        res.json({ success: true, agendamentos });
    } catch (err) {
        console.error('Erro ao listar status-whats:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.delete('/status-whats/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await oraclePool.getConnection();

        await connection.execute(`DELETE FROM CANAL_STATUS_WHATS WHERE ID = :id`, { id: Number(id) }, { autoCommit: true });

        res.json({ success: true, message: 'Excluído com sucesso.' });
    } catch (err) {
        console.error('Erro ao excluir status-whats:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

const express = require('express');
const bodyParser = require('body-parser');
const oraclePool = require('./oraclePool');

let currentServer = null;

const startWebhookServer = (porta, token) => {
    if (currentServer) {
        currentServer.close(() => {
            console.log('Servidor de Webhook anterior fechado.');
        });
    }

    const app = express();
    app.use(bodyParser.json());

    // Rota para receber mensagens/eventos do webhook em qualquer path
    app.use(async (req, res) => {
        const payload = req.method === 'GET' ? req.query : req.body;
        console.log(`[NATIVE WEBHOOK] Payload recebido (${req.method}):`, payload);
        
        let connection;
        try {
            connection = await oraclePool.getConnection();
            const sql = `INSERT INTO CANAL_WEBHOOK (CONTEUDO, ORIGEM) VALUES (:conteudo, :origem)`;
            await connection.execute(sql, {
                conteudo: JSON.stringify(payload),
                origem: 'NATIVO_TAILSCALE'
            }, { autoCommit: true });
            
            res.send("true");
        } catch (err) {
            console.error('Erro ao salvar payload do webhook nativo:', err);
            res.send("false");
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
        }
    });

    const fs = require('fs');
    const https = require('https');
    const path = require('path');

    const certPath = path.join(__dirname, '../../certs/webhook.crt');
    const keyPath = path.join(__dirname, '../../certs/webhook.key');

    let serverToListen = app;
    let isHttps = false;

    // Removido o HTTPS local porque o Tailscale Funnel já faz a terminação TLS (HTTPS)
    // e repassa o tráfego em HTTP para o backend. Se o Node usar HTTPS, o Funnel não consegue se conectar
    // localmente devido a mismatch de certificados no localhost.


    currentServer = serverToListen.listen(porta, () => {
        console.log(`[NATIVE WEBHOOK] Servidor escutando na porta ${porta} via ${isHttps ? 'HTTPS' : 'HTTP'}`);
    });
};

const stopWebhookServer = () => {
    if (currentServer) {
        currentServer.close(() => {
            console.log('[NATIVE WEBHOOK] Servidor parado.');
            currentServer = null;
        });
    }
};

module.exports = {
    startWebhookServer,
    stopWebhookServer
};

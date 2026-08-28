const oraclePool = require('../services/oraclePool');
const { exec } = require('child_process');

const util = require('util');
const execPromise = util.promisify(require('child_process').exec);

exports.getConfig = async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();
        const sql = `SELECT PORTA, TOKEN, ATIVO, URL_PUBLICA FROM CANAL_WEBHOOK_CONFIG WHERE ID = 1`;
        const result = await connection.execute(sql);
        
        let config = { success: true, porta: 3005, token: '', ativo: 'N', urlPublica: '' };
        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0];
            config.porta = row[0];
            config.token = row[1];
            config.ativo = row[2];
            config.urlPublica = row[3];
        }

        // Check Tailscale status
        config.tailscaleStatus = 'off';
        config.tailscaleUrl = '';
        config.authUrl = '';
        
        try {
            const { stdout } = await execPromise('tailscale status --json');
            const statusObj = JSON.parse(stdout);
            
            if (statusObj.AuthURL) {
                config.authUrl = statusObj.AuthURL;
            }
            
            if (statusObj.BackendState === 'Running' || (statusObj.Self && statusObj.Self.Online)) {
                config.tailscaleStatus = 'on';
                if (statusObj.Self && statusObj.Self.DNSName) {
                    const dnsName = statusObj.Self.DNSName.replace(/\.$/, '');
                    // Funnel exposes the service on HTTPS (port 443) by default
                    config.tailscaleUrl = `https://${dnsName}`;
                }
            }
        } catch (tsErr) {
            console.error('Erro ao verificar status do Tailscale:', tsErr.message);
        }

        return res.json(config);
    } catch (err) {
        console.error('Erro ao buscar configuração do webhook nativo:', err);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
};

exports.updateConfig = async (req, res) => {
    const { porta, token, ativo } = req.body;

    let connection;
    try {
        connection = await oraclePool.getConnection();
        
        // Ensure row exists
        await connection.execute(`INSERT INTO CANAL_WEBHOOK_CONFIG (ID, PORTA, TOKEN, ATIVO) SELECT 1, 3005, '', 'N' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM CANAL_WEBHOOK_CONFIG WHERE ID = 1)`);
        await connection.commit();

        const sqlUpdate = `
            UPDATE CANAL_WEBHOOK_CONFIG 
            SET PORTA = :porta, TOKEN = :token, ATIVO = :ativo
            WHERE ID = 1
        `;
        await connection.execute(sqlUpdate, {
            porta: porta || 3005,
            token: token || '',
            ativo: ativo === 'S' ? 'S' : 'N'
        }, { autoCommit: true });

        // Fetch NOME_EMPRESA to build hostname
        let nomeEmpresa = 'webhook';
        try {
            const configResult = await connection.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'NOME_EMPRESA'`);
            if (configResult.rows && configResult.rows.length > 0 && configResult.rows[0][0]) {
                const rawName = configResult.rows[0][0];
                nomeEmpresa = 'webhook-' + rawName.replace(/\\s+/g, '').toLowerCase();
            }
        } catch (e) {
            console.error('Erro ao buscar NOME_EMPRESA, usando fallback', e);
        }

        // Trigger tailscale funnel and local server
        const webhookServerManager = require('../services/webhookServerManager');

        if (ativo === 'S') {
            console.log(`Iniciando tailscale com hostname ${nomeEmpresa}...`);
            exec(`tailscale up --hostname=${nomeEmpresa} --accept-routes`, (upErr, upStdout, upStderr) => {
                if (upErr) console.error(`Erro no tailscale up:`, upErr.message);

                console.log(`Gerando certificados para ${nomeEmpresa}...`);
                // Run tailscale cert to get the domain and cert files. We extract the domain from status first or just let tailscale cert figure it out.
                // However, `tailscale cert` might need the domain name explicitly if not running on default. But running it in a known cert dir:
                exec(`mkdir -p ../../certs && tailscale cert --cert-file ../../certs/webhook.crt --key-file ../../certs/webhook.key`, { cwd: __dirname }, (certErr) => {
                    if (certErr) console.error(`Erro no tailscale cert:`, certErr.message);

                    webhookServerManager.startWebhookServer(porta, token);
                    
                    console.log(`Iniciando tailscale funnel na porta ${porta}...`);
                    exec(`tailscale funnel -bg ${porta}`, (error, stdout, stderr) => {
                        if (error) console.error(`Erro ao iniciar tailscale funnel:`, error.message);
                        if (stderr) console.error(`tailscale funnel stderr:`, stderr);
                        console.log(`tailscale funnel stdout:`, stdout);
                    });
                });
            });
        } else {
            console.log(`Desativando tailscale funnel...`);
            webhookServerManager.stopWebhookServer();
            exec(`tailscale funnel off`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Erro ao desativar tailscale funnel: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`tailscale funnel off stderr: ${stderr}`);
                }
                console.log(`tailscale funnel off stdout: ${stdout}`);
            });
        }

        return res.json({ success: true, message: 'Configurações do webhook salvas com sucesso.' });
    } catch (err) {
        console.error('Erro ao atualizar configuração do webhook nativo:', err);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
};

exports.tailscaleLogin = async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();
        
        let nomeEmpresa = 'webhook';
        try {
            const configResult = await connection.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'NOME_EMPRESA'`);
            if (configResult.rows && configResult.rows.length > 0 && configResult.rows[0][0]) {
                const rawName = configResult.rows[0][0];
                nomeEmpresa = 'webhook-' + rawName.replace(/\\s+/g, '').toLowerCase();
            }
        } catch (e) { }

        const authKey = process.env.TAILSCALE_AUTH_KEY;
        let command = `tailscale up --hostname=${nomeEmpresa} --accept-routes`;
        
        if (authKey) {
            command += ` --authkey=${authKey}`;
        }

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Erro no tailscale login:', error.message);
            }
            console.log('Tailscale login stdout:', stdout);
        });

        return res.json({ success: true, message: 'Processo de login iniciado.' });
    } catch (err) {
        console.error('Erro ao iniciar tailscale login:', err);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
};

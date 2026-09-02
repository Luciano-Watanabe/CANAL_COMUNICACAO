const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const oracledb = require('oracledb');
try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {
    console.error('Erro ao inicializar Oracle Client (Thick mode):', err.message);
}
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/SAC/UPLOAD', express.static(path.join(__dirname, '../SAC/UPLOAD')));
global.io = io; // Disponibiliza o io globalmente para os controllers

const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const sacRoutes = require('./routes/sac');
const clientesRoutes = require('./routes/clientes');
const contatosRoutes = require('./routes/contatos');
const configRoutes = require('./routes/config');
const webhookConfigRoutes = require('./routes/webhookConfig');
const chatRoutes = require('./routes/chat');
const vendedoresRoutes = require('./routes/vendedores');
const produtosRoutes = require('./routes/produtos');
const importExportRoutes = require('./routes/importExport');
const campanhasRoutes = require('./routes/campanhas');
const analiseCnpjRoutes = require('./routes/analiseCnpj');
const analiseIeRoutes = require('./routes/analiseIe');
const whatsappRoutes = require('./routes/whatsapp');
const avisosRoutes = require('./routes/avisos');
const dashboardRoutes = require('./routes/dashboard');
const templatesRoutes = require('./routes/templates');
const mensagensTemplatesRoutes = require('./routes/mensagensTemplates');
const visitasRoutes = require('./routes/visitas');
const automacoesRoutes = require('./routes/automacoes');
const metricasRoutes = require('./routes/metricas');
const rotasRoutes = require('./routes/rotas');
const catalogoRoutes = require('./routes/catalogo');
const geolocalizacaoRoutes = require('./routes/geolocalizacao');
const prospeccaoRoutes = require('./routes/prospeccao');
const objetivosRoutes = require('./routes/objetivos');
const botMensagensRoutes = require('./routes/botMensagens');
const statusWhatsRoutes = require('./routes/statusWhats');
const relatoriosRoutes = require('./routes/relatorios');
const botMensagensService = require('./services/botMensagensService');

app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/contatos', contatosRoutes);
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/visitas', visitasRoutes);
app.use('/api/config', configRoutes);
app.use('/api/webhook-config', webhookConfigRoutes);
app.use('/api/rotas', rotasRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/sac', sacRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/templates_paginas', mensagensTemplatesRoutes);
app.use('/api/automacoes', automacoesRoutes);
app.use('/api/prospeccao', prospeccaoRoutes);
app.use('/api', avisosRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', campanhasRoutes);
app.use('/api/analise-cnpj', analiseCnpjRoutes);
app.use('/api/analise-ie', analiseIeRoutes);
app.use('/api', metricasRoutes);
app.use('/api', whatsappRoutes);
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/geolocalizacao', geolocalizacaoRoutes);
app.use('/api/objetivos', objetivosRoutes);
app.use('/api/bot-mensagens', botMensagensRoutes);
app.use('/api', statusWhatsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Canal de Comunicacao Backend' });
});

io.use((socket, next) => {
  const role = socket.handshake.query.role || 'vendedor';
  const matricula = socket.handshake.query.matricula;
  socket.data = { role, matricula };
  next();
});

io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id} | Role: ${socket.data.role} | Matricula: ${socket.data.matricula}`);

  // Juntar em uma sala específica de cargo (ex: 'room_supervisores')
  if (socket.data.role === 'supervisor') {
    socket.join('room_supervisores');
    console.log(`[SOCKET] ${socket.id} entrou na sala: room_supervisores`);
  }
  
  if (socket.data.matricula) {
    socket.join(`user_${socket.data.matricula}`);
  }

  socket.on('chamar_supervisor', async (data) => {
    console.log(`Vendedor solicitou supervisor no chat: ${data.chatId}`);
    try {
      const connection = await oracledb.getConnection({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASS,
        connectString: process.env.ORACLE_CONN_STR
      });
      const sql = `
        SELECT U_SUP.CODUSUR
        FROM PCUSUARI U_VEND
        JOIN PCSUPERV S ON S.CODSUPERVISOR = U_VEND.CODSUPERVISOR
        JOIN PCUSUARI U_SUP ON U_SUP.CODUSUR = S.COD_CADRCA
        WHERE U_VEND.CODUSUR = :matricula
      `;
      const result = await connection.execute(sql, { matricula: socket.data.matricula });
      await connection.close();

      if (result.rows && result.rows.length > 0) {
        const supervisorMatricula = result.rows[0][0];
        console.log(`Supervisor do vendedor ${socket.data.matricula} é o ${supervisorMatricula}`);
        // Dispara apenas para o supervisor correspondente
        io.to(`user_${supervisorMatricula}`).emit('supervisor_solicitado', {
          vendedor: socket.data.matricula,
          cliente: data.chatId,
          motivo: data.motivo
        });
      } else {
        console.log(`Supervisor não encontrado para o vendedor ${socket.data.matricula}, fallback para todos`);
        io.to('room_supervisores').emit('supervisor_solicitado', {
          vendedor: socket.data.matricula,
          cliente: data.chatId,
          motivo: data.motivo
        });
      }
    } catch (err) {
      console.error('Erro ao buscar supervisor do vendedor:', err);
      // Fallback
      io.to('room_supervisores').emit('supervisor_solicitado', {
        vendedor: socket.data.matricula,
        cliente: data.chatId,
        motivo: data.motivo
      });
    }
  });

  socket.on('send-message', (data) => {
    console.log(`Mensagem enviada do painel:`, data);
    // TODO: Na Fase de Integração da API, aqui chamaremos a rota HTTP POST da Evolution API (sendText)
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] User disconnected: ${socket.id}`);
  });
});

// Endpoint interno para o Worker disparar eventos via Socket.io
app.post('/api/internal/emit', (req, res) => {
    // Basicamente permite apenas conexões locais/internas (opcional: validar IP/Token)
    const { roomName, eventName, payload } = req.body;
    if (roomName && eventName) {
        io.to(roomName).emit(eventName, payload);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: 'Missing roomName or eventName' });
    }
});

const PORT = process.env.PORT || 3001;
const initializeOracleDatabase = require('./scripts/init_oracle');
const cacheService = require('./services/cacheService');
const oraclePool = require('./services/oraclePool');
const webhookServerManager = require('./services/webhookServerManager');
const { exec } = require('child_process');

// Inicia o pool Oracle antes de qualquer coisa
oraclePool.initPool()
    .then(() => initializeOracleDatabase())
    .then(() => botMensagensService.loadCache().then(() => botMensagensService.startAutoRefresh()))
    .then(async () => {
        // Verifica config do webhook nativo e inicia se necessário
        try {
            const connection = await oraclePool.getConnection();
            const result = await connection.execute(`SELECT PORTA, TOKEN, ATIVO FROM CANAL_WEBHOOK_CONFIG WHERE ID = 1`);
            await connection.close();
            if (result.rows && result.rows.length > 0) {
                const [porta, token, ativo] = result.rows[0];
                if (ativo === 'S') {
                    // Fetch NOME_EMPRESA
                    let nomeEmpresa = 'webhook';
                    try {
                        const configConn = await oraclePool.getConnection();
                        const configResult = await configConn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'NOME_EMPRESA'`);
                        if (configResult.rows && configResult.rows.length > 0 && configResult.rows[0][0]) {
                            const rawName = configResult.rows[0][0];
                            nomeEmpresa = 'webhook-' + rawName.replaceAll(' ', '').toLowerCase();
                        }
                        await configConn.close();
                    } catch (e) {
                        console.error('[STARTUP] Erro ao buscar NOME_EMPRESA', e);
                    }

                    console.log(`[STARTUP] Iniciando webhook nativo na porta ${porta} com hostname ${nomeEmpresa}`);
                    
                    exec(`tailscale up --hostname=${nomeEmpresa} --accept-routes`, (upErr) => {
                        if (upErr) console.error('[STARTUP] Erro no tailscale up:', upErr.message);
                        
                        exec(`tailscale status --json`, (statusErr, stdout) => {
                            let domain = '';
                            if (!statusErr && stdout) {
                                try {
                                    const statusObj = JSON.parse(stdout);
                                    if (statusObj.Self && statusObj.Self.DNSName) {
                                        domain = statusObj.Self.DNSName.replace(/\\.$/, '');
                                    }
                                } catch(e){}
                            }
                            
                            const certCmd = domain ? `mkdir -p ../certs && tailscale cert --cert-file ../certs/webhook.crt --key-file ../certs/webhook.key ${domain}` : `mkdir -p ../certs`;

                            exec(certCmd, { cwd: __dirname }, (certErr) => {
                                if (certErr) console.error('[STARTUP] Erro no tailscale cert:', certErr.message);

                                webhookServerManager.startWebhookServer(porta, token);
                                
                                exec(`tailscale funnel -bg ${porta}`, (err) => {
                                    if(err) console.error('[STARTUP] Erro no tailscale funnel:', err.message);
                                });
                            });
                        });
                    });
                }
            }
        } catch (e) {
            console.error('[STARTUP] Erro ao carregar config de webhook:', e.message);
        }

        // Inicia a API imediatamente para não recusar conexões (ex: Tela de Login)
        server.listen(PORT, () => {
            console.log(`Backend server running on port ${PORT}`);
            console.log(`(Crons and Pollers are now running in the worker process)`);
        });

        // Inicia o carregamento do cache pesado em background
        cacheService.loadAll().then(() => {
            cacheService.startAutoRefresh();
        });
    })
    .catch(err => {
        console.error('Falha crítica ao inicializar o banco:', err);
    });

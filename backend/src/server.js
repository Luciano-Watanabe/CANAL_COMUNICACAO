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

global.io = io; // Disponibiliza o io globalmente para os controllers

const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const clientesRoutes = require('./routes/clientes');
const contatosRoutes = require('./routes/contatos');
const configRoutes = require('./routes/config');
const chatRoutes = require('./routes/chat');
const vendedoresRoutes = require('./routes/vendedores');
const produtosRoutes = require('./routes/produtos');
const importExportRoutes = require('./routes/importExport');
const campanhasRoutes = require('./routes/campanhas');
const analiseCnpjRoutes = require('./routes/analiseCnpj');
const whatsappRoutes = require('./routes/whatsapp');
const avisosRoutes = require('./routes/avisos');
const dashboardRoutes = require('./routes/dashboard');
const templatesRoutes = require('./routes/templates');
const visitasRoutes = require('./routes/visitas');
const automacoesRoutes = require('./routes/automacoes');
const metricasRoutes = require('./routes/metricas');
const rotasRoutes = require('./routes/rotas');

app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/contatos', contatosRoutes);
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/visitas', visitasRoutes);
app.use('/api/config', configRoutes);
app.use('/api/rotas', rotasRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/automacoes', automacoesRoutes);
app.use('/api', avisosRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', campanhasRoutes);
app.use('/api/analise-cnpj', analiseCnpjRoutes);
app.use('/api', metricasRoutes);
app.use('/api', whatsappRoutes);

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

initializeOracleDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
        console.log(`(Crons and Pollers are now running in the worker process)`);
    });
}).catch(err => {
    console.error('Falha crítica ao inicializar o banco:', err);
});

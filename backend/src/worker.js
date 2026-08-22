require('dotenv').config();
const oracledb = require('oracledb');
try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {
    console.warn('[WORKER] Aviso: Falha ao inicializar o Thick mode do Oracle. Pode ser que o Instant Client não esteja presente no container.', err.message);
}

const initializeOracleDatabase = require('./scripts/init_oracle');
const WebhookPoller = require('./services/webhookPoller');
const cacheService = require('./services/cacheService');

console.log('[WORKER] Inicializando processos em background...');

const oraclePool = require('./services/oraclePool');

oraclePool.initPool().then(() => initializeOracleDatabase()).then(async () => {

    console.log('[WORKER] Banco inicializado. Carregando Crons e Poller...');
    
    // Inicializa o cache para que os crons tenham acesso as configs globais
    await cacheService.loadAll();
    cacheService.startAutoRefresh();

    
    // Carrega os crons
    require('./services/statusCron');
    require('./services/cleanupCron');
    require('./services/automacoesCron');
    require('./services/vendedoresVisitasCron');
    require('./services/filaCron');
    require('./services/cnpjCron');
    require('./services/ieCron');
    require('./services/geradorRotasCron');
    require('./services/geolocalizacaoWorker'); // Worker de geolocalização (1 cliente a cada 1.5s)
    
    // Inicia o Webhook Poller
    const poller = new WebhookPoller();
    poller.start();
    
    console.log('[WORKER] Todos os processos em background estão rodando.');
}).catch(err => {
    console.error('[WORKER] Falha crítica ao inicializar o banco:', err);
    process.exit(1);
});

require('dotenv').config();
const initializeOracleDatabase = require('./scripts/init_oracle');
const WebhookPoller = require('./services/webhookPoller');

console.log('[WORKER] Inicializando processos em background...');

initializeOracleDatabase().then(() => {
    console.log('[WORKER] Banco inicializado. Carregando Crons e Poller...');
    
    // Carrega os crons
    require('./services/statusCron');
    require('./services/cleanupCron');
    require('./services/automacoesCron');
    require('./services/vendedoresVisitasCron');
    require('./services/filaCron');
    require('./services/cnpjCron');
    require('./services/ieCron');
    require('./services/geradorRotasCron');
    
    // Inicia o Webhook Poller
    const poller = new WebhookPoller();
    poller.start();
    
    console.log('[WORKER] Todos os processos em background estão rodando.');
}).catch(err => {
    console.error('[WORKER] Falha crítica ao inicializar o banco:', err);
    process.exit(1);
});

const cacheService = require('./src/services/cacheService');
async function run() {
    await cacheService.loadVendedoresAndClientes(require('./src/config/database'));
    console.log('Configs:', cacheService.globalConfigs);
    console.log('Destino:', cacheService.getDestinoFinal('5511999999999'));
    process.exit(0);
}
run();

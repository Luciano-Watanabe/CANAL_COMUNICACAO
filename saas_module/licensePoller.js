const axios = require('axios');
const evoGoService = require('./evoGoService');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CLIENT_ID = process.env.CLIENT_ID; // Ex: 'WMS_01'

/**
 * Consulta o limite de instâncias no Supabase para o cliente atual
 */
async function fetchLicenseLimit() {
    try {
        const response = await axios.get(`${SUPABASE_URL}/rest/v1/saas_licenses?client_id=eq.${CLIENT_ID}&select=max_instances,is_active`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.data && response.data.length > 0) {
            const license = response.data[0];
            if (!license.is_active) {
                console.warn('[SAAS] LICENÇA INATIVA! Bloqueando sistema.');
                return 0; // 0 instâncias permitidas
            }
            return license.max_instances;
        }
        
        console.warn('[SAAS] Cliente não encontrado na central de licenciamento.');
        return 0;
    } catch (error) {
        console.error('[SAAS ERROR] Erro ao buscar licenciamento:', error.message);
        return null;
    }
}

/**
 * Poller Anti-Fraude que roda periodicamente
 */
async function runLicenseGuard() {
    console.log('[SAAS GUARD] Verificando limites de instâncias...');
    const maxInstances = await fetchLicenseLimit();
    
    if (maxInstances === null) {
        console.log('[SAAS GUARD] Servidor central indisponível, tentando mais tarde.');
        return;
    }

    console.log(`[SAAS GUARD] Limite autorizado: ${maxInstances} instâncias.`);

    const activeInstances = await evoGoService.listInstancesFromEvoGo();
    
    if (activeInstances.length > maxInstances) {
        console.warn(`[SAAS GUARD] FRAUDE OU OVERQUOTA DETECTADA! Permitidas: ${maxInstances}, Ativas: ${activeInstances.length}. Realizando Rollback.`);
        
        // Remove as excedentes para forçar o limite
        const instancesToRemove = activeInstances.slice(maxInstances);
        for (const inst of instancesToRemove) {
            await evoGoService.deleteInstanceInEvoGo(inst.name);
            console.log(`[SAAS GUARD] Instância excedente removida: ${inst.name}`);
        }
    } else {
        console.log('[SAAS GUARD] Quota normalizada. Sistema operando em conformidade.');
    }
}

function startGuard() {
    runLicenseGuard();
    setInterval(runLicenseGuard, 60 * 60 * 1000); 
}

module.exports = {
    startGuard,
    fetchLicenseLimit
};

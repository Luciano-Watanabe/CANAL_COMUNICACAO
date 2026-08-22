const axios = require('axios');

const EVO_GO_URL = process.env.EVO_GO_URL;
const EVO_GO_GLOBAL_TOKEN = process.env.EVO_GO_GLOBAL_TOKEN;

/**
 * Lista todas as instâncias no EVO-GO (simulando a chamada real baseada no Swagger)
 */
async function listInstancesFromEvoGo() {
    try {
        const response = await axios.get(`${EVO_GO_URL}/instance/fetchInstances`, {
            headers: {
                'apikey': EVO_GO_GLOBAL_TOKEN
            }
        });
        
        // A depender do formato da EVO-GO (v1 ou v2)
        if (response.data && Array.isArray(response.data)) {
            return response.data; // [{ name: '...', instanceId: '...' }]
        }
        return [];
    } catch (error) {
        console.error('[EVO-GO ERROR] Falha ao listar instâncias:', error.message);
        return [];
    }
}

/**
 * Cria uma instância no EVO-GO configurando o Webhook automaticamente
 * @param {string} instanceName - Ex: joao.AGDIST
 * @param {string} publicTailscaleUrl - Ex: https://no.ts.net
 */
async function createInstance(instanceName, publicTailscaleUrl) {
    try {
        const webhookUrl = `${publicTailscaleUrl}/api/webhook/whats/${instanceName}`;
        console.log(`[EVO-GO] Criando instância '${instanceName}' com webhook '${webhookUrl}'...`);

        const payload = {
            instanceName: instanceName,
            token: instanceName, // Usamos o próprio nome como token da instância
            qrcode: true,
            advancedSettings: {
                webhookUrl: webhookUrl,
                webhook_by_events: false,
                webhook_events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"]
            }
        };

        const response = await axios.post(`${EVO_GO_URL}/instance/create`, payload, {
            headers: {
                'apikey': EVO_GO_GLOBAL_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[EVO-GO] Instância '${instanceName}' criada com sucesso.`);
        return response.data;
    } catch (error) {
        console.error(`[EVO-GO ERROR] Falha ao criar instância '${instanceName}':`, error.message);
        return null;
    }
}

/**
 * Deleta uma instância excedente (Ação de Rollback Anti-fraude)
 */
async function deleteInstanceInEvoGo(instanceName) {
    try {
        await axios.delete(`${EVO_GO_URL}/instance/delete/${instanceName}`, {
            headers: {
                'apikey': EVO_GO_GLOBAL_TOKEN
            }
        });
        return true;
    } catch (error) {
        console.error(`[EVO-GO ERROR] Falha ao deletar instância '${instanceName}':`, error.message);
        return false;
    }
}

module.exports = {
    listInstancesFromEvoGo,
    createInstance,
    deleteInstanceInEvoGo
};

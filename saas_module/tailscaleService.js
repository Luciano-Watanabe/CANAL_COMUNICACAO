const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Função para configurar o Funnel do Tailscale para a porta desejada
 * e capturar a URL pública HTTPS gerada.
 */
async function setupAndGetFunnelUrl(port = 3001) {
    try {
        console.log(`[TAILSCALE] Configurando Funnel para a porta ${port}...`);
        
        // Ativa o funnel
        await execPromise(`tailscale funnel --bg ${port}`);
        console.log('[TAILSCALE] Funnel ativado com sucesso.');

        // Obtém o status em JSON para extrair o domínio
        const { stdout } = await execPromise('tailscale status --json');
        const status = JSON.parse(stdout);
        
        if (status && status.Self && status.Self.DNSName) {
            // O DNSName vem com um ponto final (ex: no.tailnet.ts.net.), vamos remover
            let dnsName = status.Self.DNSName;
            if (dnsName.endsWith('.')) {
                dnsName = dnsName.slice(0, -1);
            }
            const publicUrl = `https://${dnsName}`;
            console.log(`[TAILSCALE] URL Pública gerada: ${publicUrl}`);
            return publicUrl;
        }

        throw new Error('Não foi possível obter o DNSName do Tailscale.');
    } catch (error) {
        console.error('[TAILSCALE ERROR] Falha ao configurar/obter o Funnel:', error.message);
        return null;
    }
}

module.exports = {
    setupAndGetFunnelUrl
};

const cron = require('node-cron');
const oracledb = require('oracledb');
const axios = require('axios');
const oraclePool = require('./oraclePool');

// Helper para formatar telefone
function telFormat(telefone) {
    if (!telefone) return null;
    let tel = telefone.replace(/\D/g, '');
    if (tel.startsWith('55') && tel.length === 12) {
        tel = tel.substring(0, 4) + '9' + tel.substring(4);
    } else if (!tel.startsWith('55') && tel.length === 10) {
        tel = '55' + tel.substring(0, 2) + '9' + tel.substring(2);
    } else if (!tel.startsWith('55') && tel.length === 11) {
        tel = '55' + tel;
    }
    return tel;
}

// Inicia o job de agendamento (roda a cada 5 minutos das 07:00 as 18:00)
cron.schedule('*/5 7-18 * * *', async () => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        
        // Verifica Configurações Globais
        const configRes = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE IN ('EVOLUTION_API_URL', 'SAC_BOT_CODUSUR', 'NOME_EMPRESA')`);
        const configs = {};
        configRes.rows.forEach(r => { configs[r[0]] = r[1]; });
        
        const apiUrl = configs['EVOLUTION_API_URL'];
        const sacBotCodusur = configs['SAC_BOT_CODUSUR'];
        const nomeEmpresa = configs['NOME_EMPRESA'] || 'Empresa';
        
        if (!apiUrl || !sacBotCodusur) return;
        
        // Pega Token e Instância do SAC BOT
        const tokenRes = await conn.execute(`SELECT API_TOKEN, INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :codusur`, { codusur: sacBotCodusur });
        if (tokenRes.rows.length === 0) return;
        
        const apiToken = tokenRes.rows[0][0];
        const instanceName = tokenRes.rows[0][1];
        
        // Busca agendamentos de hoje não enviados
        const sql = `
            SELECT t.ID, t.TELEFONE, t.CODCLI, 
                   t.AGENDAMENTO_CODPROD, t.AGENDAMENTO_QTDE, 
                   t.AGENDAMENTO_MOTORISTA_NOME, t.AGENDAMENTO_MOTORISTA_TEL
            FROM CANAL_SAC_TICKETS t
            WHERE TRUNC(t.DATA_AGENDAMENTO) = TRUNC(SYSDATE)
              AND t.AGENDAMENTO_ENVIADO = 'N'
        `;
        const result = await conn.execute(sql);
        
        const gruposCliente = new Map();
        const gruposMotorista = new Map();
        const gruposVendedor = new Map();
        const ticketsProcessados = [];

        for (const row of result.rows) {
            const ticketId = row[0];
            const cliTelefone = row[1];
            const codcli = row[2];
            const codprod = row[3];
            const qtde = row[4];
            const motoristaNome = row[5];
            const motoristaTel = row[6];
            
            let fantasia = '';
            let clienteNome = '';
            let codusur = '';
            let enderecoCompleto = '';
            let produtoNome = '';
            let vendedorTel = '';
            
            // Dados do Cliente
            if (codcli) {
                const cliRes = await conn.execute(`
                    SELECT CLIENTE, FANTASIA, ENDERENT, MUNICENT, ESTENT, CODUSUR1 
                    FROM PCCLIENT 
                    WHERE CODCLI = :codcli
                `, { codcli });
                if (cliRes.rows.length > 0) {
                    clienteNome = cliRes.rows[0][0];
                    fantasia = cliRes.rows[0][1];
                    enderecoCompleto = `${cliRes.rows[0][2]}, ${cliRes.rows[0][3]} - ${cliRes.rows[0][4]}`;
                    codusur = cliRes.rows[0][5];
                }
            }
            
            // Dados do Produto
            if (codprod) {
                const prodRes = await conn.execute(`SELECT DESCRICAO FROM PCPRODUT WHERE CODPROD = :codprod`, { codprod });
                if (prodRes.rows.length > 0) {
                    produtoNome = prodRes.rows[0][0];
                }
            }
            
            // Dados do Vendedor (Telefone)
            if (codusur) {
                const usurRes = await conn.execute(`SELECT TELEFONE1, TELEFONE2 FROM PCUSUARI WHERE CODUSUR = :codusur`, { codusur });
                if (usurRes.rows.length > 0) {
                    vendedorTel = usurRes.rows[0][0] || usurRes.rows[0][1];
                }
            }
            
            const prodStr = `- ${codprod || ''} - ${produtoNome || 'Produto n\u00e3o identificado'} (Qtd: ${qtde || ''})`;
            const nomeCliFormatado = `${codcli || 'S/C'} - ${fantasia || clienteNome || 'Cliente n\u00e3o identificado'}`;

            // Agrupa para Cliente
            if (cliTelefone) {
                const num = telFormat(cliTelefone);
                if (num) {
                    if (!gruposCliente.has(num)) gruposCliente.set(num, []);
                    gruposCliente.get(num).push(prodStr);
                }
            }
            
            // Agrupa para Motorista
            if (motoristaTel) {
                const num = telFormat(motoristaTel);
                if (num) {
                    if (!gruposMotorista.has(num)) gruposMotorista.set(num, new Map());
                    const cliMap = gruposMotorista.get(num);
                    if (!cliMap.has(nomeCliFormatado)) {
                        cliMap.set(nomeCliFormatado, {
                            endereco: enderecoCompleto,
                            telefone: cliTelefone,
                            produtos: []
                        });
                    }
                    cliMap.get(nomeCliFormatado).produtos.push(prodStr);
                }
            }

            // Agrupa para Vendedor
            if (vendedorTel) {
                const num = telFormat(vendedorTel);
                if (num) {
                    if (!gruposVendedor.has(num)) gruposVendedor.set(num, new Map());
                    const cliMap = gruposVendedor.get(num);
                    if (!cliMap.has(nomeCliFormatado)) {
                        cliMap.set(nomeCliFormatado, {
                            motorista: motoristaNome || 'N/A',
                            produtos: []
                        });
                    }
                    cliMap.get(nomeCliFormatado).produtos.push(prodStr);
                }
            }
            
            ticketsProcessados.push(ticketId);
        }

        // Função de envio (tenta Evolution API padrão, com fallback para Evo Go)
        const sendMsg = async (number, textMsg) => {
            if (!number) return;
            const payload = { number: number, text: textMsg };
            const urlEvo   = `${apiUrl}/message/sendText/${instanceName}`;
            const urlEvoGo = `${apiUrl}/send/text`;
            const headersEvo   = { 'apikey': apiToken, 'Content-Type': 'application/json' };
            const headersEvoGo = { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' };
            try {
                await axios.post(urlEvo, payload, { headers: headersEvo, timeout: 5000 });
            } catch(e) {
                if (e.response && e.response.status === 404) {
                    try {
                        await axios.post(urlEvoGo, payload, { headers: headersEvoGo, timeout: 5000 });
                    } catch(e2) {
                        console.error(`[AGENDAMENTO CRON] Erro ao enviar MSG (Evo Go) para ${number}:`, e2.message);
                    }
                } else {
                    console.error(`[AGENDAMENTO CRON] Erro ao enviar MSG para ${number}:`, e.message);
                }
            }
        };

        // Envia mensagens agrupadas - Cliente
        for (const [num, produtos] of gruposCliente.entries()) {
            const msgCliente = `Ol\u00e1! Aqui \u00e9 da *${nomeEmpresa}* e temos retiradas agendadas para hoje. Em breve nosso motorista ir\u00e1 comparecer e fazer a retirada, favor j\u00e1 deixar separado para agilizar o processo:\n\n${produtos.join('\n')}\n\nObrigado, tenha um bom dia!`;
            await sendMsg(num, msgCliente);
        }

        // Envia mensagens agrupadas - Motorista
        for (const [num, cliMap] of gruposMotorista.entries()) {
            let msgMotorista = `Ol\u00e1! Roteiro de retiradas de hoje:\n`;
            for (const [cliNome, cliData] of cliMap.entries()) {
                msgMotorista += `\n\uD83D\uDCCD *${cliNome}*\nEndere\u00e7o: ${cliData.endereco}\nTelefone: ${cliData.telefone}\nProdutos:\n${cliData.produtos.join('\n')}\n`;
            }
            await sendMsg(num, msgMotorista);
        }

        // Envia mensagens agrupadas - Vendedor
        for (const [num, cliMap] of gruposVendedor.entries()) {
            let msgVendedor = `Ol\u00e1! Retiradas agendadas para seus clientes hoje:\n`;
            for (const [cliNome, cliData] of cliMap.entries()) {
                msgVendedor += `\n\uD83D\uDC64 *${cliNome}*\nMotorista: ${cliData.motorista}\nProdutos:\n${cliData.produtos.join('\n')}\n`;
            }
            await sendMsg(num, msgVendedor);
        }

        // Atualiza status dos tickets no banco
        if (ticketsProcessados.length > 0) {
            // Separa em lotes de 900 itens para não estourar o limite da lista "IN" no Oracle
            const batchSize = 900;
            for (let i = 0; i < ticketsProcessados.length; i += batchSize) {
                const batch = ticketsProcessados.slice(i, i + batchSize);
                const binds = batch.map((_, idx) => `:${idx + 1}`).join(',');
                await conn.execute(
                    `UPDATE CANAL_SAC_TICKETS SET AGENDAMENTO_ENVIADO = 'S' WHERE ID IN (${binds})`, 
                    batch, 
                    { autoCommit: true }
                );
            }
            console.log(`[AGENDAMENTO CRON] Mensagens processadas e enviadas para ${ticketsProcessados.length} tickets.`);
        }
        
    } catch (error) {
        console.error('[AGENDAMENTO CRON] Erro:', error);
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

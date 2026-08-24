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
                    SELECT CLIENTE, FANTASIA, ENDENT, MUNICENT, ESTENT, CODUSUR 
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
            
            const dadosDoCliente = `${codcli || 'S/C'} - ${fantasia || clienteNome || 'Cliente não identificado'}\nTelefone: ${cliTelefone}`;
            
            // Dados do Produto
            if (codprod) {
                const prodRes = await conn.execute(`SELECT DESCRICAO FROM PCPRODUT WHERE CODPROD = :codprod`, { codprod });
                if (prodRes.rows.length > 0) {
                    produtoNome = prodRes.rows[0][0];
                }
            }
            const infoProduto = `${codprod || ''} - ${produtoNome || 'Produto não identificado'}\nQuantidade: ${qtde || ''}`;
            
            // Dados do Vendedor (Telefone)
            if (codusur) {
                const usurRes = await conn.execute(`SELECT TELEFONE1, TELEFONE2 FROM PCUSUARI WHERE CODUSUR = :codusur`, { codusur });
                if (usurRes.rows.length > 0) {
                    vendedorTel = usurRes.rows[0][0] || usurRes.rows[0][1];
                }
            }
            
            // Mensagens
            const msgCliente = `Olá! Aqui é da ${nomeEmpresa} e temos uma retirada agendada para hoje. Em breve nosso motorista irá comparecer e fazer a retirada, favor já deixar separado para agilizar o processo. Obrigado, tenha um bom dia`;
            const msgMotorista = `Olá! Preciso que passe no cliente:\n${dadosDoCliente}\n\nEndereço: ${enderecoCompleto}\n\nPara retirar:\n${infoProduto}`;
            const msgVendedor = `Olá! Para hoje temos a Retirada de Troca/Devolução com cliente:\n${dadosDoCliente}\n\nProduto:\n${infoProduto}\n\nO motorista ${motoristaNome} irá fazer a retirada.`;
            
            // Função de envio
            const sendMsg = async (telTo, textMsg) => {
                const number = telFormat(telTo);
                if (!number) return;
                const payload = { number: number, text: textMsg };
                const headersReq = { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' };
                try {
                    await axios.post(`${apiUrl}/message/sendText/${instanceName}`, payload, { headers: headersReq, timeout: 5000 });
                } catch(e) {
                    console.error(`Erro ao enviar MSG Agendamento para ${number}:`, e.message);
                }
            };
            
            // Envia mensagens
            await sendMsg(cliTelefone, msgCliente);
            if (motoristaTel) await sendMsg(motoristaTel, msgMotorista);
            if (vendedorTel) await sendMsg(vendedorTel, msgVendedor);
            
            // Atualiza status do ticket para não enviar novamente
            await conn.execute(`UPDATE CANAL_SAC_TICKETS SET AGENDAMENTO_ENVIADO = 'S' WHERE ID = :id`, { id: ticketId }, { autoCommit: true });
            console.log(`[AGENDAMENTO CRON] Mensagens enviadas para Ticket #${ticketId}`);
        }
        
    } catch (error) {
        console.error('[AGENDAMENTO CRON] Erro:', error);
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

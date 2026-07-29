const cron = require('node-cron');
const oracledb = require('oracledb');
const axios = require('axios');

let isProcessingIe = false;

// Roda a cada minuto
// API publica.cnpj.ws tem limite de 3 por minuto sem autenticação
cron.schedule('* * * * *', async () => {
    if (isProcessingIe) return;
    isProcessingIe = true;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Buscar clientes que têm CGCENT e IEENT preenchidos e não estão na CANAL_ANALISE_IE
        // Busca apenas 3 para não exceder o limite de 3/minuto da publica.cnpj.ws
        const sql = `
            SELECT CODCLI, CGCENT, IEENT, ESTENT
            FROM PCCLIENT C
            WHERE CGCENT IS NOT NULL
              AND IEENT IS NOT NULL 
              AND IEENT <> 'ISENTO'
              AND ESTENT IS NOT NULL
              AND LENGTH(REGEXP_REPLACE(CGCENT, '[^0-9]', '')) = 14
              AND C.DTEXCLUSAO IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM CANAL_ANALISE_IE A WHERE A.CODCLI = C.CODCLI
              )
            FETCH FIRST 2 ROWS ONLY
        `;
        
        const result = await connection.execute(sql);
        if (result.rows.length === 0) {
            isProcessingIe = false;
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
            return;
        }

        console.log(`[IE CRON] Analisando ${result.rows.length} IEs via CNPJ...`);

        const cleanStr = (str) => {
            if (!str) return '';
            return str.replace(/[^0-9]/g, '');
        };

        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows[i];
            const codcli = row[0];
            const cgcentOrig = row[1];
            const ieentOrig = row[2];
            const estentOrig = row[3];
            
            const cnpjFormatado = cleanStr(cgcentOrig);
            const ieFormatada = cleanStr(ieentOrig);

            let statusIe = 'ERRO';
            let novaIe = null;

            if (cnpjFormatado.length === 14) {
                try {
                    const res = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjFormatado}`, { timeout: 10000 });
                    
                    if (res.data && res.data.estabelecimento && res.data.estabelecimento.inscricoes_estaduais) {
                        const ies = res.data.estabelecimento.inscricoes_estaduais;
                        
                        // Procura a IE do mesmo Estado
                        const ieNoEstado = ies.find(i => i.estado.sigla === estentOrig);
                        
                        if (ieNoEstado) {
                            const ieApiFormatada = cleanStr(ieNoEstado.inscricao_estadual);
                            
                            if (ieApiFormatada === ieFormatada) {
                                statusIe = ieNoEstado.ativo ? 'ATIVA' : 'BAIXADA';
                            } else {
                                // Encontrou IE no estado, mas não bate com a nossa (o cliente pode ter mudado de endereço)
                                statusIe = ieNoEstado.ativo ? 'DESATUALIZADA' : 'BAIXADA (E DESATUALIZADA)';
                                novaIe = ieNoEstado.inscricao_estadual;
                            }
                        } else {
                            statusIe = 'NENHUMA IE NO ESTADO';
                        }
                    } else {
                        statusIe = 'SEM INSCRIÇÕES ESTADUAIS';
                    }
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        statusIe = 'CNPJ NÃO ENCONTRADO';
                    } else if (error.response && error.response.status === 429) {
                        console.warn(`[IE CRON] Rate limit atingido na publica.cnpj.ws.`);
                        statusIe = 'RATE_LIMIT';
                    } else {
                        console.error(`[IE CRON] Erro ao consultar CNPJ ${cnpjFormatado}:`, error.message);
                    }
                }
            } else {
                statusIe = 'CNPJ_INVALIDO';
            }

            if (statusIe !== 'RATE_LIMIT') {
                try {
                    await connection.execute(`
                        INSERT INTO CANAL_ANALISE_IE (CODCLI, CNPJ, IE_SISTEMA, UF_SISTEMA, SITUACAO_IE, IE_NOVA, ATUALIZADO_POR)
                        VALUES (:codcli, :cgcent, :ieent, :estent, :status, :novaIe, 'CRON')
                    `, {
                        codcli: codcli,
                        cgcent: cgcentOrig,
                        ieent: ieentOrig,
                        estent: estentOrig,
                        status: statusIe,
                        novaIe: novaIe
                    }, { autoCommit: true });
                } catch (insertErr) {
                    console.error(`[IE CRON] Erro ao salvar análise para CODCLI ${codcli}:`, insertErr.message);
                }
            } else {
                console.log(`[IE CRON] Interrompendo lote atual devido a rate limit.`);
                break; // Break the loop to not hammer the API when rate limited
            }

            // Espaçamento de 15 segundos entre cada uma para garantir que não bate o limite de 3/minuto
            if (i < result.rows.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
        }
    } catch (err) {
        console.error('[IE CRON] Erro geral:', err);
    } finally {
        isProcessingIe = false;
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

console.log('[CRON] Processador de análise de IE configurado.');

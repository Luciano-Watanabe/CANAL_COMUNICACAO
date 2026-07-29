const cron = require('node-cron');
const oracledb = require('oracledb');
const axios = require('axios');

let isProcessingCnpj = false;

// Roda a cada minuto
cron.schedule('* * * * *', async () => {
    if (isProcessingCnpj) return;
    isProcessingCnpj = true;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Buscar clientes que têm CGCENT preenchido e não estão na CANAL_ANALISE_CNPJ
        const sql = `
            SELECT CODCLI, CGCENT
            FROM PCCLIENT C
            WHERE CGCENT IS NOT NULL
              AND LENGTH(REGEXP_REPLACE(CGCENT, '[^0-9]', '')) = 14
              AND C.DTEXCLUSAO IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM CANAL_ANALISE_CNPJ A WHERE A.CODCLI = C.CODCLI
              )
            FETCH FIRST 5 ROWS ONLY
        `;
        
        const result = await connection.execute(sql);
        if (result.rows.length === 0) {
            isProcessingCnpj = false;
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
            return;
        }

        console.log(`[CNPJ CRON] Analisando ${result.rows.length} CNPJs...`);

        const cleanCnpj = (cnpj) => {
            if (!cnpj) return '';
            return cnpj.replace(/[^0-9]/g, '');
        };

        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows[i];
            const codcli = row[0];
            const cgcentOrig = row[1];
            const cnpjFormatado = cleanCnpj(cgcentOrig);

            let statusApi = 'ERRO';

            if (cnpjFormatado.length === 14) {
                try {
                    const res = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpjFormatado}`, { timeout: 8000 });
                    if (res.data && res.data.descricao_situacao_cadastral) {
                        statusApi = res.data.descricao_situacao_cadastral;
                    }
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        statusApi = 'NÃO ENCONTRADO';
                    } else if (error.response && error.response.status === 429) {
                        console.warn(`[CNPJ CRON] Rate limit atingido na Brasil API.`);
                        statusApi = 'RATE_LIMIT';
                    } else {
                        console.error(`[CNPJ CRON] Erro ao consultar CNPJ ${cnpjFormatado}:`, error.message);
                    }
                }
            } else {
                statusApi = 'CNPJ_INVALIDO';
            }

            if (statusApi !== 'RATE_LIMIT') {
                try {
                    await connection.execute(`
                        MERGE INTO CANAL_ANALISE_CNPJ A
                        USING (SELECT :codcli AS CODCLI, :cgcent AS CGCENT, :status AS SITUACAO_CADASTRAL, 'CRON' AS ATUALIZADO_POR FROM DUAL) B
                        ON (A.CODCLI = B.CODCLI)
                        WHEN MATCHED THEN
                            UPDATE SET A.SITUACAO_CADASTRAL = B.SITUACAO_CADASTRAL, A.DATA_ANALISE = CURRENT_TIMESTAMP
                        WHEN NOT MATCHED THEN
                            INSERT (CODCLI, CGCENT, SITUACAO_CADASTRAL, ATUALIZADO_POR)
                            VALUES (B.CODCLI, B.CGCENT, B.SITUACAO_CADASTRAL, B.ATUALIZADO_POR)
                    `, {
                        codcli: codcli,
                        cgcent: cgcentOrig,
                        status: statusApi
                    }, { autoCommit: true });
                } catch (insertErr) {
                    console.error(`[CNPJ CRON] Erro ao salvar análise para CODCLI ${codcli}:`, insertErr.message);
                }
            } else {
                console.log(`[CNPJ CRON] Interrompendo lote atual devido a rate limit.`);
                break;
            }

            if (i < result.rows.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    } catch (err) {
        console.error('[CNPJ CRON] Erro geral:', err);
    } finally {
        isProcessingCnpj = false;
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

console.log('[CRON] Processador de análise de CNPJ configurado.');

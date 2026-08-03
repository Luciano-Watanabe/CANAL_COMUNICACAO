const oracledb = require('oracledb');
const axios = require('axios');

const cacheService = require('./cacheService');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CanalDeComunicacao/1.0 (geocoder@empresa.com.br)';

let isProcessing = false;

async function processNextInQueue() {
    if (isProcessing) return;
    isProcessing = true;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const selectQuery = `
            SELECT CODCLI, ENDERECO_COMPLETO
            FROM PCCLIENT_GEOLOCACAO
            WHERE STATUS = 'P'
            FETCH FIRST 1 ROWS ONLY
        `;

        const result = await connection.execute(selectQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length > 0) {
            const item = result.rows[0];
            
            let status = 'E';
            let lat = null;
            let lon = null;
            let erroMotivo = null;

            try {
                // 1. Nominatim
                const response = await axios.get(NOMINATIM_URL, {
                    params: { q: item.ENDERECO_COMPLETO, format: 'json', limit: 1, countrycodes: 'br' },
                    headers: { 'User-Agent': USER_AGENT }
                });
                if (response.data && response.data.length > 0) {
                    lat = String(response.data[0].lat);
                    lon = String(response.data[0].lon);
                    status = 'O';
                } else {
                    erroMotivo = 'Não achou no Nominatim';
                }
            } catch (err) { erroMotivo = 'Nominatim Erro: ' + err.message; }

            // 2. LocationIQ Fallback
            if (status !== 'O') {
                const locIqKey = cacheService.globalConfigs['LOCATIONIQ_API_KEY'];
                if (locIqKey) {
                    try {
                        const response = await axios.get('https://us1.locationiq.com/v1/search.php', {
                            params: { key: locIqKey, q: item.ENDERECO_COMPLETO, format: 'json', limit: 1 }
                        });
                        if (response.data && response.data.length > 0) {
                            lat = String(response.data[0].lat);
                            lon = String(response.data[0].lon);
                            status = 'O';
                            erroMotivo = null;
                        } else { erroMotivo += ' | Não achou LocIQ'; }
                    } catch (err) { erroMotivo += ' | LocIQ Erro: ' + err.message; }
                }
            }

            // 3. Geoapify Fallback
            if (status !== 'O') {
                const geoKey = cacheService.globalConfigs['GEOAPIFY_API_KEY'];
                if (geoKey) {
                    try {
                        const response = await axios.get('https://api.geoapify.com/v1/geocode/search', {
                            params: { text: item.ENDERECO_COMPLETO, apiKey: geoKey, limit: 1 }
                        });
                        const features = response.data && response.data.features;
                        if (features && features.length > 0) {
                            lat = String(features[0].properties.lat);
                            lon = String(features[0].properties.lon);
                            status = 'O';
                            erroMotivo = null;
                        } else { erroMotivo += ' | Não achou Geoapify'; }
                    } catch (err) { erroMotivo += ' | Geoapify Erro: ' + err.message; }
                }
            }

            try {
                const updateQuery = `
                    UPDATE PCCLIENT_GEOLOCACAO
                    SET LATITUDE = :lat, LONGITUDE = :lon, STATUS = :status, DATA_CONSULTA = SYSDATE, ERRO_MOTIVO = :motivo
                    WHERE CODCLI = :codcli
                `;

                await connection.execute(updateQuery, {
                    lat: lat,
                    lon: lon,
                    status: status,
                    motivo: erroMotivo,
                    codcli: item.CODCLI
                });
                
                await connection.commit();
                console.log(`[GEO WORKER] Cliente ${item.CODCLI} processado com status ${status}.`);
                
            } catch (apiError) {
                console.error(`[GEO WORKER] Erro na API para CODCLI ${item.CODCLI}:`, apiError.message);
                
                const erroMsg = apiError.message ? apiError.message.substring(0, 500) : 'Erro desconhecido na API';
                await connection.execute(`
                    UPDATE PCCLIENT_GEOLOCACAO SET STATUS = 'E', DATA_CONSULTA = SYSDATE, ERRO_MOTIVO = :motivo WHERE CODCLI = :codcli
                `, { motivo: erroMsg, codcli: item.CODCLI });
                await connection.commit();
            }
        }
    } catch (error) {
        // Ignorar logs de erro caso a tabela não exista, para não floodar o terminal
        if (error.message && !error.message.includes('ORA-00942')) {
            console.error('[GEO WORKER] Erro no worker de geolocalizacao:', error.message);
        }
    } finally {
        isProcessing = false;
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                // Ignore
            }
        }
    }
}

// Roda a cada 1.5 segundos respeitando o limite do Nominatim (1 req/seg)
setInterval(processNextInQueue, 1500);

console.log('[GEO WORKER] Worker de Geolocalização via Nominatim (a cada 1.5s) iniciado.');

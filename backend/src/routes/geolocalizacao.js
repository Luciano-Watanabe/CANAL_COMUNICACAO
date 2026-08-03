const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const axios = require('axios');
require('dotenv').config();
const cacheService = require('../services/cacheService');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CanalDeComunicacao/1.0 (geocoder@empresa.com.br)';

// Retorna o status atual da fila
router.get('/status', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const query = `
            SELECT 
                SUM(CASE WHEN STATUS = 'P' THEN 1 ELSE 0 END) AS pendentes,
                SUM(CASE WHEN STATUS = 'O' THEN 1 ELSE 0 END) AS processados_ok,
                SUM(CASE WHEN STATUS = 'E' THEN 1 ELSE 0 END) AS erros,
                COUNT(*) AS total
            FROM PCCLIENT_GEOLOCACAO
        `;

        const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('Erro ao buscar status da fila:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor', error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// Alimenta a fila com clientes sem latitude/longitude
router.post('/alimentar', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Seleciona clientes que não tem latitude e não estão na fila
        const selectQuery = `
            SELECT CODCLI, ENDERENT, NUMEROENT, BAIRROENT, MUNICENT, CEPENT 
            FROM PCCLIENT 
            WHERE (LATITUDE IS NULL OR LATITUDE = '' OR LATITUDE = '0')
              AND CODCLI NOT IN (SELECT CODCLI FROM PCCLIENT_GEOLOCACAO)
            FETCH FIRST 500 ROWS ONLY
        `;

        const result = await connection.execute(selectQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length === 0) {
            return res.json({ success: true, message: 'Nenhum cliente novo para adicionar à fila.' });
        }

        let insertedCount = 0;
        for (const cliente of result.rows) {
            const enderecoFormatado = `${cliente.ENDERENT || ''}, ${cliente.NUMEROENT || ''}, ${cliente.BAIRROENT || ''}, ${cliente.MUNICENT || ''} - CEP: ${cliente.CEPENT || ''}, Brasil`.replace(/\s+/g, ' ').trim();
            
            const insertQuery = `
                INSERT INTO PCCLIENT_GEOLOCACAO (CODCLI, ENDERECO_COMPLETO, STATUS, DATA_CONSULTA)
                VALUES (:codcli, :endereco, 'P', SYSDATE)
            `;

            try {
                await connection.execute(insertQuery, {
                    codcli: cliente.CODCLI,
                    endereco: enderecoFormatado
                });
                insertedCount++;
            } catch (insertErr) {
                console.error(`Erro ao inserir cliente ${cliente.CODCLI} na fila:`, insertErr);
            }
        }

        await connection.commit();
        res.json({ success: true, message: `${insertedCount} clientes adicionados à fila de processamento.` });

    } catch (error) {
        console.error('Erro ao alimentar fila:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor', error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// Processa o próximo lote da fila
router.post('/processar', async (req, res) => {
    let connection;
    try {
        const limit = req.body.limit || 5; // Limite pequeno padrão por causa do rate limit do Nominatim
        
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const selectQuery = `
            SELECT CODCLI, ENDERECO_COMPLETO
            FROM PCCLIENT_GEOLOCACAO
            WHERE STATUS = 'P'
            FETCH FIRST :limit ROWS ONLY
        `;

        const result = await connection.execute(selectQuery, { limit }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length === 0) {
            return res.json({ success: true, message: 'Fila vazia. Nenhum cliente pendente.' });
        }

        let processados = 0;
        let erros = 0;

        for (const item of result.rows) {
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
                if (status === 'O') {
                    processados++;
                } else {
                    erros++;
                    if (!erroMotivo) erroMotivo = 'Erro desconhecido nas APIs';
                }

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

                // Delay de 1s para respeitar limites genéricos, caso Nominatim e outras tenham rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (apiError) {
                console.error(`Erro na Atualização de BD para CODCLI ${item.CODCLI}:`, apiError.message);
                
                // Marca como erro
                await connection.execute(`
                    UPDATE PCCLIENT_GEOLOCACAO SET STATUS = 'E', DATA_CONSULTA = SYSDATE, ERRO_MOTIVO = :motivo WHERE CODCLI = :codcli
                `, { codcli: item.CODCLI, motivo: 'Erro ao atualizar DB: ' + apiError.message });
                
                erros++;
            }
        }

        await connection.commit();
        res.json({ 
            success: true, 
            message: `Lote processado. ${processados} encontrados, ${erros} não encontrados.`,
            processados,
            erros
        });

    } catch (error) {
        console.error('Erro ao processar fila:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor', error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// Migra os processados para a PCCLIENT principal
router.post('/migrar', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Pega todos com status O
        const selectQuery = `
            SELECT CODCLI, LATITUDE, LONGITUDE
            FROM PCCLIENT_GEOLOCACAO
            WHERE STATUS = 'O'
        `;

        const result = await connection.execute(selectQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length === 0) {
            return res.json({ success: true, message: 'Nenhum registro validado (Status O) para migrar.' });
        }

        let migrados = 0;

        // Ideal seria um MERGE ou UPDATE com JOIN, mas como pode haver limites no Oracle ou na versão, faremos loop ou batch.
        for (const item of result.rows) {
            const updateQuery = `
                UPDATE PCCLIENT
                SET LATITUDE = :lat, LONGITUDE = :lon
                WHERE CODCLI = :codcli
            `;
            await connection.execute(updateQuery, {
                lat: item.LATITUDE,
                lon: item.LONGITUDE,
                codcli: item.CODCLI
            });

            // Apaga ou muda status
            await connection.execute(`
                DELETE FROM PCCLIENT_GEOLOCACAO WHERE CODCLI = :codcli
            `, { codcli: item.CODCLI });
            
            migrados++;
        }

        await connection.commit();
        res.json({ success: true, message: `${migrados} coordenadas migradas com sucesso para a base principal!` });

    } catch (error) {
        console.error('Erro ao migrar dados:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor', error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

module.exports = router;

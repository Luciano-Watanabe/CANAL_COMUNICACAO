/**
 * oraclePool.js — Pool de conexões Oracle compartilhado
 *
 * Cria o pool UMA vez no startup do servidor e o reutiliza em todos os
 * módulos que precisam de conexão. Isso elimina o overhead de autenticação
 * em cada request, que era a causa principal da lentidão (~3-5 min/req).
 */

const oracledb = require('oracledb');
oracledb.fetchAsString = [oracledb.CLOB];

let pool = null;

/**
 * Inicializa o pool Oracle. Deve ser chamado UMA VEZ no startup (server.js).
 */
async function initPool() {
    if (pool) {
        console.log('[OraclePool] Pool já está ativo, ignorando re-inicialização.');
        return pool;
    }

    try {
        pool = await oracledb.createPool({
            user:          process.env.ORACLE_USER,
            password:      process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR,
            poolMin:       2,        // Conexões mínimas sempre abertas
            poolMax:       10,       // Máximo de conexões simultâneas
            poolIncrement: 1,        // Quantas abrir quando precisar de mais
            poolTimeout:   60,       // Segundos antes de fechar conexões ociosas
            poolPingInterval: 60,    // Verificar se conexões ainda estão vivas
            stmtCacheSize: 30,       // Cache de statements preparados
        });
        console.log(`[OraclePool] ✅ Pool criado com sucesso (min=${pool.poolMin}, max=${pool.poolMax})`);
        return pool;
    } catch (err) {
        console.error('[OraclePool] ❌ Erro ao criar pool:', err.message);
        throw err;
    }
}

/**
 * Obtém uma conexão do pool.
 * Deve ser liberada com conn.close() no bloco finally de cada request.
 */
async function getConnection() {
    if (!pool) {
        throw new Error('[OraclePool] Pool não inicializado. Chame initPool() no startup.');
    }
    return pool.getConnection();
}

/**
 * Retorna o pool atual (para diagnóstico).
 */
function getPool() {
    return pool;
}

module.exports = { initPool, getConnection, getPool };

const oracledb = require('oracledb');

class CacheService {
    constructor() {
        this.clientes = [];
        this.vendedores = [];
        this.hierarchyMap = {}; // { codusur_vendedor: { supervisor: codusur_sup, gerente: codusur_ger } }
        this.isLoaded = false;
        this.interval = null;
    }

    async loadAll() {
        console.log('[CACHE] Iniciando carregamento de Vendedores e Clientes para a memória...');
        let conn;
        try {
            conn = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });

            // 1. Load Hierarchy
            console.log('[CACHE] Carregando hierarquia...');
            const hierQuery = `
                SELECT U.CODUSUR, S.COD_CADRCA AS SUPERVISOR_CODUSUR, G.COD_CADRCA AS GERENTE_CODUSUR
                FROM PCUSUARI U
                LEFT JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                LEFT JOIN PCGERENTE G ON S.CODGERENTE = G.CODGERENTE
                WHERE U.BLOQUEIO = 'N' OR U.BLOQUEIO IS NULL
            `;
            const hierResult = await conn.execute(hierQuery);
            const newHierarchyMap = {};
            for (const row of hierResult.rows) {
                newHierarchyMap[String(row[0])] = {
                    supervisor: row[1] ? String(row[1]) : null,
                    gerente: row[2] ? String(row[2]) : null
                };
            }
            this.hierarchyMap = newHierarchyMap;

            // 2. Load Vendedores
            console.log('[CACHE] Carregando vendedores...');
            const vendQuery = `
                SELECT U.CODUSUR, U.NOME, U.TELEFONE1, U.TELEFONE2, U.BLOQUEIO
                FROM PCUSUARI U
                WHERE (U.BLOQUEIO = 'N' OR U.BLOQUEIO IS NULL)
            `;
            const vendResult = await conn.execute(vendQuery);
            this.vendedores = vendResult.rows.map(row => ({
                CODUSUR: String(row[0]),
                NOME: row[1],
                TELEFONE1: row[2],
                TELEFONE2: row[3],
                BLOQUEIO: row[4]
            }));

            // 3. Load Clientes (Deduplicated using ROW_NUMBER logic)
            console.log('[CACHE] Carregando clientes...');
            const cliQuery = `
                SELECT TRIM(TO_CHAR(CODCLI)) AS CODCLI, CLIENTE, FANTASIA, CNPJ, TELEFONE, BLOQUEIO, LIMITE_CREDITO, VENDEDOR_PRINCIPAL
                FROM (
                    SELECT 
                        CODCLI,
                        CODCLI || ' - ' || CASE 
                            WHEN TRIM(FANTASIA) IS NOT NULL 
                            THEN TRIM(FANTASIA) || ' (' || CLIENTE || ')' 
                            ELSE CLIENTE 
                        END AS CLIENTE,
                        FANTASIA,
                        CNPJ,
                        TELEFONE,
                        BLOQUEIO,
                        LIMITE_CREDITO,
                        VENDEDOR_PRINCIPAL,
                        ROW_NUMBER() OVER (PARTITION BY CODCLI ORDER BY TELEFONE DESC) as rn
                    FROM VW_CANAL_CLIENTES
                ) WHERE rn = 1
            `;
            const cliResult = await conn.execute(cliQuery);
            this.clientes = cliResult.rows.map(row => ({
                CODCLI: row[0],
                CLIENTE: row[1],
                FANTASIA: row[2],
                CNPJ: row[3],
                TELEFONE: row[4],
                BLOQUEIO: row[5],
                LIMITE_CREDITO: row[6],
                VENDEDOR_PRINCIPAL: row[7] ? String(row[7]) : null
            }));

            this.isLoaded = true;
            console.log(`[CACHE] Sucesso: ${this.vendedores.length} vendedores e ${this.clientes.length} clientes carregados na memória.`);

        } catch (err) {
            console.error('[CACHE] Erro ao carregar dados para o cache:', err);
        } finally {
            if (conn) {
                try { await conn.close(); } catch(e) {}
            }
        }
    }

    startAutoRefresh(intervalMs = 3600000) { // 1 hora
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
            this.loadAll();
        }, intervalMs);
        console.log(`[CACHE] Auto-refresh configurado para cada ${intervalMs / 60000} minutos.`);
    }

    getClientes() {
        return this.clientes;
    }

    getVendedores() {
        return this.vendedores;
    }

    getHierarchy(vendedorCodusur) {
        return this.hierarchyMap[vendedorCodusur] || { supervisor: null, gerente: null };
    }
}

// Export a single instance (singleton)
const cacheService = new CacheService();
module.exports = cacheService;

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
        const isFirstLoad = this.clientes.length === 0 && this.vendedores.length === 0;
        console.log(`[CACHE] Iniciando carregamento de Vendedores e Clientes para a memória... (Primeiro carregamento: ${isFirstLoad})`);
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
            const vendResult = await conn.execute(vendQuery, [], { resultSet: true });
            const rsVend = vendResult.resultSet;
            let rowsVend;
            let tempVendedores = [];
            while ((rowsVend = await rsVend.getRows(1000)) && rowsVend.length > 0) {
                const batch = rowsVend.map(row => ({
                    CODUSUR: String(row[0]),
                    NOME: row[1],
                    TELEFONE1: row[2],
                    TELEFONE2: row[3],
                    BLOQUEIO: row[4]
                }));
                if (isFirstLoad) {
                    this.vendedores.push(...batch);
                } else {
                    tempVendedores.push(...batch);
                }
            }
            await rsVend.close();
            if (!isFirstLoad) this.vendedores = tempVendedores;

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
            const cliResult = await conn.execute(cliQuery, [], { resultSet: true });
            const rsCli = cliResult.resultSet;
            let rowsCli;
            let tempClientes = [];
            while ((rowsCli = await rsCli.getRows(1000)) && rowsCli.length > 0) {
                const batch = rowsCli.map(row => ({
                    CODCLI: row[0],
                    CLIENTE: row[1],
                    FANTASIA: row[2],
                    CNPJ: row[3],
                    TELEFONE: row[4],
                    BLOQUEIO: row[5],
                    LIMITE_CREDITO: row[6],
                    VENDEDOR_PRINCIPAL: row[7] ? String(row[7]) : null
                }));
                if (isFirstLoad) {
                    this.clientes.push(...batch);
                } else {
                    tempClientes.push(...batch);
                }
            }
            await rsCli.close();
            if (!isFirstLoad) this.clientes = tempClientes;

            // 4. Load Mix de Atividades (COMPRAS_GERAIS)
            console.log('[CACHE] Calculando Mix de Produtos por Ramo de Atividade (COMPRAS_GERAIS)...');
            const atvQuery = `SELECT DISTINCT CODATV1 FROM PCCLIENT WHERE CODATV1 IS NOT NULL`;
            const atvResult = await conn.execute(atvQuery);
            
            const newMixAtividadeCache = {};
            for (const row of atvResult.rows) {
                const codatv1 = row[0];
                const mixQuery = `
                    WITH CLIENTES_ATIVIDADE AS (
                        SELECT CODCLI FROM PCCLIENT WHERE CODATV1 = :codatv1
                    ),
                    COMPRAS_GERAIS AS (
                        SELECT M.CODPROD, SUM(M.QT) AS QTD_TOTAL, COUNT(DISTINCT M.CODCLI) AS QTD_CLIENTES_COMPRARAM
                        FROM PCMOV M
                        JOIN CLIENTES_ATIVIDADE CA ON CA.CODCLI = M.CODCLI
                        WHERE M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                        AND EXISTS (
                            SELECT 1 FROM PCEMBALAGEM PE 
                            WHERE PE.CODPROD = M.CODPROD 
                            AND NVL(PE.ENVIAFV, 'N') = 'S' 
                            AND PE.DTINATIVO IS NULL
                        )
                        GROUP BY M.CODPROD
                    )
                    SELECT 
                        CG.CODPROD, 
                        P.DESCRICAO,
                        P.CODEPTO,
                        D.DESCRICAO AS DEPARTAMENTO,
                        NVL(PR.PVENDA, 0) AS PVENDA,
                        CG.QTD_TOTAL,
                        CG.QTD_CLIENTES_COMPRARAM,
                        PE.EAN,
                        PE.QTUNIT,
                        PE.FATOPRECO,
                        PE.UNIDADE_EMB,
                        PE.TIPOEMBALAGEM
                    FROM COMPRAS_GERAIS CG
                    JOIN PCPRODUT P ON P.CODPROD = CG.CODPROD
                    LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
                    LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
                    OUTER APPLY (
                        SELECT CODAUXILIAR AS EAN, QTUNIT, NVL(FATORPRECO, 1) AS FATOPRECO, UNMEDIDA AS UNIDADE_EMB, TIPOEMBALAGEM
                        FROM PCEMBALAGEM PE2
                        WHERE PE2.CODPROD = CG.CODPROD
                        AND NVL(PE2.ENVIAFV, 'N') = 'S' 
                        AND PE2.DTINATIVO IS NULL
                        ORDER BY PE2.QTUNIT DESC
                        FETCH FIRST 1 ROWS ONLY
                    ) PE
                    ORDER BY CG.QTD_CLIENTES_COMPRARAM DESC
                    FETCH FIRST 100 ROWS ONLY
                `;
                
                try {
                    const mixRes = await conn.execute(mixQuery, { codatv1 });
                    newMixAtividadeCache[codatv1] = mixRes.rows.map(m => ({
                        CODPROD: m[0],
                        DESCRICAO: m[1],
                        CODEPTO: m[2],
                        DEPARTAMENTO: m[3],
                        PVENDA: m[4],
                        QTD_TOTAL: m[5],
                        QTD_CLIENTES_COMPRARAM: m[6],
                        EAN: m[7],
                        QTUNIT: m[8],
                        FATOPRECO: m[9],
                        UNIDADE_EMB: m[10],
                        TIPOEMBALAGEM: m[11]
                    }));
                } catch(e) {
                    console.error(`[CACHE] Erro ao carregar MIX para Atividade ${codatv1}:`, e.message);
                }
            }
            this.mixAtividadeCache = newMixAtividadeCache;
            console.log(`[CACHE] Mix de ${atvResult.rows.length} Ramos de Atividade carregados.`);

            // 5. Load Mix Geral (Fallback para quando o cliente não tiver Mix por Atividade)
            console.log('[CACHE] Calculando Mix Geral (Fallback)...');
            const mixGeralQuery = `
                WITH PRODUTOS_ATIVOS AS (
                    SELECT P.CODPROD, P.DESCRICAO, P.CODEPTO, D.DESCRICAO AS DEPARTAMENTO, 
                           NVL(PR.PVENDA, 0) AS PVENDA
                    FROM PCPRODUT P
                    JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '1'
                    LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
                    LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
                    WHERE NVL(P.OBS2, 'X') NOT IN ('FL')
                      AND (E.QTESTGER - E.QTBLOQUEADA - E.QTRESERV) > 0
                )
                SELECT 
                    PA.CODPROD, 
                    PA.DESCRICAO,
                    PA.CODEPTO,
                    PA.DEPARTAMENTO,
                    PA.PVENDA,
                    PE.EAN,
                    PE.QTUNIT,
                    PE.FATOPRECO,
                    PE.UNIDADE_EMB,
                    PE.TIPOEMBALAGEM
                FROM PRODUTOS_ATIVOS PA
                OUTER APPLY (
                    SELECT CODAUXILIAR AS EAN, QTUNIT, NVL(FATORPRECO, 1) AS FATOPRECO, UNMEDIDA AS UNIDADE_EMB, TIPOEMBALAGEM
                    FROM PCEMBALAGEM PE2
                    WHERE PE2.CODPROD = PA.CODPROD
                    AND NVL(PE2.ENVIAFV, 'N') = 'S' 
                    AND PE2.DTINATIVO IS NULL
                    ORDER BY PE2.QTUNIT DESC
                    FETCH FIRST 1 ROWS ONLY
                ) PE
                WHERE ROWNUM <= 200
            `;
            try {
                const geralRes = await conn.execute(mixGeralQuery);
                this.mixGeralCache = geralRes.rows.map(m => ({
                    CODPROD: m[0],
                    DESCRICAO: m[1],
                    CODEPTO: m[2],
                    DEPARTAMENTO: m[3],
                    PVENDA: m[4],
                    EAN: m[5],
                    QTUNIT: m[6],
                    FATOPRECO: m[7],
                    UNIDADE_EMB: m[8],
                    TIPOEMBALAGEM: m[9],
                    QTD_TOTAL: 1, // mock para media
                    QTD_CLIENTES_COMPRARAM: 1 // mock para media
                }));
            } catch (e) {
                console.error(`[CACHE] Erro ao carregar MIX Geral:`, e.message);
            }

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

    getMixAtividade(codatv1) {
        return this.mixAtividadeCache[codatv1] || [];
    }

    getMixGeral() {
        return this.mixGeralCache || [];
    }
}

// Export a single instance (singleton)
const cacheService = new CacheService();
module.exports = cacheService;

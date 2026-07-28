const express = require('express');
const oracledb = require('oracledb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createMontage } = require('../services/imageMontage');
const router = express.Router();

const getImagePath = (codprod) => {
    const imagesDir = process.env.IMAGES_DIR || path.join(__dirname, '../../imagens_produtos');
    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'];
    if (!fs.existsSync(imagesDir)) return null;
    for (let ext of extensions) {
        const filePath = path.join(imagesDir, `${codprod}${ext}`);
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
};

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {
    // Pode já estar inicializado
}

router.get('/', async (req, res) => {
    const { codusur, role, vendedor, busca } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, message: 'codusur é obrigatório' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Buscando da view criada com ROW_NUMBER para evitar duplicidades
        let query = `
            SELECT TRIM(TO_CHAR(CODCLI)) AS CODCLI, CLIENTE, FANTASIA, CNPJ, TELEFONE, BLOQUEIO, LIMITE_CREDITO
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
                    ROW_NUMBER() OVER (PARTITION BY CODCLI ORDER BY TELEFONE DESC) as rn
                FROM VW_CANAL_CLIENTES
                WHERE 1=1
        `;
        let binds = {};

        if (role?.toLowerCase() === 'bot_gestor') {
            if (vendedor) {
                query += ` AND VENDEDOR_PRINCIPAL = :vendedor `;
                binds.vendedor = vendedor;
            }
        } else if (role?.toUpperCase() === 'GERENTE') {
            query += ` AND VENDEDOR_PRINCIPAL IN (
                SELECT U.CODUSUR 
                FROM PCUSUARI U
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :codusur)
            ) `;
            binds.codusur = codusur;
        } else if (role?.toUpperCase() === 'SUPERVISOR') {
            query += ` AND VENDEDOR_PRINCIPAL IN (
                SELECT U.CODUSUR 
                FROM PCUSUARI U
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR
                WHERE S.COD_CADRCA = :codusur
            ) `;
            binds.codusur = codusur;
        } else {
            query += ` AND VENDEDOR_PRINCIPAL = :codusur `;
            binds.codusur = codusur;
        }

        if (busca) {
            query += ` AND (UPPER(CLIENTE) LIKE UPPER(:busca) OR UPPER(FANTASIA) LIKE UPPER(:busca) OR CNPJ LIKE :busca) `;
            binds.busca = '%' + busca + '%';
        }

        query += `
            ) WHERE rn = 1
        `;

        query = `SELECT * FROM ( ${query} ) ORDER BY CLIENTE ASC`;
        
        const result = await connection.execute(query, binds);

        // Mapear os resultados para um array de objetos (usando metadados das colunas)
        const clientes = result.rows.map(row => {
            let obj = {};
            if (Array.isArray(row)) {
                result.metaData.forEach((meta, index) => {
                    obj[meta.name.toLowerCase()] = row[index];
                });
            } else {
                for (let key in row) {
                    obj[key.toLowerCase()] = row[key];
                }
            }
            return obj;
        });

        return res.json({ success: true, clientes });
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar clientes.' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Erro ao fechar conexão:', err);
            }
        }
    }
});

router.get('/:codcli/financeiro', async (req, res) => {
    const { codcli } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const query = `
            SELECT 
                COUNT(*) AS qtde_atraso,
                NVL(SUM(VALOR), 0) AS valor_atraso
            FROM PCPREST
            WHERE CODCLI = :codcli
              AND DTPAG IS NULL
              AND DTVENC < TRUNC(SYSDATE)
        `;
        const result = await connection.execute(query, { codcli });
        
        let atrasos = { qtde_atraso: 0, valor_atraso: 0 };
        if (result.rows.length > 0) {
            atrasos.qtde_atraso = result.rows[0][0];
            atrasos.valor_atraso = result.rows[0][1];
        }

        return res.json({ success: true, financeiro: atrasos });
    } catch (error) {
        console.error('Erro ao buscar financeiro do cliente:', error);
        return res.status(500).json({ success: false, message: 'Erro interno' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

router.get('/:codcli/pedidos', async (req, res) => {
    const { codcli } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const queryClient = `SELECT DTULTCOMP FROM PCCLIENT WHERE CODCLI = :codcli`;
        const resClient = await connection.execute(queryClient, { codcli });
        let dtultcomp = null;
        if (resClient.rows.length > 0) {
            dtultcomp = resClient.rows[0][0];
        }

        const queryDatas = `
            SELECT DISTINCT TRUNC(M.DTMOV) AS DTMOV
            FROM PCMOV M
            LEFT JOIN PCNFSAID N ON N.NUMTRANSVENDA = M.NUMTRANSVENDA
            LEFT JOIN PCPEDC C ON C.NUMPED = M.NUMPED
            WHERE M.CODCLI = :codcli 
              AND M.CODOPER IN ('S', 'ST', 'SB', 'SR')
              AND N.DTCANCEL IS NULL
              AND NVL(C.POSICAO, 'F') <> 'C'
            ORDER BY DTMOV DESC
            FETCH FIRST 3 ROWS ONLY
        `;
        const resDatas = await connection.execute(queryDatas, { codcli });

        let pedidos = [];
        
        for (const rowData of resDatas.rows) {
            const dtmov = rowData[0];
            
            const queryItens = `
                SELECT P.CODPROD, PR.DESCRICAO, SUM(P.QT) AS QT, MAX(P.PUNIT) AS PRECO_ANTIGO, MAX(NVL(TAB.PVENDA, PR.PVENDA)) AS PRECO_ATUAL, MAX(PE.DTINATIVO) AS DTINATIVO, MAX(PE.CODAUXILIAR) AS EAN,
                    (SELECT MAX(CASE WHEN NVL(ENVIAFV, 'N') = 'S' AND DTINATIVO IS NULL THEN 1 ELSE 0 END) FROM PCEMBALAGEM WHERE CODPROD = P.CODPROD) AS TEM_FV
                FROM PCMOV P
                LEFT JOIN PCPRODUT PR ON PR.CODPROD = P.CODPROD
                LEFT JOIN PCTABPR TAB ON TAB.CODPROD = P.CODPROD AND TAB.NUMREGIAO = 1
                LEFT JOIN PCNFSAID N ON N.NUMTRANSVENDA = P.NUMTRANSVENDA
                LEFT JOIN PCPEDC C ON C.NUMPED = P.NUMPED
                LEFT JOIN PCEMBALAGEM PE ON PE.CODPROD = P.CODPROD AND NVL(PE.ENVIAFV, 'N') = 'S'
                WHERE P.CODCLI = :codcli
                AND TRUNC(P.DTMOV) = TRUNC(:dtmov)
                AND P.CODOPER IN ('S', 'ST', 'SB', 'SR')
                AND N.DTCANCEL IS NULL
                AND NVL(C.POSICAO, 'F') <> 'C'
                GROUP BY P.CODPROD, PR.DESCRICAO
            `;
            const resItens = await connection.execute(queryItens, { codcli, dtmov });
            
            const itens = resItens.rows.map(itemRow => ({
                codprod: itemRow[0],
                descricao: itemRow[1],
                qt: itemRow[2],
                pvenda: itemRow[3],
                precoAtual: itemRow[4],
                inativo: itemRow[5] !== null,
                ean: itemRow[6],
                semFv: itemRow[7] === 0  // TEM_FV = 0 → sem embalagem ENVIAFV ativa
            }));

            // Calcula o vltotal com preco antigo
            const vltotal = itens.reduce((acc, item) => acc + (item.qt * item.pvenda), 0);

            if (itens.length > 0) {
                pedidos.push({
                    numped: 'MOV',
                    data: dtmov,
                    vltotal: vltotal,
                    itens: itens
                });
            }
        }

        return res.json({ success: true, dtultcomp, pedidos });
    } catch (error) {
        console.error('Erro ao buscar pedidos do cliente:', error);
        return res.status(500).json({ success: false, message: 'Erro interno' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

router.get('/esquecidos', async (req, res) => {
    const { codusur, role, dias, vendedorId } = req.query;
    if (!codusur || codusur === 'undefined' || isNaN(Number(codusur))) {
        return res.status(400).json({ success: false, error: 'codusur invalido ou obrigatorio' });
    }

    const diasFiltro = parseInt(dias) || 30;
    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    
    let extraFilter = '';
    let queryParams = { cod: codusur, dias: diasFiltro };
    
    if (vendedorId && vendedorId.trim() !== '') {
        extraFilter += ' AND C.CODUSUR1 = :vendedorId ';
        queryParams.vendedorId = vendedorId;
    }

    const { busca } = req.query;
    if (busca && busca.trim() !== '') {
        const buscaIsNumber = !isNaN(Number(busca.trim()));
        if (buscaIsNumber) {
            extraFilter += ' AND (UPPER(C.CLIENTE) LIKE UPPER(:buscaStr) OR UPPER(C.FANTASIA) LIKE UPPER(:buscaStr) OR C.CODCLI = :buscaNum) ';
            queryParams.buscaStr = `%${busca.trim()}%`;
            queryParams.buscaNum = Number(busca.trim());
        } else {
            extraFilter += ' AND (UPPER(C.CLIENTE) LIKE UPPER(:buscaStr) OR UPPER(C.FANTASIA) LIKE UPPER(:buscaStr)) ';
            queryParams.buscaStr = `%${busca.trim()}%`;
        }
    }

    extraFilter += ` AND (
        EXISTS (SELECT 1 FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL))
        OR EXISTS (SELECT 1 FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND TELEFONE IS NOT NULL)
    ) `;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = '';
        if (roleUpper === 'BOT_GESTOR') {
            sql = `
                SELECT C.CODCLI, C.FANTASIA, C.CLIENTE AS RAZAO_SOCIAL, U.NOME AS VENDEDOR, 
                       TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) AS DIAS_COMPRA,
                       TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP,
                       A.RAMO AS RAMO_ATIVIDADE,
                       COALESCE(
                           (SELECT LISTAGG(NVL(TELEFONE, CELULAR), ',') WITHIN GROUP (ORDER BY CODCONTATO) FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL)),
                           (SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND ROWNUM = 1)
                       ) AS CONTATO,
                       C.CODATV1
                FROM PCCLIENT C
                LEFT JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                WHERE TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) > :dias
                  AND C.DTEXCLUSAO IS NULL
                  AND :cod IS NOT NULL
                  ${extraFilter}
                  AND UPPER(C.CLIENTE) NOT LIKE '%CONSUMIDOR FINAL%'
                  AND NOT EXISTS (
                      SELECT 1 
                      FROM CANAL_MENSAGENS M
                      JOIN VW_CANAL_CLIENTES V ON V.TELEFONE = M.TELEFONE_CLIENTE
                      WHERE V.CODCLI = C.CODCLI AND M.DATA_HORA >= TRUNC(SYSDATE) - :dias
                  )
                ORDER BY DIAS_COMPRA DESC
                FETCH FIRST 50 ROWS ONLY
            `;
        } else if (roleUpper === 'GERENTE') {
            sql = `
                SELECT C.CODCLI, C.FANTASIA, C.CLIENTE AS RAZAO_SOCIAL, U.NOME AS VENDEDOR, 
                       TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) AS DIAS_COMPRA,
                       TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP,
                       A.RAMO AS RAMO_ATIVIDADE,
                       COALESCE(
                           (SELECT LISTAGG(NVL(TELEFONE, CELULAR), ',') WITHIN GROUP (ORDER BY CODCONTATO) FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL)),
                           (SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND ROWNUM = 1)
                       ) AS CONTATO,
                       C.CODATV1
                FROM PCCLIENT C
                JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR
                LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
                  AND TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) > :dias
                  AND C.DTEXCLUSAO IS NULL
                  ${extraFilter}
                  AND UPPER(C.CLIENTE) NOT LIKE '%CONSUMIDOR FINAL%'
                  AND NOT EXISTS (
                      SELECT 1 
                      FROM CANAL_MENSAGENS M
                      JOIN VW_CANAL_CLIENTES V ON V.TELEFONE = M.TELEFONE_CLIENTE
                      WHERE V.CODCLI = C.CODCLI AND M.DATA_HORA >= TRUNC(SYSDATE) - :dias
                  )
                ORDER BY DIAS_COMPRA DESC
                FETCH FIRST 50 ROWS ONLY
            `;
        } else if (roleUpper === 'SUPERVISOR') {
            sql = `
                SELECT C.CODCLI, C.FANTASIA, C.CLIENTE AS RAZAO_SOCIAL, U.NOME AS VENDEDOR, 
                       TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) AS DIAS_COMPRA,
                       TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP,
                       A.RAMO AS RAMO_ATIVIDADE,
                       COALESCE(
                           (SELECT LISTAGG(NVL(TELEFONE, CELULAR), ',') WITHIN GROUP (ORDER BY CODCONTATO) FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL)),
                           (SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND ROWNUM = 1)
                       ) AS CONTATO,
                       C.CODATV1
                FROM PCCLIENT C
                JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR
                LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                WHERE S.COD_CADRCA = :cod
                  AND TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) > :dias
                  AND C.DTEXCLUSAO IS NULL
                  ${extraFilter}
                  AND UPPER(C.CLIENTE) NOT LIKE '%CONSUMIDOR FINAL%'
                  AND NOT EXISTS (
                      SELECT 1 
                      FROM CANAL_MENSAGENS M
                      JOIN VW_CANAL_CLIENTES V ON V.TELEFONE = M.TELEFONE_CLIENTE
                      WHERE V.CODCLI = C.CODCLI AND M.DATA_HORA >= TRUNC(SYSDATE) - :dias
                  )
                ORDER BY DIAS_COMPRA DESC
                FETCH FIRST 50 ROWS ONLY
            `;
        } else if (roleUpper === 'VENDEDOR') {
            sql = `
                SELECT C.CODCLI, C.FANTASIA, C.CLIENTE AS RAZAO_SOCIAL, U.NOME AS VENDEDOR, 
                       TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) AS DIAS_COMPRA,
                       TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP,
                       A.RAMO AS RAMO_ATIVIDADE,
                       COALESCE(
                           (SELECT LISTAGG(NVL(TELEFONE, CELULAR), ',') WITHIN GROUP (ORDER BY CODCONTATO) FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL)),
                           (SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND ROWNUM = 1)
                       ) AS CONTATO,
                       C.CODATV1
                FROM PCCLIENT C
                LEFT JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                WHERE C.CODUSUR1 = :cod
                  AND TRUNC(SYSDATE) - TRUNC(NVL(C.DTULTCOMP, SYSDATE - 365)) > :dias
                  AND C.DTEXCLUSAO IS NULL
                  ${extraFilter}
                  AND UPPER(C.CLIENTE) NOT LIKE '%CONSUMIDOR FINAL%'
                  AND NOT EXISTS (
                      SELECT 1 
                      FROM CANAL_MENSAGENS M
                      JOIN VW_CANAL_CLIENTES V ON V.TELEFONE = M.TELEFONE_CLIENTE
                      WHERE V.CODCLI = C.CODCLI AND M.DATA_HORA >= TRUNC(SYSDATE) - :dias
                  )
                ORDER BY DIAS_COMPRA DESC
                FETCH FIRST 50 ROWS ONLY
            `;
        }

        if (sql) {
            const result = await connection.execute(sql, queryParams);
            const esquecidos = result.rows.map(r => ({
                codcli: r[0],
                fantasia: r[1],
                razao_social: r[2],
                vendedor: r[3],
                diasCompra: r[4],
                dtultcomp: r[5],
                ramo_atividade: r[6],
                telefone: r[7],
                codatv1: r[8]
            }));
            
            const uniqueRamos = [...new Set(esquecidos.map(c => c.codatv1).filter(c => c))];
            const produtosPorRamo = {};
            for (const codatv1 of uniqueRamos) {
                const sqlMix = `
                    SELECT P.DESCRICAO, NVL(PR.PVENDA, 0) AS PVENDA, P.UNIDADE
                    FROM (
                        SELECT M.CODPROD, SUM(M.QT) AS QTD, COUNT(DISTINCT M.CODCLI) AS CLI_QTD
                        FROM PCMOV M
                        JOIN PCCLIENT CA ON CA.CODCLI = M.CODCLI
                        WHERE CA.CODATV1 = :codatv1 AND M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                          AND EXISTS (
                              SELECT 1 FROM PCEST E 
                              WHERE E.CODPROD = M.CODPROD 
                              HAVING SUM(NVL(E.QTESTGER,0) - NVL(E.QTBLOQUEADA,0) - NVL(E.QTRESERV,0)) > 0
                          )
                          AND EXISTS (
                              SELECT 1 FROM PCEMBALAGEM EMB 
                              WHERE EMB.CODPROD = M.CODPROD 
                                AND NVL(EMB.ENVIAFV, 'N') = 'S' 
                                AND EMB.DTINATIVO IS NULL
                          )
                        GROUP BY M.CODPROD
                        ORDER BY CLI_QTD DESC
                        FETCH FIRST 10 ROWS ONLY
                    ) CG
                    JOIN PCPRODUT P ON P.CODPROD = CG.CODPROD
                    LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
                `;
                const mixRes = await connection.execute(sqlMix, { codatv1 });
                produtosPorRamo[codatv1] = mixRes.rows.map(r => `✅ ${r[0]} - R$ ${r[1].toFixed(2)} / ${r[2] || 'UN'}`).join('\n');
            }
            
            esquecidos.forEach(c => {
                const txtProdutos = produtosPorRamo[c.codatv1] || '(Sem ofertas no momento)';
                c.mensagem = `Olá! Não suma mais, falei com seu vendedor e consegui essas OFERTAS para vc!\nSegue alguns de nossos melhores preços para seu segmento!\n\n${txtProdutos}`;
            });
            
            return res.json({ success: true, esquecidos });
        } else {
            return res.json({ success: true, esquecidos: [] });
        }
    } catch (err) {
        console.error('Erro clientes esquecidos:', err);
        return res.status(500).json({ success: false });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.post('/:codcli/reativar', async (req, res) => {
    const { codcli } = req.params;
    const { codusur } = req.body;
    
    if (!codcli || !codusur) {
        return res.status(400).json({ success: false, message: 'codcli e codusur são obrigatórios' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // 1. Buscar dados do cliente priorizando o contato na PCCONTATO
        const resCli = await connection.execute(
            `SELECT 
                COALESCE((SELECT NOMECONTATO FROM PCCONTATO WHERE CODCLI = V.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL) AND ROWNUM = 1), V.CLIENTE) AS CLIENTE,
                COALESCE((SELECT NVL(TELEFONE, CELULAR) FROM PCCONTATO WHERE CODCLI = V.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL) AND ROWNUM = 1), V.TELEFONE) AS TELEFONE
             FROM VW_CANAL_CLIENTES V 
             WHERE V.CODCLI = :codcli`, 
            { codcli }
        );
        if (resCli.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        }
        const nomeCliente = resCli.rows[0][0];
        const telClienteOriginal = resCli.rows[0][1];
        if (!telClienteOriginal) {
            return res.status(400).json({ success: false, message: 'Cliente não possui telefone ou contato cadastrado' });
        }
        
        // Formatar telefone do cliente para o padrao internacional se nao tiver
        let telCliente = telClienteOriginal.replace(/\D/g, '');
        if (telCliente.length === 10 || telCliente.length === 11) {
            telCliente = '55' + telCliente;
        }

        // 2. Buscar dados do vendedor do cliente (Telefone e Nome)
        const resUsr = await connection.execute(`
            SELECT U.NOME, NVL(U.TELEFONE1, U.TELEFONE2) AS TELEFONE 
            FROM PCUSUARI U 
            JOIN PCCLIENT C ON C.CODUSUR1 = U.CODUSUR 
            WHERE C.CODCLI = :codcli
        `, { codcli });
        let nomeVendedor = 'Vendedor';
        let telVendedor = '';
        if (resUsr.rows.length > 0) {
            nomeVendedor = resUsr.rows[0][0];
            telVendedor = resUsr.rows[0][1] || '';
        }
        if (telVendedor) {
            telVendedor = telVendedor.replace(/\D/g, '');
            if (telVendedor.length === 10 || telVendedor.length === 11) {
                telVendedor = '55' + telVendedor;
            }
        } else {
            telVendedor = '551281466409'; // Fallback padrao se o vendedor nao tiver telefone no banco
        }

        // Buscar credenciais da API Evolution pelo token global informado pelo usuário
        const configResult = await connection.execute(`
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.API_TOKEN = 'TOKEN_121817072026'
        `);

        if (configResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Token não cadastrado.' });
        }

        const instanceName = configResult.rows[0][0];
        const evoToken = configResult.rows[0][1];
        let evoUrl = configResult.rows[0][2];
        if (evoUrl.endsWith('/')) evoUrl = evoUrl.slice(0, -1);

        const headers = {
            'apikey': evoToken,
            'instance': instanceName,
            'Content-Type': 'application/json'
        };

        // 3. Preparar a lista de produtos (top 4 do Ramo do cliente)
        const resRamo = await connection.execute(`SELECT CODATV1 FROM PCCLIENT WHERE CODCLI = :codcli`, { codcli });
        let codatv1 = resRamo.rows.length > 0 ? resRamo.rows[0][0] : null;
        let base64Data = null;
        let txtProdutos = '';
        
        if (codatv1) {
            const sqlMix = `
                SELECT 
                    CG.CODPROD, P.DESCRICAO, NVL(PR.PVENDA, 0) AS PVENDA, P.UNIDADE
                FROM (
                    SELECT M.CODPROD, SUM(M.QT) AS QTD_TOTAL, COUNT(DISTINCT M.CODCLI) AS QTD_CLIENTES_COMPRARAM
                    FROM PCMOV M
                    JOIN PCCLIENT CA ON CA.CODCLI = M.CODCLI
                    WHERE CA.CODATV1 = :codatv1 AND M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                      AND EXISTS (
                          SELECT 1 FROM PCEST E 
                          WHERE E.CODPROD = M.CODPROD 
                          HAVING SUM(NVL(E.QTESTGER,0) - NVL(E.QTBLOQUEADA,0) - NVL(E.QTRESERV,0)) > 0
                      )
                      AND EXISTS (
                          SELECT 1 FROM PCEMBALAGEM EMB 
                          WHERE EMB.CODPROD = M.CODPROD 
                            AND NVL(EMB.ENVIAFV, 'N') = 'S' 
                            AND EMB.DTINATIVO IS NULL
                      )
                    GROUP BY M.CODPROD
                    ORDER BY QTD_CLIENTES_COMPRARAM DESC
                    FETCH FIRST 10 ROWS ONLY
                ) CG
                JOIN PCPRODUT P ON P.CODPROD = CG.CODPROD
                LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
            `;
            const mixRes = await connection.execute(sqlMix, { codatv1 });
            if (mixRes.rows.length > 0) {
                const cards = mixRes.rows.map(r => ({
                    codprod: r[0],
                    title: r[1],
                    text: `1x - R$ ${r[2].toFixed(2)} / ${r[3] || 'UN'}`,
                    imagePath: getImagePath(r[0])
                }));
                base64Data = await createMontage(cards);
                txtProdutos = mixRes.rows.map(r => `✅ ${r[1]} - R$ ${r[2].toFixed(2)} / ${r[3] || 'UN'}`).join('\n');
            }
        }

        // 4. Preparar as 4 mensagens (Regra 2.5)
        const msgClienteTxt = {
            number: telCliente,
            text: `Olá! Não suma mais, falei com seu vendedor e consegui essas OFERTAS para vc!\nSegue alguns de nossos melhores preços para seu segmento!\n\n${txtProdutos || '(A imagem do panfleto estará disponível em breve)'}`
        };
        const msgClienteVcard = {
            number: telCliente,
            contactName: nomeVendedor,
            contactNumber: telVendedor
        };

        const msgVendedorTxt = {
            number: telVendedor,
            text: `Boa tarde! O Cliente ${nomeCliente.trim()} está procurando por nossos produtos! Entre em contato com ele`
        };
        const msgVendedorVcard = {
            number: telVendedor,
            contactName: nomeCliente.trim(),
            contactNumber: telCliente
        };

        // Função auxiliar para enviar com try/catch para nao quebrar se 1 falhar
        const sendEvo = async (endpoint, payload) => {
            try {
                await axios.post(`${evoUrl}${endpoint}`, payload, { headers, timeout: 5000 });
            } catch (err) {
                console.error(`Erro ao disparar para ${endpoint}:`, err.message);
            }
        };

        // 5. Disparar (Para o cliente)
        if (base64Data) {
            await sendEvo(`/message/sendMedia/${instanceName}`, {
                number: telCliente,
                mediatype: 'image',
                mimetype: 'image/jpeg',
                fileName: `encarte_${Date.now()}.jpg`,
                caption: '',
                media: base64Data
            });
            await new Promise(r => setTimeout(r, 1000));
        }

        await sendEvo(`/message/sendText/${instanceName}`, msgClienteTxt);
        await new Promise(r => setTimeout(r, 1000));

        await sendEvo(`/message/sendContact/${instanceName}`, msgClienteVcard);
        
        // 6. Disparar (Para o vendedor)
        await new Promise(r => setTimeout(r, 1000));
        await sendEvo(`/message/sendText/${instanceName}`, msgVendedorTxt);
        await new Promise(r => setTimeout(r, 1000));
        await sendEvo(`/message/sendContact/${instanceName}`, msgVendedorVcard);

        // 6. Registrar na CANAL_MENSAGENS para retirar do "esquecidos"
        const idMsg = `reativ_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        await connection.execute(`
            INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
            VALUES (:id, :cod, :tel, 'OUT', :txt)
        `, {
            id: idMsg,
            cod: codusur,
            tel: telCliente,
            txt: '[AUTO] Fluxo de Reativação Enviado'
        }, { autoCommit: true });

        return res.json({ success: true, message: 'Reativação enviada com sucesso!' });

    } catch (err) {
        console.error('Erro ao reativar cliente:', err);
        return res.status(500).json({ success: false, message: 'Erro interno na reativação' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.post('/reativacao/fila', async (req, res) => {
    const { fila, codusur } = req.body;
    if (!fila || !Array.isArray(fila) || fila.length === 0) {
        return res.status(400).json({ success: false, message: 'Fila vazia' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Insert em lote (batch) na tabela CANAL_REATIVACAO_FILA
        const sql = `
            INSERT INTO CANAL_REATIVACAO_FILA (ID, CODCLI, TELEFONE, CODUSUR, MENSAGEM_TXT, CODATV1, STATUS, DATA_CRIACAO)
            VALUES (SEQ_CANAL_REATIVACAO_FILA.NEXTVAL, :codcli, :telefone, :codusur, :mensagem, :codatv1, 'PENDENTE', SYSDATE)
        `;

        const binds = fila.map(c => ({
            codcli: c.codcli,
            telefone: c.telefone || c.contato || '',
            codusur: codusur || c.vendedor_codusur || 9999, // default
            mensagem: c.mensagem || '',
            codatv1: c.codatv1 || null
        }));

        await connection.executeMany(sql, binds, { autoCommit: true });

        return res.json({ success: true, message: 'Fila salva com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar fila:', err);
        return res.status(500).json({ success: false, message: 'Erro ao salvar fila no banco de dados' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/reativacao/fila/status', async (req, res) => {
    const { codusur } = req.query;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = `
            SELECT STATUS, COUNT(*) AS QTD 
            FROM CANAL_REATIVACAO_FILA 
            WHERE DATA_CRIACAO >= TRUNC(SYSDATE)
        `;
        let params = {};
        if (codusur) {
            sql += ` AND CODUSUR = :codusur`;
            params.codusur = codusur;
        }
        sql += ` GROUP BY STATUS`;

        const result = await connection.execute(sql, params);
        
        let pendentes = 0;
        let enviados = 0;
        let erros = 0;

        result.rows.forEach(r => {
            if (r[0] === 'PENDENTE' || r[0] === 'PROCESSANDO') pendentes += r[1];
            if (r[0] === 'ENVIADO') enviados += r[1];
            if (r[0] === 'ERRO') erros += r[1];
        });

        return res.json({ success: true, pendentes, enviados, erros });
    } catch (err) {
        console.error('Erro ao buscar status da fila:', err);
        return res.status(500).json({ success: false, message: 'Erro ao buscar status' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/reativacao/fila/items', async (req, res) => {
    const { codusur } = req.query;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = `
            SELECT ID, CODCLI, TELEFONE, STATUS, DATA_CRIACAO, LOG_ERRO
            FROM CANAL_REATIVACAO_FILA
            WHERE DATA_CRIACAO >= TRUNC(SYSDATE) - 7
        `;
        let params = {};
        if (codusur) {
            sql += ` AND CODUSUR = :codusur`;
            params.codusur = codusur;
        }
        sql += ` ORDER BY DATA_CRIACAO DESC FETCH FIRST 500 ROWS ONLY`;

        const result = await connection.execute(sql, params);
        
        const items = result.rows.map(r => ({
            id: r[0],
            codcli: r[1],
            telefone: r[2],
            status: r[3],
            data_criacao: r[4],
            log_erro: r[5]
        }));

        return res.json({ success: true, items });
    } catch (err) {
        console.error('Erro ao buscar items da fila:', err);
        return res.status(500).json({ success: false, message: 'Erro ao buscar items' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});
router.delete('/reativacao/historico/:codcli', async (req, res) => {
    const { codcli } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Apaga fila de disparo do cliente
        await connection.execute(`DELETE FROM CANAL_REATIVACAO_FILA WHERE CODCLI = :codcli`, { codcli }, { autoCommit: true });
        
        // Apaga logs de mensagens para voltar a aparecer na tela
        await connection.execute(`
            DELETE FROM CANAL_MENSAGENS 
            WHERE TELEFONE_CLIENTE IN (
                SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = :codcli
            )
        `, { codcli }, { autoCommit: true });

        return res.json({ success: true, message: 'Histórico limpo com sucesso' });
    } catch (err) {
        console.error('Erro ao limpar historico:', err);
        return res.status(500).json({ success: false, message: 'Erro ao limpar histórico' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

require('dotenv').config();
const oracledb = require('oracledb');
async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        const sqlCli = `
            SELECT C.CODCLI, NVL(C.FANTASIA, C.CLIENTE), R.DESCRICAO, C.CODUSUR1, 
                   TRUNC(SYSDATE - C.DTULTCOMP) AS DIAS_SEM_COMPRAR, C.CODRAMO
            FROM PCCLIENT C
            LEFT JOIN PCRAMOATIVIDADE R ON C.CODRAMO = R.CODRAMO
            WHERE C.CODCLI = :busca OR REPLACE(REPLACE(REPLACE(C.CGCENT, '.', ''), '/', ''), '-', '') = :busca
            FETCH FIRST 1 ROWS ONLY
        `;
        const resCli = await conn.execute(sqlCli, { busca: '123' });
        console.log(resCli);
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) await conn.close();
    }
}
run();

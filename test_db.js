const oracledb = require('oracledb');
async function run() {
    const conn = await oracledb.getConnection({
        user: process.env.ORACLE_USER, password: process.env.ORACLE_PASS, connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute('SELECT CODPROD, DESCRICAO, UNIDADE, QTUNITCX, PESOBRUTO, PESOLIQ FROM PCPRODUT WHERE DESCRICAO LIKE \'%4KG%\' FETCH FIRST 5 ROWS ONLY');
    console.log(result.rows);
    await conn.close();
}
run().catch(console.error);

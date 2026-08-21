const oracledb = require('oracledb');
async function run() {
    let conn = await oracledb.getConnection({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASS,
        connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT INSTANCE_NAME, API_URL FROM CANAL_TOKENS_EVOLUTION`);
    console.table(result.rows);
    
    const config = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE LIKE '%EVOLUTION%'`);
    console.table(config.rows);
    await conn.close();
}
run();

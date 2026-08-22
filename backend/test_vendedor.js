const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_21_12' });
async function run() {
    try {
        let conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const tel = '5512981466409';
        const result = await conn.execute(`
            SELECT CODUSUR, NOME, TELEFONE1, TELEFONE2 FROM PCUSUARI
            WHERE 
              (REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE1, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
               OR  REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE2, ' ', ''), '-', ''), '(', ''), ')', '') = :tel)
        `, { tel: tel });
        console.log('ResultQuery:', JSON.stringify(result.rows));
        await conn.close();
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
}
run();

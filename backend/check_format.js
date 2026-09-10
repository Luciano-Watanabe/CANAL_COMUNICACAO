require('dotenv').config({ path: '../.env' });
const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const res = await conn.execute(`SELECT SENTIDO, COUNT(*) FROM CANAL_MENSAGENS WHERE TELEFONE_CLIENTE = '5512981371613' GROUP BY SENTIDO`);
        console.log("Counts for 5512981371613:", res.rows);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();

require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/backend/.env' });
const oracledb = require('oracledb');

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        const result = await conn.execute(`SELECT table_name FROM all_tables WHERE table_name LIKE 'PCRAMO%'`);
        console.log(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) await conn.close();
    }
}
run();

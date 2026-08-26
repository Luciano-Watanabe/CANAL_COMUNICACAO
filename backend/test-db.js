const oracledb = require('oracledb');
require('dotenv').config({path: '../.env'});

async function run() {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_23_7' });
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const res = await conn.execute("SELECT column_name, data_type FROM all_tab_columns WHERE table_name = 'PCMETA'");
        console.log(res.rows);
    } catch(e) { console.error(e); }
    finally {
        if(conn) await conn.close();
        process.exit(0);
    }
}
run();

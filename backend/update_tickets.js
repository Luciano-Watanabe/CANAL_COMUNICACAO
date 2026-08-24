const oracledb = require('oracledb');
async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const result = await conn.execute(`UPDATE CANAL_SAC_TICKETS SET DEPARTAMENTO_ID = 41 WHERE DESCRICAO LIKE '%Troca/Devolução%' AND DEPARTAMENTO_ID IS NULL`);
        console.log("Updated rows:", result.rowsAffected);
        await conn.commit();
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
}
run();

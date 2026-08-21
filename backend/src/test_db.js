const oracledb = require('oracledb');
async function run() {
    let conn = await oracledb.getConnection({
        user: process.env.ORACLE_USER || 'system',
        password: process.env.ORACLE_PASS || 'oracle',
        connectString: process.env.ORACLE_CONN_STR || 'oracle:1521/XE'
    });
    const res = await conn.execute(`SELECT ID_MENSAGEM, TEXTO, MEDIA_URL, MEDIA_TYPE, TICKET_ID FROM CANAL_MENSAGENS WHERE TICKET_ID = 36`);
    console.log(res.rows);
    await conn.close();
}
run();

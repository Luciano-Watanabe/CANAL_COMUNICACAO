const oracledb = require('oracledb');
oracledb.fetchAsString = [oracledb.CLOB];

async function run() {
    let conn;
    try {
        const dbConfig = {
            user: process.env.DB_USER || 'JC',
            password: process.env.DB_PASSWORD || 'sucesso',
            connectString: process.env.DB_CONNECT_STRING || '192.168.10.155:1521/pdb1'
        };
        conn = await oracledb.getConnection(dbConfig);
        const res = await conn.execute("SELECT TELEFONE, ESTADO_ATUAL, DADOS_TEMPORARIOS FROM CANAL_BOT_STATE WHERE ESTADO_ATUAL = 'AGUARDANDO_DEPTO_TICKET'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch(e) { console.error(e); } finally { if (conn) await conn.close(); }
}
run();

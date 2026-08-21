require('dotenv').config();
const oracledb = require('oracledb');
const fs = require('fs');

async function run() {
    try {
        if (fs.existsSync('/opt/oracle/instantclient_19_21')) {
            oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
        }
    } catch (err) {}

    const conn = await oracledb.getConnection({
        user: process.env.ORACLE_USER || 'system',
        password: process.env.ORACLE_PASS || 'oracle',
        connectString: process.env.ORACLE_CONN_STR || 'localhost/XEPDB1'
    });

    let sql = `
        CREATE TABLE CANAL_LOG_IDENTIFICACAO_CLIENTE (
            ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            TELEFONE VARCHAR2(20),
            DOCUMENTO_INFORMADO VARCHAR2(50),
            CODCLI_LOCALIZADO NUMBER,
            OPCAO_USADA VARCHAR2(100),
            DATA_HORA DATE DEFAULT SYSDATE
        )
    `;
    try {
        await conn.execute(sql);
        console.log("Table CANAL_LOG_IDENTIFICACAO_CLIENTE created.");
    } catch (e) {
        console.log("Table CANAL_LOG_IDENTIFICACAO_CLIENTE might already exist:", e.message);
    }
    
    await conn.close();
}
run().catch(console.error);

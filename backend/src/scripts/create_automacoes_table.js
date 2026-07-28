const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    try {
        oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    } catch(e) {}
    
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const checkSql = "SELECT count(*) FROM user_tables WHERE table_name = 'CANAL_MENSAGENS_AUT_CONFIG'";
        const result = await connection.execute(checkSql);
        
        if (result.rows[0][0] === 0) {
            const createSql = `
                CREATE TABLE CANAL_MENSAGENS_AUT_CONFIG (
                    ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    TIPO_REGRA VARCHAR2(50) NOT NULL,
                    DIAS_GATILHO NUMBER,
                    DIA_ESPECIFICO VARCHAR2(20),
                    TEMPLATE_MENSAGEM VARCHAR2(4000) NOT NULL,
                    ATIVO CHAR(1) DEFAULT 'N',
                    CRIADO_EM DATE DEFAULT SYSDATE,
                    ATUALIZADO_EM DATE
                )
            `;
            await connection.execute(createSql);
            console.log("Tabela CANAL_MENSAGENS_AUT_CONFIG criada com sucesso!");
        } else {
            console.log("Tabela CANAL_MENSAGENS_AUT_CONFIG já existe.");
        }
    } catch (err) {
        console.error("Erro:", err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) {}
        }
    }
}
run();

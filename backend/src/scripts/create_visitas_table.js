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
        
        const checkSql = "SELECT count(*) FROM user_tables WHERE table_name = 'CANAL_VISITAS'";
        const result = await connection.execute(checkSql);
        
        if (result.rows[0][0] === 0) {
            const createSql = `
                CREATE TABLE CANAL_VISITAS (
                    ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    CODCLI NUMBER NOT NULL,
                    CODUSUR NUMBER NOT NULL,
                    DATA_AGENDADA DATE NOT NULL,
                    STATUS VARCHAR2(20) DEFAULT 'PENDENTE',
                    TIPO_MENSAGEM VARCHAR2(20) DEFAULT 'NENHUMA',
                    CRIADO_EM DATE DEFAULT SYSDATE,
                    ATUALIZADO_EM DATE
                )
            `;
            await connection.execute(createSql);
            console.log("Tabela CANAL_VISITAS criada com sucesso!");
        } else {
            console.log("Tabela CANAL_VISITAS já existe.");
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

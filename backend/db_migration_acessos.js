const oracledb = require('oracledb');
require('dotenv').config();

async function runMigration() {
    try {
        oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    } catch (err) {
        console.log('Oracle client already initialized or not found');
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        console.log('Conectado ao Oracle. Verificando tabela CANAL_SAC_ACESSOS...');

        const checkTable = `
            SELECT COUNT(*) AS count
            FROM USER_TABLES
            WHERE TABLE_NAME = 'CANAL_SAC_ACESSOS'
        `;
        const result = await connection.execute(checkTable);
        const tableExists = result.rows[0][0] > 0;

        if (!tableExists) {
            console.log('Criando tabela CANAL_SAC_ACESSOS...');
            const createTable = `
                CREATE TABLE CANAL_SAC_ACESSOS (
                    MATRICULA NUMBER NOT NULL,
                    DEPARTAMENTO_ID NUMBER NOT NULL,
                    PRIMARY KEY (MATRICULA, DEPARTAMENTO_ID),
                    FOREIGN KEY (DEPARTAMENTO_ID) REFERENCES CANAL_SAC_DEPARTAMENTOS(ID) ON DELETE CASCADE
                )
            `;
            await connection.execute(createTable);
            console.log('Tabela CANAL_SAC_ACESSOS criada com sucesso!');
        } else {
            console.log('Tabela CANAL_SAC_ACESSOS já existe.');
        }

    } catch (err) {
        console.error('Erro na migração:', err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
        process.exit(0);
    }
}

runMigration();

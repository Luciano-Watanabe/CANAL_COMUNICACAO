const oracledb = require('oracledb');
require('dotenv').config({ path: __dirname + '/../../.env' });

async function createReativacaoFilaTable() {
    let connection;
    try {
        console.log('Iniciando criação da tabela CANAL_REATIVACAO_FILA...');
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Tabela CANAL_REATIVACAO_FILA
        const tableSql = `
            CREATE TABLE CANAL_REATIVACAO_FILA (
                ID NUMBER PRIMARY KEY,
                CODCLI NUMBER NOT NULL,
                TELEFONE VARCHAR2(20),
                CODUSUR NUMBER NOT NULL,
                MENSAGEM_TXT VARCHAR2(4000),
                CODATV1 NUMBER,
                STATUS VARCHAR2(20) DEFAULT 'PENDENTE',
                LOG_ERRO VARCHAR2(4000),
                DATA_CRIACAO DATE DEFAULT SYSDATE,
                DATA_PROCESSAMENTO DATE
            )
        `;

        try {
            await connection.execute(tableSql);
            console.log('Tabela CANAL_REATIVACAO_FILA criada com sucesso.');
        } catch (e) {
            if (e.errorNum === 955) { // ORA-00955: name is already used by an existing object
                console.log('Tabela CANAL_REATIVACAO_FILA já existe.');
            } else {
                throw e;
            }
        }

        // Sequence
        const seqSql = `CREATE SEQUENCE SEQ_CANAL_REATIVACAO_FILA START WITH 1 INCREMENT BY 1 NOCACHE`;
        try {
            await connection.execute(seqSql);
            console.log('Sequence SEQ_CANAL_REATIVACAO_FILA criada com sucesso.');
        } catch (e) {
            if (e.errorNum === 955) {
                console.log('Sequence SEQ_CANAL_REATIVACAO_FILA já existe.');
            } else {
                throw e;
            }
        }

        // Trigger (optional for auto ID, but we can do it via code or trigger)
        const triggerSql = `
            CREATE OR REPLACE TRIGGER TRG_CANAL_REATIVACAO_FILA
            BEFORE INSERT ON CANAL_REATIVACAO_FILA
            FOR EACH ROW
            BEGIN
                IF :NEW.ID IS NULL THEN
                    SELECT SEQ_CANAL_REATIVACAO_FILA.NEXTVAL INTO :NEW.ID FROM DUAL;
                END IF;
            END;
        `;
        try {
            await connection.execute(triggerSql);
            console.log('Trigger TRG_CANAL_REATIVACAO_FILA criada com sucesso.');
        } catch (e) {
            console.error('Erro ao criar trigger:', e.message);
        }

    } catch (err) {
        console.error('Erro no script de criação:', err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

createReativacaoFilaTable();

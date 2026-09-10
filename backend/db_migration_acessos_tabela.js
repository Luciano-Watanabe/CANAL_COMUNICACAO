/**
 * Migração: Adiciona coluna TABELA à CANAL_SAC_ACESSOS
 *
 * Problema: A tabela não distinguia Atendente (PCEMPR) de Vendedor (PCUSUARI),
 * causando colisão quando ambos tinham o mesmo número de ID (ex: MATRICULA=1).
 *
 * Solução:
 *  1. Adiciona coluna TABELA VARCHAR2(10) com default 'PCEMPR' (retrocompatível)
 *  2. Recria a PK incluindo TABELA: (MATRICULA, DEPARTAMENTO_ID, TABELA)
 */

const oracledb = require('oracledb');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

        console.log('Conectado ao Oracle.');

        // 1. Verificar se a coluna TABELA já existe
        const checkCol = await connection.execute(
            `SELECT COUNT(*) AS CNT FROM USER_TAB_COLUMNS
             WHERE TABLE_NAME = 'CANAL_SAC_ACESSOS' AND COLUMN_NAME = 'TABELA'`
        );
        const colExists = checkCol.rows[0][0] > 0;

        if (colExists) {
            console.log('Coluna TABELA já existe em CANAL_SAC_ACESSOS. Nada a fazer.');
        } else {
            console.log('Adicionando coluna TABELA...');

            // 2. Dropar a PK existente (MATRICULA, DEPARTAMENTO_ID)
            //    Primeiro descobre o nome da constraint
            const pkQuery = await connection.execute(
                `SELECT CONSTRAINT_NAME FROM USER_CONSTRAINTS
                 WHERE TABLE_NAME = 'CANAL_SAC_ACESSOS' AND CONSTRAINT_TYPE = 'P'`
            );
            if (pkQuery.rows.length > 0) {
                const pkName = pkQuery.rows[0][0];
                console.log(`Dropando PK existente: ${pkName}`);
                await connection.execute(
                    `ALTER TABLE CANAL_SAC_ACESSOS DROP CONSTRAINT "${pkName}"`
                );
            }

            // 3. Adicionar coluna TABELA (nullable primeiro para não quebrar rows existentes)
            await connection.execute(
                `ALTER TABLE CANAL_SAC_ACESSOS ADD TABELA VARCHAR2(10)`
            );
            console.log('Coluna TABELA adicionada.');

            // 4. Preencher valores existentes como 'PCEMPR' (retrocompatível - eram todos atendentes)
            await connection.execute(
                `UPDATE CANAL_SAC_ACESSOS SET TABELA = 'PCEMPR' WHERE TABELA IS NULL`
            );
            await connection.commit();
            console.log('Registros existentes marcados como PCEMPR.');

            // 5. Tornar a coluna NOT NULL
            await connection.execute(
                `ALTER TABLE CANAL_SAC_ACESSOS MODIFY TABELA VARCHAR2(10) NOT NULL`
            );

            // 6. Recriar a PK incluindo TABELA
            await connection.execute(
                `ALTER TABLE CANAL_SAC_ACESSOS ADD CONSTRAINT PK_CANAL_SAC_ACESSOS
                 PRIMARY KEY (MATRICULA, DEPARTAMENTO_ID, TABELA)`
            );
            await connection.commit();
            console.log('Nova PK (MATRICULA, DEPARTAMENTO_ID, TABELA) criada com sucesso!');
        }

        // Verificação final
        const result = await connection.execute(
            `SELECT MATRICULA, DEPARTAMENTO_ID, TABELA FROM CANAL_SAC_ACESSOS WHERE ROWNUM <= 5`
        );
        console.log('\nAmostra de dados na tabela:');
        console.table(result.rows);

        console.log('\n✅ Migração concluída com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) {}
        }
        process.exit(1);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
        process.exit(0);
    }
}

runMigration();

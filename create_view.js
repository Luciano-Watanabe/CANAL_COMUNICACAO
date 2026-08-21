require('dotenv').config();
const oracledb = require('oracledb');
const fs = require('fs');

async function run() {
    try {
        if (fs.existsSync('/opt/oracle/instantclient_19_21')) {
            oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
        }
    } catch (err) {}

    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER || 'system',
            password: process.env.ORACLE_PASS || 'oracle',
            connectString: process.env.ORACLE_CONN_STR || 'localhost/XEPDB1'
        });

        // Tenta usar LISTAGG com ON OVERFLOW TRUNCATE (suportado em versões mais recentes do Oracle)
        const sql = `
            CREATE OR REPLACE VIEW VW_TICKETS_COM_HISTORICO AS
            SELECT 
                t.ID AS TICKET_ID,
                t.TELEFONE,
                t.STATUS,
                t.CRIADO_EM,
                (
                    SELECT LISTAGG(
                        CASE 
                            WHEN m.SENTIDO = 'IN' THEN 'Cliente: ' || m.TEXTO
                            ELSE 'Atendente: ' || m.TEXTO
                        END, CHR(10)
                    ) WITHIN GROUP (ORDER BY m.DATA_HORA)
                    FROM CANAL_MENSAGENS m
                    WHERE m.TICKET_ID = t.ID
                ) AS HISTORICO_ATENDIMENTO
            FROM 
                CANAL_SAC_TICKETS t
        `;
        
        await conn.execute(sql);
        console.log('View VW_TICKETS_COM_HISTORICO criada com sucesso!');

    } catch (error) {
        if (error.message.includes('ORA-00907') || error.message.includes('missing right parenthesis')) {
             console.log('LISTAGG padrão falhou (talvez por limitação de versão), tentando sem overflow truncate ou usando outra abordagem...');
        } else {
             console.error('Erro ao criar a view:', error);
        }
    } finally {
        if (conn) {
            await conn.close();
        }
    }
}
run().catch(console.error);

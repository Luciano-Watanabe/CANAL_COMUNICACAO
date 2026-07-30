const oracledb = require('oracledb');
require('dotenv').config({ path: '../.env' });

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (e) {
    console.error("Init err:", e);
}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        try {
            await conn.execute(`
                CREATE TABLE CANAL_MENSAGENS_TEMPLATES (
                    ID NUMBER GENERATED ALWAYS AS IDENTITY,
                    PAGINA VARCHAR2(50) NOT NULL,
                    TIPO VARCHAR2(100) NOT NULL,
                    TEMPLATE VARCHAR2(4000) NOT NULL,
                    PRIMARY KEY (ID)
                )
            `);
            console.log("Tabela CANAL_MENSAGENS_TEMPLATES criada.");

            // Inserir dados padrao
            const defaults = [
                ['REATIVACAO', 'Saudade', 'Olá, sentimos sua falta! Veja algumas ofertas especiais que separamos para você:'],
                ['REATIVACAO', 'Oferta Especial', 'Temos preços exclusivos para você que não compra há um tempo. Confira nossa lista:'],
                ['CATALOGO', 'Lançamentos', 'Confira nossos lançamentos deste mês no catálogo anexo!'],
                ['CATALOGO', 'Promoção', 'Preços especiais! Veja nosso catálogo de ofertas anexo.'],
                ['ROTAS', 'Confirmação de Visita', 'Olá, confirmo nossa visita agendada para hoje. Até logo!'],
                ['ROTAS', 'Aviso de Chegada', 'Olá, estou a caminho para nossa reunião!']
            ];

            for (const row of defaults) {
                await conn.execute(
                    `INSERT INTO CANAL_MENSAGENS_TEMPLATES (PAGINA, TIPO, TEMPLATE) VALUES (:1, :2, :3)`,
                    row,
                    { autoCommit: true }
                );
            }
            console.log("Templates padrão inseridos.");
            
        } catch(e) {
            console.log("Erro ao criar CANAL_MENSAGENS_TEMPLATES (pode já existir):", e.message);
        }

        console.log("Migração de templates concluída com sucesso.");
    } catch (e) {
        console.error("Erro geral:", e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();

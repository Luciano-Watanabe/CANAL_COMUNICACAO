const oracledb = require('oracledb');
try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {
    console.error('Erro ao inicializar Oracle Client (Thick mode):', err.message);
}
const oraclePool = require('./services/oraclePool');

async function migrate() {
    let conn;
    try {
        console.log('Starting migration...');
        await oraclePool.initPool();
        conn = await oraclePool.getConnection();
        
        // 1. Add column NOTA_AVALIACAO
        try {
            await conn.execute(`ALTER TABLE CANAL_SAC_TICKETS ADD NOTA_AVALIACAO NUMBER(2)`);
            console.log('Added NOTA_AVALIACAO column');
        } catch (e) {
            console.log('Column NOTA_AVALIACAO might already exist:', e.message);
        }

        // 2. We need to check if there is a constraint on STATUS and drop it, then recreate it.
        const res = await conn.execute(`
            SELECT constraint_name, search_condition 
            FROM user_constraints 
            WHERE table_name = 'CANAL_SAC_TICKETS' AND constraint_type = 'C'
        `);
        for (const row of res.rows) {
            const name = row[0];
            const cond = row[1];
            if (cond && cond.includes('STATUS')) {
                console.log('Dropping constraint', name);
                await conn.execute(`ALTER TABLE CANAL_SAC_TICKETS DROP CONSTRAINT ${name}`);
            }
        }
        
        // Add new constraint
        await conn.execute(`
            ALTER TABLE CANAL_SAC_TICKETS 
            ADD CONSTRAINT CK_CANAL_SAC_TICKETS_STATUS 
            CHECK (STATUS IN ('ABERTO', 'EM ATENDIMENTO', 'FECHADO', 'FINALIZADO'))
        `);
        console.log('Updated STATUS constraint');
        
    } catch (e) {
        console.error('Migration error:', e);
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
        process.exit();
    }
}
migrate();

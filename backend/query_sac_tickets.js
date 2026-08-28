const { initPool, getPool } = require('./src/db');
async function run() {
    await initPool();
    const conn = await getPool().getConnection();
    const result = await conn.execute(`
        SELECT column_name, data_type 
        FROM all_tab_columns 
        WHERE table_name = 'CANAL_SAC_TICKETS'
    `);
    console.log(result.rows);
    await conn.close();
    process.exit(0);
}
run();

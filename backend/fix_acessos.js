require('dotenv').config({ path: '../.env' });
const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        // Find all distinct users in CANAL_SAC_ACESSOS
        const usersRes = await conn.execute(`SELECT DISTINCT MATRICULA, TABELA FROM CANAL_SAC_ACESSOS`);
        
        const newDepts = [61, 63, 69, 71];
        
        let inserted = 0;
        for (const row of usersRes.rows) {
            const mat = row[0];
            const tabela = row[1];
            
            for (const deptId of newDepts) {
                // Check if already has
                const check = await conn.execute(`SELECT 1 FROM CANAL_SAC_ACESSOS WHERE MATRICULA = :m AND DEPARTAMENTO_ID = :d`, { m: mat, d: deptId });
                if (check.rows.length === 0) {
                    await conn.execute(`INSERT INTO CANAL_SAC_ACESSOS (MATRICULA, DEPARTAMENTO_ID, TABELA) VALUES (:m, :d, :t)`, {
                        m: mat,
                        d: deptId,
                        t: tabela
                    }, { autoCommit: true });
                    inserted++;
                }
            }
        }
        
        console.log(`Sucesso! Concedidos ${inserted} novos acessos aos novos departamentos.`);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();

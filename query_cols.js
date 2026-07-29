const oracledb = require('oracledb');
async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: 'system',
            password: 'oraclepassword', // need to get the real env vars... wait, I can just run it in backend
        });
    } catch(e) {}
}

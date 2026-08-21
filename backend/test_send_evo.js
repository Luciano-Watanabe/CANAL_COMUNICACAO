const oracledb = require('oracledb');
const axios = require('axios');
async function run() {
    let conn = await oracledb.getConnection({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASS,
        connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT API_TOKEN, INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = 'BOT_GESTOR'`);
    if(result.rows.length > 0) {
        const token = result.rows[0][0];
        const instance = result.rows[0][1];
        try {
            const res = await axios.post('http://172.16.5.11:4000/send/text', {
                number: "5512981371613",
                text: "Teste SAC BOT Debug"
            }, {
                headers: {
                    apikey: token,
                    instance: instance,
                    'Content-Type': 'application/json'
                }
            });
            console.log("Status:", res.status);
            console.log("Data:", res.data);
        } catch(e) {
            console.error("Error:", e.response ? e.response.data : e.message);
        }
    }
    await conn.close();
}
run();

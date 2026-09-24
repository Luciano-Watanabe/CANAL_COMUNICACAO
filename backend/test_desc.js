const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  });
  const res = await conn.execute(`SELECT column_name FROM user_tab_columns WHERE table_name = 'CANAL_PESQUISA_PRECO'`);
  console.log(res.rows);
  await conn.close();
}
run().catch(console.error);

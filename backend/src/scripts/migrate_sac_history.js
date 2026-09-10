require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });
const oracledb = require('oracledb');

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

async function getOrCreateDept(conn, nome, paiId = null) {
    let sql = 'SELECT ID FROM CANAL_SAC_DEPARTAMENTOS WHERE NOME = :nome';
    let binds = { nome };
    
    if (paiId !== null) {
        sql += ' AND DEPARTAMENTO_PAI_ID = :paiId';
        binds.paiId = paiId;
    } else {
        sql += ' AND DEPARTAMENTO_PAI_ID IS NULL';
    }

    const result = await conn.execute(sql, binds);
    if (result.rows.length > 0) {
        return result.rows[0][0];
    } else {
        const insertSql = `
            INSERT INTO CANAL_SAC_DEPARTAMENTOS (NOME, DEPARTAMENTO_PAI_ID, ATIVO)
            VALUES (:nome, :paiId, 'S')
            RETURNING ID INTO :id
        `;
        const insertBinds = {
            nome,
            paiId: paiId,
            id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        };
        const insResult = await conn.execute(insertSql, insertBinds, { autoCommit: true });
        return insResult.outBinds.id[0];
    }
}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        console.log('Conectado ao Oracle');

        // Adicionar colunas na tabela CANAL_SAC_TICKETS
        const cols = [
            'ID_ANTIGO VARCHAR2(50)',
            'CODUSUR NUMBER',
            'TITULO VARCHAR2(255)',
            'CATEGORIA VARCHAR2(100)',
            'PRIORIDADE VARCHAR2(50)',
            'AVALIACAO VARCHAR2(50)',
            'NUM_PEDIDO VARCHAR2(50)',
            'NUM_NOTA VARCHAR2(50)'
        ];

        for (const col of cols) {
            try {
                await conn.execute(`ALTER TABLE CANAL_SAC_TICKETS ADD ${col}`);
                console.log(`Coluna adicionada: ${col}`);
            } catch (err) {
                // Ignore se a coluna ja existir (erro 1430: column being added already exists in table)
                if (err.errorNum === 1430) {
                    console.log(`Coluna já existe: ${col}`);
                } else {
                    console.error(`Erro ao adicionar coluna ${col}:`, err.message);
                }
            }
        }

        // Criar departamentos e sub-departamentos
        const departamentos = [
            { nome: 'Dúvida', subs: ['Dúvida'] },
            { nome: 'Financeiro', subs: ['2ª Via Boleto', '2ª via NF', 'Outros Financeiros', 'Avaliação de Crédito', 'Cadastro'] },
            { nome: 'Reclamação', subs: ['Reclamação'] },
            { nome: 'Logística', subs: ['Cancelamento de Pedido', 'Entrega', 'Devoluções'] }
        ];

        for (const dept of departamentos) {
            const paiId = await getOrCreateDept(conn, dept.nome);
            console.log(`Departamento '${dept.nome}' ID: ${paiId}`);
            for (const sub of dept.subs) {
                const subId = await getOrCreateDept(conn, sub, paiId);
                console.log(`  Sub-Departamento '${sub}' ID: ${subId}`);
            }
        }

        console.log('Migração de schema concluída com sucesso!');
    } catch (err) {
        console.error('Erro na migração:', err);
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

run();

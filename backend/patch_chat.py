import sys

with open('src/routes/chat.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add qtNaoLidas to /todas-conversas SQL query
target1 = "                (SELECT MAX(JSON_VALUE(CONTEUDO, '$.pushName')) FROM CANAL_WEBHOOK WHERE CONTEUDO LIKE '%' || m.TELEFONE_CLIENTE || '%') AS NOME_WHATSAPP\n"
replacement1 = "                (SELECT MAX(JSON_VALUE(CONTEUDO, '$.pushName')) FROM CANAL_WEBHOOK WHERE CONTEUDO LIKE '%' || m.TELEFONE_CLIENTE || '%') AS NOME_WHATSAPP,\n                SUM(CASE WHEN m.SENTIDO = 'IN' AND NVL(m.LIDA, 'N') = 'N' THEN 1 ELSE 0 END) AS QT_NAO_LIDAS\n"

# 2. Add qtNaoLidas to JS mapping
target2 = "                mediaType: mediaType || null\n"
replacement2 = "                mediaType: mediaType || null,\n                qtNaoLidas: row[9] || 0\n"

# 3. Add /marcar-lida
target3 = "// Buscar estat"
replacement3 = """// Marcar mensagens de uma conversa como lidas
router.post('/marcar-lida', async (req, res) => {
    const { codusur, telefone } = req.body;

    if (!codusur || !telefone) {
        return res.status(400).json({ success: false, error: 'codusur e telefone são obrigatórios' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            UPDATE CANAL_MENSAGENS
            SET LIDA = 'S'
            WHERE CODUSUR = :codusur
              AND TELEFONE_CLIENTE = :telefone
              AND SENTIDO = 'IN'
              AND NVL(LIDA, 'N') = 'N'
        `;
        
        const result = await connection.execute(sql, { codusur, telefone }, { autoCommit: true });

        res.json({ success: true, rowsAffected: result.rowsAffected });
    } catch (err) {
        console.error('Erro ao marcar mensagens como lidas:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar estat"""

if target1 in content:
    content = content.replace(target1, replacement1, 1)
else:
    print("Target 1 not found")

if target2 in content:
    content = content.replace(target2, replacement2, 1)
else:
    print("Target 2 not found")

if target3 in content:
    content = content.replace(target3, replacement3, 1)
else:
    print("Target 3 not found")

with open('src/routes/chat.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied.")

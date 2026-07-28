const express = require('express');
const oracledb = require('oracledb');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const router = express.Router();

function formatPhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[^0-9]/g, '');
    p = p.replace(/^0+/, '');
    if (p.length === 10 || p.length === 11) {
        p = '55' + p;
    }
    if (p.startsWith('55') && (p.length === 12 || p.length === 13)) {
        return p;
    }
    return null;
}

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

// Configuração do multer para upload em memória ou disco
const upload = multer({ dest: 'uploads/' });

// Rota para exportar clientes que não estão na PCCONTATO
router.get('/contatos/export-missing/:codusur', async (req, res) => {
    const { codusur } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Seleciona clientes do vendedor que não estão na CANAL_CONTATOS
        const query = `
            SELECT 
                V.CODCLI,
                V.CLIENTE,
                V.CNPJ,
                V.TELEFONE
            FROM VW_CANAL_CLIENTES V
            WHERE V.VENDEDOR_PRINCIPAL = :codusur
              AND NOT EXISTS (
                  SELECT 1 FROM PCCONTATO C WHERE C.CODCLI = V.CODCLI
              )
            ORDER BY V.CLIENTE ASC
        `;
        
        const result = await connection.execute(query, { codusur });
        
        // Monta o CSV
        let csvContent = 'CODCLI;CLIENTE;CONTATO;WHATS\n';
        result.rows.forEach(row => {
            const codcli = row[0] || '';
            const cliente = (row[1] || '').replace(/;/g, ',');
            const telefone = row[3] || '';
            
            // Sugestão de nome de contato e telefone para importação rápida
            const contato = 'Contato Principal';
            const whats = telefone;

            csvContent += `${codcli};${cliente};${contato};${whats}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="clientes_sem_contato.csv"');
        return res.send(Buffer.from(csvContent, 'utf-8'));
    } catch (err) {
        console.error('Erro na exportação:', err);
        return res.status(500).send('Erro interno ao exportar');
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Rota para importar um CSV populando a PCCONTATO
router.post('/contatos/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
    }

    const results = [];
    const filePath = req.file.path;

    // Lendo o CSV
    fs.createReadStream(filePath)
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            let connection;
            let successCount = 0;
            let errorCount = 0;

            try {
                connection = await oracledb.getConnection({
                    user: process.env.ORACLE_USER,
                    password: process.env.ORACLE_PASS,
                    connectString: process.env.ORACLE_CONN_STR
                });

                for (const row of results) {
                    const codcli = row['CODCLI'] || row['codcli'];
                    let telefone = row['WHATS'] || row['whats'] || row['TELEFONE'] || row['telefone'];
                    const nome = row['CONTATO'] || row['contato'] || row['NOME'] || row['nome'] || 'Contato Principal';

                    if (!codcli || !telefone) {
                        errorCount++;
                        continue;
                    }

                    const formattedPhone = formatPhone(telefone);
                    if (!formattedPhone) {
                        errorCount++;
                        continue;
                    }

                    const finalNome = nome.substring(0, 40);

                    try {
                        // Verifica duplicação de nome ou telefone
                        const checkSql = `
                            SELECT 1 FROM PCCONTATO 
                            WHERE CODCLI = :codcli 
                            AND (NOMECONTATO = :nome OR TELEFONE = :telefone OR CELULAR = :telefone)
                        `;
                        const checkRes = await connection.execute(checkSql, { codcli: Number(codcli), nome: finalNome, telefone: formattedPhone });
                        
                        if (checkRes.rows.length > 0) {
                            errorCount++;
                            continue;
                        }

                        const sql = `
                            INSERT INTO PCCONTATO (CODCONTATO, CODCLI, NOMECONTATO, TELEFONE, TIPOCONTATO, AUTORCH)
                            VALUES (DFSEQ_PCCONTATO.NEXTVAL, :codcli, :nome, :telefone, 'C', 'N')
                        `;
                        await connection.execute(sql, { 
                            codcli: Number(codcli), 
                            nome: finalNome, 
                            telefone: formattedPhone 
                        }, { autoCommit: true });
                        successCount++;
                    } catch (err) {
                        // Ignora duplicações ou erros específicos na linha
                        console.error('Erro ao importar linha:', err.message);
                        errorCount++;
                    }
                }
                
                res.json({ 
                    success: true, 
                    message: `Importação concluída. ${successCount} inseridos, ${errorCount} erros ou já existentes.` 
                });
            } catch (err) {
                console.error('Erro geral no DB ao importar:', err);
                res.status(500).json({ success: false, message: 'Erro no banco de dados durante a importação.' });
            } finally {
                if (connection) {
                    try { await connection.close(); } catch (e) {}
                }
                // Limpa o arquivo temp
                fs.unlink(filePath, (err) => { if (err) console.error(err) });
            }
        });
});

module.exports = router;

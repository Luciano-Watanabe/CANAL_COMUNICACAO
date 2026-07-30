const cron = require('node-cron');
const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');

// Roda todos os dias às 03:00 da manhã
cron.schedule('0 3 * * *', async () => {
    console.log('[CRON] Iniciando limpeza de HD (status antigos e áudios antigos)...');
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // 1. Excluir Status mais velhos que 24 horas
        // Seleciona os status para excluir
        const statusResult = await connection.execute(`
            SELECT ID, ARQUIVO_PATH 
            FROM CANAL_AGENDAMENTO_STATUS 
            WHERE DATA_PROGRAMADA < SYSDATE - 1
        `);

        for (const row of statusResult.rows) {
            const [id, arquivoPath] = row;
            if (arquivoPath) {
                const filePath = path.join(__dirname, '../../uploads', arquivoPath);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[CLEANUP] Arquivo de status deletado: ${arquivoPath}`);
                }
            }
            // Excluir registro do banco para não acumular lixo
            await connection.execute(`DELETE FROM CANAL_AGENDAMENTO_STATUS WHERE ID = :id`, { id }, { autoCommit: true });
        }

        console.log(`[CLEANUP] Foram limpos ${statusResult.rows.length} registros de status antigos.`);

        const uploadsDir = path.join(__dirname, '../../uploads');
        if (fs.existsSync(uploadsDir)) {
            const agora = Date.now();
            const seteDiasMs = 7 * 24 * 60 * 60 * 1000;
            const umDiaMs = 24 * 60 * 60 * 1000;
            let audiosExcluidos = 0;
            let imagensExcluidas = 0;

            const limparDiretorio = (dirPath) => {
                if (!fs.existsSync(dirPath)) return;
                const files = fs.readdirSync(dirPath);

                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    const stats = fs.statSync(filePath);

                    if (stats.isDirectory()) {
                        limparDiretorio(filePath);
                        continue;
                    }

                    const ext = file.toLowerCase();
                    if (ext.endsWith('.ogg') || ext.endsWith('.mp3')) {
                        if (agora - stats.mtimeMs > seteDiasMs) {
                            fs.unlinkSync(filePath);
                            audiosExcluidos++;
                        }
                    } else if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png') || ext.endsWith('.mp4') || ext.endsWith('.pdf')) {
                        if (agora - stats.mtimeMs > umDiaMs) {
                            fs.unlinkSync(filePath);
                            imagensExcluidas++;
                        }
                    }
                }
            };

            limparDiretorio(uploadsDir);
            console.log(`[CLEANUP] Foram limpos ${audiosExcluidos} arquivos de áudio antigos (> 7 dias) e ${imagensExcluidas} arquivos de imagem/mídia (> 24 horas).`);
        }

    } catch (err) {
        console.error('[CRON] Erro na rotina de limpeza:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

console.log('[CRON] Rotina de Limpeza (Status/Audios) configurada.');

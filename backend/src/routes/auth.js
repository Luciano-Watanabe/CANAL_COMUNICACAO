const express = require('express');
const router = express.Router();

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios.' });
    }

    try {
        const oracledb = require('oracledb');
        
        // Ativando Thick Mode para lidar com senhas legadas (NJS-116)
        try {
            oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
        } catch (err) {
            console.error('Oracle Client já inicializado ou não encontrado:', err.message);
        }
        
        let connection;
        try {
            connection = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });

            const query = `
                SELECT 
    U.CODUSUR,
    U.NOME,
    U.USURFTP,
    U.SENHAFTP,
    CASE 
        WHEN G.CODGERENTE IS NOT NULL THEN 'gerente'
        WHEN S.CODSUPERVISOR IS NOT NULL THEN 'supervisor'
        ELSE 'vendedor'
    END AS CARGO
FROM PCUSUARI U
LEFT JOIN PCSUPERV S ON U.CODUSUR = S.COD_CADRCA
LEFT JOIN PCGERENTE G ON U.CODUSUR = G.COD_CADRCA
WHERE U.USURFTP = :username
  AND (U.BLOQUEIO = 'N' OR U.BLOQUEIO IS NULL)
UNION ALL
SELECT A.MATRICULA,
       A.NOME_GUERRA NOME,
       A.NOME_GUERRA USURFTP,
       decrypt(A.senhaBD, A.nome_guerra) AS SENHAFTP,
       'ATENDENTE' AS CARGO
FROM   PCEMPR A
WHERE  A.SITUACAO = 'A'
AND    A.SENHABD IS NOT NULL
AND    A.NOME_GUERRA = :username
            `;
            
            const result = await connection.execute(query, { username }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

            if (result.rows.length === 0) {
                return res.status(401).json({ success: false, message: 'Usuário não encontrado ou bloqueado.' });
            }

            const userRow = result.rows[0];
            
            // Validando a senha diretamente da coluna SENHAFTP
            let roleFinal = userRow.CARGO;
            
            // Se o login for BOT_GESTOR ou PCADMIN, ganha acesso de bot_gestor independentemente de cargo
            if (userRow.USURFTP.toUpperCase() === 'BOT_GESTOR' || userRow.USURFTP.toUpperCase() === 'PCADMIN') {
                roleFinal = 'bot_gestor';
            }

            if (userRow.SENHAFTP === password) {
                return res.json({
                    success: true,
                    user: {
                        matricula: userRow.CODUSUR,
                        nome: userRow.NOME,
                        nomeGuerra: userRow.NOME,
                        role: roleFinal
                    }
                });
            } else {
                return res.status(401).json({ success: false, message: 'Senha incorreta.' });
            }
        } catch (dbError) {
            console.error('Erro na query Oracle:', dbError);
            return res.status(500).json({ success: false, message: 'Erro interno de autenticação.' });
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (err) {
                    console.error(err);
                }
            }
        }

    } catch (error) {
        console.error('[AUTH ERROR]', error);
        res.status(500).json({ success: false, error: 'Erro interno de autenticação.' });
    }
});

module.exports = router;

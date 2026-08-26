const express = require('express');
const router = express.Router();
const oraclePool = require('../services/oraclePool');

// --- DEPARTAMENTOS ---

// Listar departamentos
router.get('/departamentos', async (req, res) => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        const result = await conn.execute(`
            SELECT ID, NOME, DEPARTAMENTO_PAI_ID, ATIVO 
            FROM CANAL_SAC_DEPARTAMENTOS 
            ORDER BY ID
        `);
        
        const departamentos = result.rows.map(row => ({
            id: row[0],
            nome: row[1],
            departamentoPaiId: row[2],
            ativo: row[3]
        }));
        
        res.json(departamentos);
    } catch (error) {
        console.error('[SAC] Erro ao buscar departamentos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Criar departamento
router.post('/departamentos', async (req, res) => {
    let conn;
    try {
        const { nome, departamentoPaiId } = req.body;
        conn = await oraclePool.getConnection();
        
        const sql = `
            INSERT INTO CANAL_SAC_DEPARTAMENTOS (NOME, DEPARTAMENTO_PAI_ID, ATIVO) 
            VALUES (:nome, :paiId, 'S')
        `;
        
        await conn.execute(sql, { nome, paiId: departamentoPaiId || null }, { autoCommit: true });
        res.status(201).json({ message: 'Departamento criado com sucesso' });
    } catch (error) {
        console.error('[SAC] Erro ao criar departamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Atualizar departamento (ativar/desativar)
router.put('/departamentos/:id', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { ativo } = req.body;
        conn = await oraclePool.getConnection();
        
        const sql = `UPDATE CANAL_SAC_DEPARTAMENTOS SET ATIVO = :ativo WHERE ID = :id`;
        
        const result = await conn.execute(sql, { ativo: ativo ? 'S' : 'N', id }, { autoCommit: true });

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: `Departamento ID ${id} não encontrado.` });
        }

        res.json({ message: 'Departamento atualizado' });
    } catch (error) {
        console.error('[SAC] Erro ao atualizar departamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// --- TICKETS ---

// Obter KPIs do SAC
router.get('/stats', async (req, res) => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        
        // 1. Total abertos
        const resAbertos = await conn.execute(`SELECT COUNT(*) FROM CANAL_SAC_TICKETS WHERE STATUS = 'ABERTO'`);
        const totalAbertos = resAbertos.rows[0][0];

        // 2. Total fechados ou finalizados hoje
        const resResolvidos = await conn.execute(`SELECT COUNT(*) FROM CANAL_SAC_TICKETS WHERE STATUS IN ('FECHADO', 'FINALIZADO') AND TRUNC(ATUALIZADO_EM) = TRUNC(SYSDATE)`);
        const resolvidosHoje = resResolvidos.rows[0][0];

        // 3. Média de Avaliação (todas ou do mês)
        const resMedia = await conn.execute(`SELECT NVL(AVG(NOTA_AVALIACAO), 0) FROM CANAL_SAC_TICKETS WHERE NOTA_AVALIACAO IS NOT NULL AND TRUNC(ATUALIZADO_EM, 'MM') = TRUNC(SYSDATE, 'MM')`);
        const mediaAvaliacao = Number(resMedia.rows[0][0]).toFixed(1);

        // 4. SLA Médio em Horas
        const sqlSla = `SELECT NVL(AVG((CAST(DATA_RESOLUCAO AS DATE) - CAST(CRIADO_EM AS DATE)) * 24), 0) FROM CANAL_SAC_TICKETS WHERE STATUS IN ('FECHADO', 'FINALIZADO', 'RESOLVIDO') AND DATA_RESOLUCAO IS NOT NULL`;
        const resSla = await conn.execute(sqlSla);
        const slaHoras = Number(resSla.rows[0][0]).toFixed(1);

        // 5. Volume por Departamento
        const sqlDepto = `
            SELECT d.NOME, COUNT(t.ID) 
            FROM CANAL_SAC_TICKETS t
            JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
            GROUP BY d.NOME
        `;
        const resDepto = await conn.execute(sqlDepto);
        const volumeDepartamento = resDepto.rows.map(r => ({ nome: r[0], total: r[1] }));

        // 6. Top Clientes
        const sqlTopCli = `
            SELECT NVL(c.FANTASIA, c.CLIENTE), COUNT(t.ID)
            FROM CANAL_SAC_TICKETS t
            JOIN PCCLIENT c ON t.CODCLI = c.CODCLI
            GROUP BY NVL(c.FANTASIA, c.CLIENTE)
            ORDER BY COUNT(t.ID) DESC
            FETCH FIRST 5 ROWS ONLY
        `;
        const resTopCli = await conn.execute(sqlTopCli);
        const topClientes = resTopCli.rows.map(r => ({ nome: r[0], total: r[1] }));

        // 7. Top Vendedores
        const sqlTopVen = `
            SELECT u.NOME, COUNT(t.ID)
            FROM CANAL_SAC_TICKETS t
            JOIN PCCLIENT c ON t.CODCLI = c.CODCLI
            JOIN PCUSUARI u ON c.CODUSUR1 = u.CODUSUR
            GROUP BY u.NOME
            ORDER BY COUNT(t.ID) DESC
            FETCH FIRST 5 ROWS ONLY
        `;
        const resTopVen = await conn.execute(sqlTopVen);
        const topVendedores = resTopVen.rows.map(r => ({ nome: r[0], total: r[1] }));

        // Novas Métricas Reais
        // Taxa de Resolução Mensal
        const resMes = await conn.execute(`
            SELECT 
                COUNT(CASE WHEN STATUS IN ('FECHADO', 'FINALIZADO', 'RESOLVIDO') THEN 1 END) as resolvidos,
                COUNT(*) as total
            FROM CANAL_SAC_TICKETS 
            WHERE TRUNC(CRIADO_EM, 'MM') = TRUNC(SYSDATE, 'MM')
        `);
        const totalMes = resMes.rows[0][1];
        const resolvidosMes = resMes.rows[0][0];
        const taxaResolucao = totalMes > 0 ? ((resolvidosMes / totalMes) * 100).toFixed(1) : 0;

        // NPS Mensal
        const resNps = await conn.execute(`
            SELECT 
                COUNT(CASE WHEN NOTA_AVALIACAO >= 9 THEN 1 END) as promotores,
                COUNT(CASE WHEN NOTA_AVALIACAO <= 6 THEN 1 END) as detratores,
                COUNT(NOTA_AVALIACAO) as total_notas
            FROM CANAL_SAC_TICKETS 
            WHERE NOTA_AVALIACAO IS NOT NULL AND TRUNC(CRIADO_EM, 'MM') = TRUNC(SYSDATE, 'MM')
        `);
        const npsPromotores = resNps.rows[0][0];
        const npsDetratores = resNps.rows[0][1];
        const npsTotalNotas = resNps.rows[0][2];
        const npsScore = npsTotalNotas > 0 ? Math.round(((npsPromotores - npsDetratores) / npsTotalNotas) * 100) : 0;

        // Tickets Criados Hoje
        const resCriadosHoje = await conn.execute(`SELECT COUNT(*) FROM CANAL_SAC_TICKETS WHERE TRUNC(CRIADO_EM) = TRUNC(SYSDATE)`);
        const criadosHoje = resCriadosHoje.rows[0][0];
        const backlogDia = criadosHoje - resolvidosHoje;

        res.json({ totalAbertos, resolvidosHoje, mediaAvaliacao, slaHoras, volumeDepartamento, topClientes, topVendedores, taxaResolucao, npsScore, criadosHoje, backlogDia });
    } catch (error) {
        console.error('[SAC] Erro ao buscar stats:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Listar tickets (abertos ou todos)
router.get('/tickets', async (req, res) => {
    let conn;
    try {
        const { status, matricula } = req.query; // ex: ?status=ABERTO&matricula=123
        conn = await oraclePool.getConnection();
        
        let sql = `
            WITH LATEST_LOG AS (
                SELECT TELEFONE, DOCUMENTO_INFORMADO, CODCLI_LOCALIZADO
                FROM (
                    SELECT TELEFONE, DOCUMENTO_INFORMADO, CODCLI_LOCALIZADO, 
                           ROW_NUMBER() OVER(PARTITION BY TELEFONE ORDER BY DATA_HORA DESC) as RN
                    FROM CANAL_LOG_IDENTIFICACAO_CLIENTE
                ) WHERE RN = 1
            )
            SELECT t.ID, t.TELEFONE, t.CODCLI, t.DEPARTAMENTO_ID, 
                   CASE 
                       WHEN p.NOME IS NOT NULL THEN p.NOME || ' / ' || d.NOME
                       ELSE d.NOME 
                   END as DEPARTAMENTO, 
                   t.DESCRICAO, t.STATUS, t.CRIADO_EM, t.ATUALIZADO_EM, t.NOTA_AVALIACAO,
                   NVL(c.FANTASIA, c.CLIENTE) as NOME_CLIENTE,
                   c.CGCENT,
                   l.DOCUMENTO_INFORMADO as LOG_CNPJ,
                   l.CODCLI_LOCALIZADO as LOG_CODCLI,
                   t.DATA_AGENDAMENTO, t.AGENDAMENTO_CODPROD, t.AGENDAMENTO_QTDE, t.AGENDAMENTO_MOTORISTA_NOME, t.AGENDAMENTO_MOTORISTA_TEL, t.AGENDAMENTO_ENVIADO,
                   prod.DESCRICAO as PRODUTO_NOME
            FROM CANAL_SAC_TICKETS t
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
            LEFT JOIN LATEST_LOG l ON t.TELEFONE = l.TELEFONE
            LEFT JOIN PCCLIENT c ON c.CODCLI = NVL(t.CODCLI, l.CODCLI_LOCALIZADO)
            LEFT JOIN PCPRODUT prod ON t.AGENDAMENTO_CODPROD = prod.CODPROD
            WHERE 1=1
        `;
        const binds = {};
        
        if (matricula) {
            binds.matricula = matricula;
            sql += ` AND (
                NOT EXISTS (SELECT 1 FROM CANAL_SAC_ACESSOS WHERE MATRICULA = :matricula)
                OR t.DEPARTAMENTO_ID IS NULL
                OR t.DEPARTAMENTO_ID IN (SELECT DEPARTAMENTO_ID FROM CANAL_SAC_ACESSOS WHERE MATRICULA = :matricula)
                OR d.DEPARTAMENTO_PAI_ID IN (SELECT DEPARTAMENTO_ID FROM CANAL_SAC_ACESSOS WHERE MATRICULA = :matricula)
            )`;
        }

        if (status && status !== 'TODOS') {
            sql += ` AND t.STATUS = :st`;
            binds.st = status;
        }
        
        sql += ` ORDER BY t.CRIADO_EM DESC`;

        const result = await conn.execute(sql, binds);
        
        const tickets = result.rows.map(row => {
            const id = row[0];
            const telefone = row[1];
            const codcli = row[2];
            const nomeClienteWinthor = row[10];
            const cnpjWinthor = row[11];
            const logCnpj = row[12];
            const logCodcli = row[13];

            let nomeFormatado = '';
            
            if (codcli && nomeClienteWinthor) {
                // É um cliente do Winthor atribuído ao ticket
                nomeFormatado = `${telefone} (<${codcli} - ${nomeClienteWinthor} (${cnpjWinthor || ''})>)`;
            } else if (logCodcli && nomeClienteWinthor) {
                // Encontrado no log de identificação como cliente existente, mas o ticket não tem CODCLI
                nomeFormatado = `${telefone} (<${logCodcli} - ${nomeClienteWinthor} (${cnpjWinthor || logCnpj || ''})>)`;
            } else if (logCnpj) {
                // Encontrado no log mas não é cadastrado no Winthor
                nomeFormatado = `${telefone} (<CNPJ/CPF Informado: ${logCnpj}>)`;
            }

            return {
                id: id,
                telefone: telefone,
                codcli: codcli,
                departamentoId: row[3],
                departamento: row[4],
                descricao: row[5],
                status: row[6],
                criadoEm: row[7],
                atualizadoEm: row[8],
                notaAvaliacao: row[9],
                nomeCliente: nomeFormatado || null,
                dataAgendamento: row[14],
                agendamentoCodprod: row[15],
                agendamentoQtde: row[16],
                agendamentoMotoristaNome: row[17],
                agendamentoMotoristaTel: row[18],
                agendamentoEnviado: row[19],
                agendamentoProdutoNome: row[20]
            };
        });
        
        res.json(tickets);
    } catch (error) {
        console.error('[SAC] Erro ao buscar tickets:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Listar Logs de Identificação
router.get('/logs-identificacao', async (req, res) => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        const sql = `
            SELECT L.ID, L.TELEFONE, L.DOCUMENTO_INFORMADO, L.CODCLI_LOCALIZADO, L.OPCAO_USADA, L.DATA_HORA, NVL(C.FANTASIA, C.CLIENTE) AS NOME_CLIENTE
            FROM CANAL_LOG_IDENTIFICACAO_CLIENTE L
            LEFT JOIN PCCLIENT C ON L.CODCLI_LOCALIZADO = C.CODCLI
            ORDER BY L.DATA_HORA DESC
            FETCH FIRST 100 ROWS ONLY
        `;
        const result = await conn.execute(sql);
        const logs = result.rows.map(r => ({
            id: r[0],
            telefone: r[1],
            documento: r[2],
            codcli: r[3],
            opcao: r[4],
            data: r[5],
            nomeCliente: r[6]
        }));
        res.json(logs);
    } catch (error) {
        console.error('[SAC] Erro ao buscar logs:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Atualizar status do ticket
router.put('/tickets/:id/status', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { status } = req.body;
        conn = await oraclePool.getConnection();
        
        // Verifica se o status é válido
        if (!['ABERTO', 'EM ATENDIMENTO', 'FECHADO', 'FINALIZADO'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido.' });
        }
        
        let sql = `UPDATE CANAL_SAC_TICKETS SET STATUS = :status, ATUALIZADO_EM = SYSDATE WHERE ID = :id RETURNING TELEFONE INTO :tel`;
        if (['FECHADO', 'FINALIZADO', 'RESOLVIDO'].includes(status)) {
            sql = `UPDATE CANAL_SAC_TICKETS SET STATUS = :status, ATUALIZADO_EM = SYSDATE, DATA_RESOLUCAO = SYSDATE WHERE ID = :id RETURNING TELEFONE INTO :tel`;
        }
        
        const result = await conn.execute(sql, { 
            status, 
            id,
            tel: { type: require('oracledb').STRING, dir: require('oracledb').BIND_OUT }
        }, { autoCommit: true });

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: `Ticket ID ${id} não encontrado.` });
        }

        const telefone = result.outBinds.tel && result.outBinds.tel[0] ? result.outBinds.tel[0] : null;


        if (['FECHADO', 'FINALIZADO', 'RESOLVIDO'].includes(status) && telefone) {
            await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
        }

        // Se estiver fechando, disparar mensagem via WhatsApp para avaliação
        if (status === 'FECHADO' && telefone) {
            try {
                // Obtém token e url do SAC BOT
                const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
                if (sacConfigRes.rows.length > 0 && sacConfigRes.rows[0][0]) {
                    const sacCodusur = sacConfigRes.rows[0][0];
                    const instRes = await conn.execute(`SELECT INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
                    
                    if (instRes.rows.length > 0) {
                        const instanceName = instRes.rows[0][0];
                        const apiToken = instRes.rows[0][1];
                        let apiUrl = instRes.rows[0][2];
                        if (apiUrl) apiUrl = apiUrl.trim();
                        if (apiUrl && apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
                        
                        const axios = require('axios');
                        
                        // Fetch department names to include in the evaluation message
                        const ticketDeptoRes = await conn.execute(`
                            SELECT d.NOME, p.NOME
                            FROM CANAL_SAC_TICKETS t
                            LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
                            LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
                            WHERE t.ID = :id
                        `, { id });
                        
                        let nomeCompletoDeptoMsg = '';
                        if (ticketDeptoRes.rows.length > 0) {
                            const deptoNome = ticketDeptoRes.rows[0][0];
                            const paiNome = ticketDeptoRes.rows[0][1];
                            if (paiNome && deptoNome) {
                                nomeCompletoDeptoMsg = `${paiNome} / ${deptoNome}`;
                            } else if (deptoNome) {
                                nomeCompletoDeptoMsg = deptoNome;
                            }
                        }
                        
                        const tituloAvaliacao = nomeCompletoDeptoMsg ? `[Ticket #${id} - ${nomeCompletoDeptoMsg}]` : `[Ticket #${id}]`;
                        const msgAvaliacao = `*Seu atendimento ${tituloAvaliacao} foi concluído!* ✅\n\nPor favor, avalie nosso atendimento respondendo com uma nota de *1 a 10* (sendo 1 muito ruim e 10 excelente):\n\nDigite *PULAR* para cancelar a avaliação.`;

                        const evoUrlFinal = `${apiUrl}/message/sendText/${instanceName}`;
                        const payload = {
                            number: telFormat(telefone),
                            text: msgAvaliacao
                        };
                        const headersReq = { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' };
                        
                        console.log(`[SAC] Disparando avaliação via URL: ${evoUrlFinal}`);
                        try {
                            await axios.post(`${apiUrl}/send/text`, payload, { headers: headersReq, timeout: 5000 });
                        } catch (e) {
                            if (e.response && e.response.status === 404) {
                                await axios.post(evoUrlFinal, payload, { headers: headersReq, timeout: 5000 });
                            } else {
                                throw e;
                            }
                        }
                        
                        // Atualiza estado do bot para AGUARDANDO_AVALIACAO
                        const dadosTemp = JSON.stringify({ ticketId: id });
                        const checkState = await conn.execute(`SELECT 1 FROM CANAL_BOT_STATE WHERE TELEFONE = :t`, { t: telefone });
                        if (checkState.rows.length > 0) {
                            await conn.execute(`UPDATE CANAL_BOT_STATE SET ESTADO_ATUAL = 'AGUARDANDO_AVALIACAO', DADOS_TEMPORARIOS = :d WHERE TELEFONE = :t`, { d: dadosTemp, t: telefone }, { autoCommit: true });
                        } else {
                            await conn.execute(`INSERT INTO CANAL_BOT_STATE (TELEFONE, ESTADO_ATUAL, DADOS_TEMPORARIOS) VALUES (:t, 'AGUARDANDO_AVALIACAO', :d)`, { t: telefone, d: dadosTemp }, { autoCommit: true });
                        }
                    }
                }
            } catch (err) {
                console.error('[SAC] Erro ao enviar avaliação via Whatsapp:', err.message);
                // Não retorna erro para o front, já que o status do ticket foi salvo
            }
        }

        res.json({ message: 'Ticket atualizado' });
    } catch (error) {
        console.error('[SAC] Erro ao atualizar ticket:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Buscar chat do ticket (usando o SAC_BOT_CODUSUR e filtrando pela data do ticket)
router.get('/tickets/:id/chat', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        conn = await oraclePool.getConnection();
        
        // Pega telefone e datas do ticket
        const ticketRes = await conn.execute(`SELECT TELEFONE, CRIADO_EM FROM CANAL_SAC_TICKETS WHERE ID = :id`, { id });
        if (ticketRes.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }
        const telefone = ticketRes.rows[0][0];
        const criadoEm = ticketRes.rows[0][1];

        // Pega código do SAC
        const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
        const sacCodusur = sacConfigRes.rows.length > 0 ? sacConfigRes.rows[0][0] : '9999';

        const chatRes = await conn.execute(`
            SELECT ID_MENSAGEM, SENTIDO, TEXTO, DATA_HORA, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE
            FROM CANAL_MENSAGENS
            WHERE TICKET_ID = :id
            ORDER BY DATA_HORA ASC
        `, { id });

        const mensagens = chatRes.rows.map(row => ({
            id: row[0],
            sentido: row[1],
            texto: row[2],
            timestamp: row[3],
            mediaUrl: row[4],
            mediaType: row[5],
            mediaMime: row[6]
        }));
        
        res.json({ mensagens, telefone });
    } catch (error) {
        console.error('[SAC] Erro ao buscar chat:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Buscar estatísticas de uso da IA
router.get('/grok-usage', async (req, res) => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        
        // Busca limites configurados
        const limitRes = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE IN ('IA_LIMITE_DIARIO', 'IA_LIMITE_SEMANAL', 'IA_LIMITE_MENSAL')`);
        let limits = { diario: 0, semanal: 0, mensal: 0 };
        limitRes.rows.forEach(r => {
            if (r[0] === 'IA_LIMITE_DIARIO') limits.diario = parseInt(r[1], 10) || 0;
            if (r[0] === 'IA_LIMITE_SEMANAL') limits.semanal = parseInt(r[1], 10) || 0;
            if (r[0] === 'IA_LIMITE_MENSAL') limits.mensal = parseInt(r[1], 10) || 0;
        });

        // Busca uso real (oracle syntax for truncating dates)
        const countsRes = await conn.execute(`
            SELECT
                SUM(CASE WHEN TRUNC(DATA_HORA) = TRUNC(SYSDATE) THEN 1 ELSE 0 END) as HOJE,
                SUM(CASE WHEN TRUNC(DATA_HORA, 'IW') = TRUNC(SYSDATE, 'IW') THEN 1 ELSE 0 END) as SEMANA,
                SUM(CASE WHEN TRUNC(DATA_HORA, 'MM') = TRUNC(SYSDATE, 'MM') THEN 1 ELSE 0 END) as MES
            FROM CANAL_USO_IA
            WHERE SUCESSO = 'S'
        `);

        res.json({
            uso: {
                diario: countsRes.rows[0][0] || 0,
                semanal: countsRes.rows[0][1] || 0,
                mensal: countsRes.rows[0][2] || 0
            },
            limites: limits
        });

    } catch (err) {
        console.error('[SAC] Erro ao buscar estatísticas de IA:', err);
        res.status(500).json({ error: 'Erro interno' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
});

// Sugerir resposta via GROK
router.get('/tickets/:id/suggest-reply', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        conn = await oraclePool.getConnection();
        
        // Obter chave GROQ (fallback)
        const keyRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
        const groqKey = keyRes.rows.length > 0 ? keyRes.rows[0][0] : process.env.GROQ_API_KEY;
        if (!groqKey) return res.status(500).json({ error: 'Chave GROQ não configurada' });
        
        // Obter últimas mensagens do chat
        const chatRes = await conn.execute(`
            SELECT SENTIDO, TEXTO
            FROM CANAL_MENSAGENS
            WHERE TICKET_ID = :id AND TEXTO IS NOT NULL
            ORDER BY DATA_HORA DESC
            FETCH FIRST 10 ROWS ONLY
        `, { id });
        
        if (chatRes.rows.length === 0) return res.status(400).json({ error: 'Sem mensagens para sugerir' });
        
        const historico = chatRes.rows.reverse().map(r => `${r[0] === 'IN' ? 'Cliente' : 'Atendente'}: ${r[1]}`).join('\n');
        
        const axios = require('axios');
        const prompt = `Você é um assistente prestativo de SAC (Serviço de Atendimento ao Cliente). Com base no histórico de conversas abaixo, sugira uma resposta educada e direta que o atendente possa enviar ao cliente. Não inclua placeholders, dê uma resposta final (apenas o texto da resposta, sem aspas). Se for uma saudação, diga "Olá, como posso ajudar hoje?". Histórico:\n\n${historico}`;
        
        const iaRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            messages: [{role: "user", content: prompt}],
            model: "qwen/qwen3.6-27b",
            temperature: 0.7
        }, {
            headers: { 'Authorization': `Bearer ${groqKey}` }
        });
        
        const sugestao = iaRes.data.choices[0].message.content.trim();
        let finalSugestao = sugestao.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        
        // Registrar o uso com sucesso
        const attendantName = req.query.attendantName || 'Desconhecido';
        try {
            await conn.execute(`
                INSERT INTO CANAL_USO_IA (DATA_HORA, ATENDENTE, ORIGEM, SUCESSO)
                VALUES (SYSDATE, :atendente, 'SAC_SUGESTAO', 'S')
            `, { atendente: attendantName }, { autoCommit: true });
        } catch(e) {
            console.error('[SAC] Erro ao registrar log de uso da IA:', e.message);
        }

        res.json({ sugestao: finalSugestao });
        
    } catch (error) {
        console.error('[SAC] Erro API IA:', error.response?.data || error.message);
        const errMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message;
        res.status(500).json({ error: `API IA: ${errMsg}` });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
});

// Enviar resposta no ticket
router.post('/tickets/:id/reply', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { message, attendantName, grokUsed } = req.body;
        
        if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

        conn = await oraclePool.getConnection();
        
        // 1. Encontra ticket e dados para envio
        const ticketRes = await conn.execute(`
            SELECT t.TELEFONE, t.STATUS, d.NOME, p.NOME, t.DESCRICAO
            FROM CANAL_SAC_TICKETS t
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
            WHERE t.ID = :id
        `, { id });
        if (ticketRes.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }
        
        const telefone = ticketRes.rows[0][0];
        const currentStatus = ticketRes.rows[0][1];
        const deptoNome = ticketRes.rows[0][2];
        const paiNome = ticketRes.rows[0][3];
        const descricao = ticketRes.rows[0][4];
        
        // 2. Busca configuração da API do SAC
        const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
        const sacCodusur = sacConfigRes.rows.length > 0 ? sacConfigRes.rows[0][0] : '9999';
        
        const instRes = await conn.execute(`SELECT INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
        if (instRes.rows.length === 0) {
            return res.status(500).json({ error: 'Instância do SAC BOT não configurada' });
        }
        
        const instanceName = instRes.rows[0][0];
        const apiToken = instRes.rows[0][1];
        const apiUrl = instRes.rows[0][2];
        
        const axios = require('axios');
        const telFormatado = (tel) => {
            let p = String(tel).replace(/[^0-9]/g, '');
            if (!p.startsWith('55')) p = '55' + p;
            return p;
        };

        let nomeCompletoDepto = '';
        if (paiNome && deptoNome) {
            nomeCompletoDepto = `${paiNome} / ${deptoNome}`;
        } else if (deptoNome) {
            nomeCompletoDepto = deptoNome;
        } else if (descricao) {
            const descStr = String(descricao);
            if (descStr.includes('Troca/Devolução')) {
                nomeCompletoDepto = 'Troca/Devolução';
            } else {
                nomeCompletoDepto = descStr.length > 30 ? descStr.substring(0, 30) + '...' : descStr;
            }
        }

        const titulo = nomeCompletoDepto ? `[Ticket #${id} - ${nomeCompletoDepto}]` : `[Ticket #${id}]`;
        const finalMessage = `*${titulo}*\n*Atendente:* ${attendantName || 'SAC'}\n\n${message}`;

        // 3. Envia API
        try {
            await axios.post(
                `${apiUrl}/message/sendText/${instanceName}`,
                {
                    number: telFormatado(telefone),
                    text: finalMessage
                },
                {
                    headers: { 'apikey': apiToken, 'Content-Type': 'application/json' }
                }
            );
        } catch (evoErr) {
            if (evoErr.response && evoErr.response.status === 404) {
                try {
                    console.log(`[SAC] Rota padrão retornou 404. Tentando formato EVO GO...`);
                    await axios.post(
                        `${apiUrl}/send/text`,
                        {
                            number: telFormatado(telefone),
                            text: finalMessage
                        },
                        {
                            headers: { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' }
                        }
                    );
                } catch (goErr) {
                    console.error('[SAC] Erro Evolution GO:', goErr.response?.data || goErr.message);
                    return res.status(500).json({ error: 'Falha ao enviar via Whatsapp (Evo GO)' });
                }
            } else {
                console.error('[SAC] Erro Evolution API:', evoErr.response?.data || evoErr.message);
                return res.status(500).json({ error: 'Falha ao enviar via Whatsapp' });
            }
        }
        
        // 4. Salva a mensagem no CANAL_MENSAGENS para aparecer no chat
        const msgId = 'SAC_' + Date.now();
        await conn.execute(`
            INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, STATUS, DATA_HORA, TICKET_ID, GROK_USADO)
            VALUES (:id_msg, :cod, :tel, 'OUT', :txt, 'ENVIADA', SYSDATE, :tId, :grok)
        `, {
            id_msg: msgId,
            cod: sacCodusur,
            tel: telefone,
            txt: finalMessage,
            tId: id,
            grok: grokUsed ? 'S' : 'N'
        }, { autoCommit: true });

        // 5. Atualiza o status se for ABERTO e sempre atualiza a data
        if (currentStatus === 'ABERTO') {
            await conn.execute(`UPDATE CANAL_SAC_TICKETS SET STATUS = 'EM ATENDIMENTO', ATUALIZADO_EM = SYSDATE WHERE ID = :id`, { id }, { autoCommit: true });
        } else {
            await conn.execute(`UPDATE CANAL_SAC_TICKETS SET ATUALIZADO_EM = SYSDATE WHERE ID = :id`, { id }, { autoCommit: true });
        }

        // 6. Coloca o cliente na bolha de atendimento para que as próximas mensagens dele vão apenas para o ticket
        const payloadDados = JSON.stringify({ ticketId: id });
        await conn.execute(`
            MERGE INTO CANAL_BOT_STATE dest
            USING (SELECT :tel AS TELEFONE FROM DUAL) src
            ON (dest.TELEFONE = src.TELEFONE)
            WHEN MATCHED THEN UPDATE SET ESTADO_ATUAL = 'AGUARDANDO_TICKET_ACAO', DADOS_TEMPORARIOS = :dados, ATUALIZADO_EM = SYSDATE
            WHEN NOT MATCHED THEN INSERT (TELEFONE, ESTADO_ATUAL, DADOS_TEMPORARIOS, ATUALIZADO_EM) VALUES (:tel, 'AGUARDANDO_TICKET_ACAO', :dados, SYSDATE)
        `, { tel: telefone, dados: payloadDados }, { autoCommit: true });

        res.json({ message: 'Resposta enviada' });
    } catch (error) {
        console.error('[SAC] Erro ao responder ticket:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const telFormat = (tel) => {
    let p = String(tel).replace(/[^0-9]/g, '');
    if (!p.startsWith('55')) p = '55' + p;
    return p;
};

// Enviar mídia no ticket
router.post('/tickets/:id/send-media', upload.single('file'), async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { attendantName } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: 'Arquivo vazio' });

        conn = await oraclePool.getConnection();
        
        // 1. Encontra ticket
        const ticketRes = await conn.execute(`
            SELECT t.TELEFONE, t.STATUS, d.NOME, p.NOME
            FROM CANAL_SAC_TICKETS t
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
            WHERE t.ID = :id
        `, { id });
        if (ticketRes.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }
        
        const telefone = ticketRes.rows[0][0];
        const currentStatus = ticketRes.rows[0][1];
        const deptoNome = ticketRes.rows[0][2];
        const paiNome = ticketRes.rows[0][3];
        
        // 2. Configurações
        const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
        const sacCodusur = sacConfigRes.rows.length > 0 ? sacConfigRes.rows[0][0] : '9999';
        
        const instRes = await conn.execute(`SELECT INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
        if (instRes.rows.length === 0) {
            return res.status(500).json({ error: 'Instância do SAC BOT não configurada' });
        }
        
        const instanceName = instRes.rows[0][0];
        const apiToken = instRes.rows[0][1];
        let apiUrl = instRes.rows[0][2];
        if (apiUrl && apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        
        const base64Data = file.buffer.toString('base64');
        const mimetype = file.mimetype;
        const fileName = file.originalname;
        let mediatype = 'document';
        if (mimetype.startsWith('image/')) mediatype = 'image';
        if (mimetype.startsWith('video/')) mediatype = 'video';
        if (mimetype.startsWith('audio/')) mediatype = 'audio';

        const axios = require('axios');
        const fs = require('fs');
        const path = require('path');

        const evolutionUrl = `${apiUrl}/message/sendMedia/${instanceName}`;
        
        let nomeCompletoDepto = '';
        if (paiNome && deptoNome) {
            nomeCompletoDepto = `${paiNome} / ${deptoNome}`;
        } else if (deptoNome) {
            nomeCompletoDepto = deptoNome;
        }
        const titulo = nomeCompletoDepto ? `[Ticket #${id} - ${nomeCompletoDepto}]` : `[Ticket #${id}]`;

        const payload = {
            number: telFormat(telefone),
            mediatype,
            mimetype,
            fileName,
            caption: `*${titulo}*\n*Atendente:* ${attendantName || 'SAC'}`,
            media: base64Data
        };

        // 3. Envia API
        try {
            await axios.post(evolutionUrl, payload, {
                headers: { 'apikey': apiToken, 'Content-Type': 'application/json' }
            });
        } catch (evoErr) {
            if (evoErr.response && evoErr.response.status === 404) {
                // fallback Evo GO
                const fallbackUrl = `${apiUrl}/send/media`;
                const payloadV2 = {
                    number: telFormat(telefone),
                    type: mediatype,
                    filename: fileName,
                    caption: payload.caption,
                    url: base64Data
                };
                await axios.post(fallbackUrl, payloadV2, {
                    headers: { 'apikey': apiToken, 'Content-Type': 'application/json', 'instance': instanceName }
                });
            } else {
                console.error('[SAC] Erro Evolution API Media:', evoErr.response?.data || evoErr.message);
                return res.status(500).json({ error: 'Falha ao enviar arquivo via Whatsapp' });
            }
        }
        
        // 4. Salva arquivo localmente para visualização rápida no Frontend
        let subFolder = 'Documentos';
        if (mediatype === 'image') subFolder = 'Imagens';
        else if (mediatype === 'video') subFolder = 'Video';
        else if (mediatype === 'audio') subFolder = 'Audio';

        const uploadsDir = path.join(__dirname, '../../SAC/UPLOAD', subFolder);
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        
        const ext = fileName.split('.').pop();
        const msgId = 'SAC_' + Date.now();
        const savedFileName = `${msgId}.${ext}`;
        const filePath = path.join(uploadsDir, savedFileName);
        
        fs.writeFileSync(filePath, file.buffer);
        const mediaUrl = `/SAC/UPLOAD/${subFolder}/${savedFileName}`;

        // 5. Salva no banco de dados
        await conn.execute(`
            INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, STATUS, DATA_HORA, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE, TICKET_ID)
            VALUES (:id_msg, :cod, :tel, 'OUT', :txt, 'ENVIADA', SYSDATE, :mUrl, :mType, :mMime, :tId)
        `, {
            id_msg: msgId,
            cod: sacCodusur,
            tel: telefone,
            txt: payload.caption,
            mUrl: mediaUrl,
            mType: mediatype,
            mMime: mimetype,
            tId: id
        }, { autoCommit: true });

        // 6. Atualiza Ticket
        if (currentStatus === 'ABERTO') {
            await conn.execute(`UPDATE CANAL_SAC_TICKETS SET STATUS = 'EM ATENDIMENTO', ATUALIZADO_EM = SYSDATE WHERE ID = :id`, { id }, { autoCommit: true });
        } else {
            await conn.execute(`UPDATE CANAL_SAC_TICKETS SET ATUALIZADO_EM = SYSDATE WHERE ID = :id`, { id }, { autoCommit: true });
        }

        res.json({ message: 'Arquivo enviado', mediaUrl });
    } catch (error) {
        console.error('[SAC] Erro ao enviar media:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao enviar media' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// --- TICKETS INTERNOS ---

// Buscar infos do cliente por CODCLI
router.get('/clientes/:codcli', async (req, res) => {
    let conn;
    try {
        const { codcli } = req.params;
        conn = await oraclePool.getConnection();
        const result = await conn.execute(`
            SELECT CLIENTE, FANTASIA, TELEFONEENT, TELCOB, TELCOM
            FROM PCCLIENT
            WHERE CODCLI = :codcli
        `, { codcli });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        const nome = result.rows[0][1] || result.rows[0][0]; // Fantasia ou Cliente
        let telefone = result.rows[0][2] || result.rows[0][3] || result.rows[0][4] || '';
        if (telefone) {
            telefone = String(telefone).replace(/[^0-9]/g, '');
        }

        res.json({ nome, telefone });
    } catch (error) {
        console.error('[SAC] Erro ao buscar cliente:', error);
        res.status(500).json({ error: 'Erro interno' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
});

// Abertura de Ticket Interno
router.post('/tickets/internal', upload.single('file'), async (req, res) => {
    let conn;
    try {
        const { codcli, departamentoId, descricao, telefone, attendantName } = req.body;
        const file = req.file;

        if (!codcli || !departamentoId || !descricao || !telefone) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        conn = await oraclePool.getConnection();
        
        // Atualiza o telefone em PCCLIENT se fornecido (atualização sugerida)
        if (telefone) {
            try {
                await conn.execute(`UPDATE PCCLIENT SET TELEFONEENT = :tel WHERE CODCLI = :codcli`, { tel: telefone, codcli: codcli }, { autoCommit: true });
            } catch (e) {
                console.log('[SAC] Falha ao atualizar telefone do cliente:', e);
            }
        }

        // Criar o ticket
        const result = await conn.execute(`
            INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS, CRIADO_EM, ATUALIZADO_EM)
            VALUES (:telefone, :codcli, :deptoId, :descricao, 'ABERTO', SYSDATE, SYSDATE)
            RETURNING ID INTO :id
        `, {
            telefone,
            codcli,
            deptoId: departamentoId,
            descricao,
            id: { type: require('oracledb').NUMBER, dir: require('oracledb').BIND_OUT }
        }, { autoCommit: true });

        const ticketId = result.outBinds.id[0];

        // Se quiser enviar msg pelo whatsapp:
        const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
        const sacCodusur = sacConfigRes.rows.length > 0 ? sacConfigRes.rows[0][0] : '9999';
        
        const instRes = await conn.execute(`SELECT INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
        
        let sentMessage = false;
        
        if (instRes.rows.length > 0) {
            const instanceName = instRes.rows[0][0];
            const apiToken = instRes.rows[0][1];
            let apiUrl = instRes.rows[0][2];
            if (apiUrl && apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
            
            const axios = require('axios');
            const fs = require('fs');
            const path = require('path');
            
            const txtMsg = `*Abertura de Chamado #${ticketId}*\n\nUm novo chamado foi aberto internamente para você pelo atendente *${attendantName || 'SAC'}*.\n\n*Descrição do ocorrido:*\n${descricao}`;

            if (file) {
                // Upload de midia com legenda
                const base64Data = file.buffer.toString('base64');
                const mimetype = file.mimetype;
                const fileName = file.originalname;
                let mediatype = 'document';
                if (mimetype.startsWith('image/')) mediatype = 'image';
                if (mimetype.startsWith('video/')) mediatype = 'video';
                if (mimetype.startsWith('audio/')) mediatype = 'audio';

                const evolutionUrl = `${apiUrl}/message/sendMedia/${instanceName}`;
                
                const payload = {
                    number: telFormat(telefone),
                    mediatype,
                    mimetype,
                    fileName,
                    caption: txtMsg,
                    media: base64Data
                };

                try {
                    await axios.post(evolutionUrl, payload, {
                        headers: { 'apikey': apiToken, 'Content-Type': 'application/json' }
                    });
                    
                    let subFolder = 'Documentos';
                    if (mediatype === 'image') subFolder = 'Imagens';
                    else if (mediatype === 'video') subFolder = 'Video';
                    else if (mediatype === 'audio') subFolder = 'Audio';

                    const uploadsDir = path.join(__dirname, '../../SAC/UPLOAD', subFolder);
                    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                    
                    const ext = fileName.split('.').pop();
                    const msgId = 'SAC_' + Date.now();
                    const savedFileName = `${msgId}.${ext}`;
                    const filePath = path.join(uploadsDir, savedFileName);
                    
                    fs.writeFileSync(filePath, file.buffer);
                    const mediaUrl = `/SAC/UPLOAD/${subFolder}/${savedFileName}`;

                    await conn.execute(`
                        INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, STATUS, DATA_HORA, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE, TICKET_ID)
                        VALUES (:id_msg, :cod, :tel, 'OUT', :txt, 'ENVIADA', SYSDATE, :mUrl, :mType, :mMime, :tId)
                    `, {
                        id_msg: msgId,
                        cod: sacCodusur,
                        tel: telefone,
                        txt: txtMsg,
                        mUrl: mediaUrl,
                        mType: mediatype,
                        mMime: mimetype,
                        tId: ticketId
                    }, { autoCommit: true });

                    sentMessage = true;
                } catch (e) {
                    console.error('[SAC] Erro Evolution API Media Internal:', e.message);
                }
            } else {
                const evolutionUrl = `${apiUrl}/message/sendText/${instanceName}`;
                const payload = {
                    number: telFormat(telefone),
                    text: txtMsg
                };
                const headersReq = { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' };
                try {
                    try {
                        await axios.post(`${apiUrl}/send/text`, payload, { headers: headersReq, timeout: 5000 });
                    } catch (evoErr) {
                        if (evoErr.response && evoErr.response.status === 404) {
                            await axios.post(evolutionUrl, payload, { headers: headersReq, timeout: 5000 });
                        } else {
                            throw evoErr;
                        }
                    }
                    
                    const msgId = 'SAC_' + Date.now();
                    await conn.execute(`
                        INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, STATUS, DATA_HORA, TICKET_ID)
                        VALUES (:id_msg, :cod, :tel, 'OUT', :txt, 'ENVIADA', SYSDATE, :tId)
                    `, {
                        id_msg: msgId,
                        cod: sacCodusur,
                        tel: telefone,
                        txt: txtMsg,
                        tId: ticketId
                    }, { autoCommit: true });
                    
                    sentMessage = true;
                } catch (e) {
                    console.error('[SAC] Erro Evolution API Text Internal:', e.message);
                }
            }
        }

        res.status(201).json({ message: 'Ticket aberto com sucesso', ticketId, notified: sentMessage });
    } catch (error) {
        console.error('[SAC] Erro ao abrir ticket interno:', error);
        res.status(500).json({ error: 'Erro interno ao abrir ticket' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
});
// Solicitar avaliação manual
router.post('/tickets/:id/request-evaluation', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        conn = await oraclePool.getConnection();
        
        const ticketRes = await conn.execute(`SELECT TELEFONE, STATUS, NOTA_AVALIACAO FROM CANAL_SAC_TICKETS WHERE ID = :id`, { id });
        if (ticketRes.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }
        
        const telefone = ticketRes.rows[0][0];
        const status = ticketRes.rows[0][1];
        const nota = ticketRes.rows[0][2];
        
        if (status !== 'FINALIZADO' && status !== 'FECHADO') {
            return res.status(400).json({ error: 'Ticket deve estar finalizado para solicitar avaliação.' });
        }
        
        if (nota) {
            return res.status(400).json({ error: 'Ticket já possui avaliação.' });
        }

        // Obtém token e url do SAC BOT
        const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
        if (sacConfigRes.rows.length > 0 && sacConfigRes.rows[0][0]) {
            const sacCodusur = sacConfigRes.rows[0][0];
            const instRes = await conn.execute(`SELECT INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
            
            if (instRes.rows.length > 0) {
                const instanceName = instRes.rows[0][0];
                const apiToken = instRes.rows[0][1];
                let apiUrl = instRes.rows[0][2];
                if (apiUrl) apiUrl = apiUrl.trim();
                if (apiUrl && apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
                
                const axios = require('axios');
                
                const ticketDeptoRes = await conn.execute(`
                    SELECT d.NOME, p.NOME
                    FROM CANAL_SAC_TICKETS t
                    LEFT JOIN CANAL_SAC_DEPARTAMENTOS d ON t.DEPARTAMENTO_ID = d.ID
                    LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
                    WHERE t.ID = :id
                `, { id });
                
                let nomeCompletoDeptoMsg = '';
                if (ticketDeptoRes.rows.length > 0) {
                    const deptoNome = ticketDeptoRes.rows[0][0];
                    const paiNome = ticketDeptoRes.rows[0][1];
                    if (paiNome && deptoNome) {
                        nomeCompletoDeptoMsg = `${paiNome} / ${deptoNome}`;
                    } else if (deptoNome) {
                        nomeCompletoDeptoMsg = deptoNome;
                    }
                }
                
                const tituloAvaliacao = nomeCompletoDeptoMsg ? `[Ticket #${id} - ${nomeCompletoDeptoMsg}]` : `[Ticket #${id}]`;
                const msgAvaliacao = `*Seu atendimento ${tituloAvaliacao} foi concluído!* ✅\n\nPor favor, avalie nosso atendimento respondendo com uma nota de *1 a 10* (sendo 1 muito ruim e 10 excelente):\n\nDigite *PULAR* para cancelar a avaliação.`;

                const evoUrlFinal = `${apiUrl}/message/sendText/${instanceName}`;
                const payload = {
                    number: telFormat(telefone),
                    text: msgAvaliacao
                };
                const headersReq = { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' };
                
                try {
                    await axios.post(`${apiUrl}/send/text`, payload, { headers: headersReq, timeout: 5000 });
                } catch (e) {
                    if (e.response && e.response.status === 404) {
                        await axios.post(evoUrlFinal, payload, { headers: headersReq, timeout: 5000 });
                    } else {
                        throw e;
                    }
                }
                
                const dadosTemp = JSON.stringify({ ticketId: id });
                const checkState = await conn.execute(`SELECT 1 FROM CANAL_BOT_STATE WHERE TELEFONE = :t`, { t: telefone });
                if (checkState.rows.length > 0) {
                    await conn.execute(`UPDATE CANAL_BOT_STATE SET ESTADO_ATUAL = 'AGUARDANDO_AVALIACAO', DADOS_TEMPORARIOS = :d WHERE TELEFONE = :t`, { d: dadosTemp, t: telefone }, { autoCommit: true });
                } else {
                    await conn.execute(`INSERT INTO CANAL_BOT_STATE (TELEFONE, ESTADO_ATUAL, DADOS_TEMPORARIOS) VALUES (:t, 'AGUARDANDO_AVALIACAO', :d)`, { t: telefone, d: dadosTemp }, { autoCommit: true });
                }
                
                return res.json({ message: 'Avaliação solicitada com sucesso.' });
            }
        }
        res.status(500).json({ error: 'Configuração do bot do SAC não encontrada.' });
    } catch (error) {
        console.error('[SAC] Erro ao solicitar avaliação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
});

// Agendar Ticket
router.put('/tickets/:id/agendamento', async (req, res) => {
    const { id } = req.params;
    const { dataAgendamento, codprod, qtde, motoristaNome, motoristaTel } = req.body;
    
    let conn;
    try {
        conn = await oraclePool.getConnection();
        const sql = `
            UPDATE CANAL_SAC_TICKETS 
            SET DATA_AGENDAMENTO = TO_DATE(:dataAgendamento, 'YYYY-MM-DD HH24:MI:SS'),
                AGENDAMENTO_CODPROD = :codprod,
                AGENDAMENTO_QTDE = :qtde,
                AGENDAMENTO_MOTORISTA_NOME = :motoristaNome,
                AGENDAMENTO_MOTORISTA_TEL = :motoristaTel,
                AGENDAMENTO_ENVIADO = 'N',
                ATUALIZADO_EM = SYSDATE
            WHERE ID = :id
        `;
        
        await conn.execute(sql, {
            dataAgendamento: dataAgendamento, // Espera formato 'YYYY-MM-DD 00:00:00'
            codprod: codprod || null,
            qtde: qtde || null,
            motoristaNome: motoristaNome || null,
            motoristaTel: motoristaTel || null,
            id: id
        }, { autoCommit: true });

        // Enviar mensagem automática para o ticket
        try {
            const dateParts = dataAgendamento.split(' ')[0].split('-');
            const dataFormatada = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            const message = `✅ *Agendamento Confirmado!*\nSua retirada de Troca/Devolução foi agendada para o dia *${dataFormatada}*.`;
            
            const ticketRes = await conn.execute(`SELECT TELEFONE FROM CANAL_SAC_TICKETS WHERE ID = :id`, { id });
            if (ticketRes.rows.length > 0) {
                const telefone = ticketRes.rows[0][0];
                
                const sacConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
                const sacCodusur = sacConfigRes.rows.length > 0 ? sacConfigRes.rows[0][0] : '9999';
                
                const instRes = await conn.execute(`SELECT INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
                if (instRes.rows.length > 0) {
                    const instanceName = instRes.rows[0][0];
                    const apiToken = instRes.rows[0][1];
                    const apiUrl = instRes.rows[0][2];
                    const axios = require('axios');
                    
                    let p = String(telefone).replace(/[^0-9]/g, '');
                    if (!p.startsWith('55')) p = '55' + p;

                    // Envia via Evolution API
                    try {
                        await axios.post(
                            `${apiUrl}/message/sendText/${instanceName}`,
                            { number: p, text: message },
                            { headers: { 'apikey': apiToken, 'Content-Type': 'application/json' } }
                        );
                    } catch (err) {
                        // Se falhar o Evo normal, tenta Evo GO
                        if (err.response && err.response.status === 404) {
                            await axios.post(
                                `${apiUrl}/send/text`,
                                { number: p, text: message },
                                { headers: { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' } }
                            ).catch(e => console.error('[SAC] Erro Evo GO no Agendamento:', e.message));
                        } else {
                            console.error('[SAC] Erro Evolution API no Agendamento:', err.message);
                        }
                    }

                    // Salva no banco (chat)
                    const msgId = 'SAC_AGD_' + Date.now();
                    await conn.execute(`
                        INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, STATUS, DATA_HORA, TICKET_ID, GROK_USADO)
                        VALUES (:id_msg, :cod, :tel, 'OUT', :txt, 'ENVIADA', SYSDATE, :tId, 'N')
                    `, {
                        id_msg: msgId,
                        cod: sacCodusur,
                        tel: telefone,
                        txt: message,
                        tId: id
                    }, { autoCommit: true });
                }
            }
        } catch (msgErr) {
            console.error('[SAC] Erro ao enviar msg de agendamento:', msgErr);
        }
        
        res.json({ success: true, message: 'Agendamento salvo com sucesso' });
    } catch (error) {
        console.error('[SAC] Erro ao agendar ticket:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
});

// Autocomplete Motoristas
router.get('/motoristas', async (req, res) => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        const sql = `
            SELECT DISTINCT AGENDAMENTO_MOTORISTA_NOME, AGENDAMENTO_MOTORISTA_TEL
            FROM CANAL_SAC_TICKETS 
            WHERE AGENDAMENTO_MOTORISTA_NOME IS NOT NULL
            ORDER BY AGENDAMENTO_MOTORISTA_NOME
        `;
        const result = await conn.execute(sql);
        const motoristas = result.rows.map(row => ({
            nome: row[0],
            telefone: row[1]
        }));
        res.json(motoristas);
    } catch (error) {
        console.error('[SAC] Erro ao buscar motoristas:', error);
        res.status(500).json({ error: 'Erro interno' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
});


// Autocomplete Produtos
router.get('/produtos', async (req, res) => {
    let conn;
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        
        conn = await oraclePool.getConnection();
        const sql = `
            SELECT CODPROD, DESCRICAO
            FROM PCPRODUT
            WHERE (CODPROD LIKE :q OR UPPER(DESCRICAO) LIKE UPPER('%' || :q || '%'))
              AND ROWNUM <= 20
            ORDER BY DESCRICAO
        `;
        const result = await conn.execute(sql, { q: `%${q}%` });
        const produtos = result.rows.map(row => ({
            codprod: row[0],
            descricao: row[1]
        }));
        res.json(produtos);
    } catch (error) {
        console.error('[SAC] Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro interno' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

router.post('/test-query', async (req, res) => {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        const result = await conn.execute(req.body.sql, req.body.binds || {});
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({error: e.message});
    } finally {
        if(conn) try { await conn.close(); } catch(e){}
    }
});
module.exports = router;

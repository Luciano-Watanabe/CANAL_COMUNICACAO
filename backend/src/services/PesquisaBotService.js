const axios = require('axios');
const fs = require('fs');
const path = require('path');

const botMensagensService = require('./botMensagensService');

const TAG = '[PESQUISA-BOT]';

class PesquisaBotService {
    constructor(webhookPoller) {
        this.webhookPoller = webhookPoller;
    }

    async getState(telefone, conn) {
        try {
            const result = await conn.execute(`
                SELECT ESTADO_ATUAL, LOCAL_ATUAL, DADOS_TEMPORARIOS, (SYSDATE - CAST(ATUALIZADO_EM AS DATE)) * 24
                FROM CANAL_BOT_PESQUISA_STATE 
                WHERE TELEFONE = :tel
            `, { tel: telefone });

            if (result.rows.length > 0) {
                const estado = result.rows[0][0];
                const local = result.rows[0][1];
                const horasPassadas = result.rows[0][3];

                if (horasPassadas && horasPassadas >= 24) {
                    console.log(`${TAG} Estado de ${telefone} expirou após ${horasPassadas.toFixed(2)}h. Resetando para INICIO.`);
                    await conn.execute(`DELETE FROM CANAL_BOT_PESQUISA_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
                    return { estado: 'INICIO', local: null, dados: {} };
                }

                let dados = {};
                try {
                    let rawData = result.rows[0][2];
                    if (rawData && typeof rawData.getData === 'function') {
                        rawData = await rawData.getData();
                    }
                    if (rawData) dados = JSON.parse(rawData);
                } catch(e) {
                    console.error(`${TAG} Erro ao parsear DADOS_TEMPORARIOS:`, e);
                }
                return { estado, local, dados };
            }
        } catch (err) {
            console.warn(`${TAG} Aviso ao buscar estado de ${telefone} (tentando fallback):`, err.message);
            try {
                const resFallback = await conn.execute(`
                    SELECT ESTADO_ATUAL, DADOS_TEMPORARIOS
                    FROM CANAL_BOT_PESQUISA_STATE
                    WHERE TELEFONE = :tel
                `, { tel: telefone });
                if (resFallback.rows && resFallback.rows.length > 0) {
                    const estado = resFallback.rows[0][0];
                    let dados = {};
                    try {
                        let rawData = resFallback.rows[0][1];
                        if (rawData && typeof rawData.getData === 'function') rawData = await rawData.getData();
                        if (rawData) dados = JSON.parse(rawData);
                    } catch (e) {}
                    return { estado, local: dados.nomeConcorrente || null, dados };
                }
            } catch (e2) {}
        }
        return { estado: 'INICIO', local: null, dados: {} };
    }

    async setState(telefone, estado, local, dados, conn) {
        const dadosStr = dados ? JSON.stringify(dados) : '{}';
        try {
            await conn.execute(`
                MERGE INTO CANAL_BOT_PESQUISA_STATE T
                USING (SELECT :tel AS TELEFONE, :est AS ESTADO_ATUAL, :loc AS LOCAL_ATUAL, :dados AS DADOS_TEMPORARIOS FROM DUAL) S
                ON (T.TELEFONE = S.TELEFONE)
                WHEN MATCHED THEN
                    UPDATE SET T.ESTADO_ATUAL = S.ESTADO_ATUAL, T.LOCAL_ATUAL = S.LOCAL_ATUAL, T.DADOS_TEMPORARIOS = S.DADOS_TEMPORARIOS, T.ATUALIZADO_EM = SYSDATE
                WHEN NOT MATCHED THEN
                    INSERT (TELEFONE, ESTADO_ATUAL, LOCAL_ATUAL, DADOS_TEMPORARIOS) VALUES (S.TELEFONE, S.ESTADO_ATUAL, S.LOCAL_ATUAL, S.DADOS_TEMPORARIOS)
            `, { tel: telefone, est: estado, loc: local || '', dados: dadosStr }, { autoCommit: true });
        } catch (err) {
            console.warn(`${TAG} Erro no setState com LOCAL_ATUAL, tentando fallback:`, err.message);
            try {
                await conn.execute(`
                    MERGE INTO CANAL_BOT_PESQUISA_STATE T
                    USING (SELECT :tel AS TELEFONE, :est AS ESTADO_ATUAL, :dados AS DADOS_TEMPORARIOS FROM DUAL) S
                    ON (T.TELEFONE = S.TELEFONE)
                    WHEN MATCHED THEN
                        UPDATE SET T.ESTADO_ATUAL = S.ESTADO_ATUAL, T.DADOS_TEMPORARIOS = S.DADOS_TEMPORARIOS, T.ATUALIZADO_EM = SYSDATE
                    WHEN NOT MATCHED THEN
                        INSERT (TELEFONE, ESTADO_ATUAL, DADOS_TEMPORARIOS) VALUES (S.TELEFONE, S.ESTADO_ATUAL, S.DADOS_TEMPORARIOS)
                `, { tel: telefone, est: estado, dados: dadosStr }, { autoCommit: true });
            } catch (e2) {
                console.error(`${TAG} Erro crítico no setState:`, e2.message);
            }
        }
        console.log(`${TAG} [setState] ${telefone} → estado="${estado}" | local="${local}"`);
    }

    async getColunasTabela(tableName, conn) {
        try {
            let res = await conn.execute(
                `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :tbl`,
                { tbl: tableName.toUpperCase() }
            );
            if (res.rows && res.rows.length > 0) {
                return res.rows.map(r => r[0].toUpperCase());
            }
            res = await conn.execute(
                `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :tbl`,
                { tbl: tableName.toUpperCase() }
            );
            if (res.rows && res.rows.length > 0) {
                return res.rows.map(r => r[0].toUpperCase());
            }
        } catch (e) {
            console.error(`${TAG} Erro ao buscar colunas de ${tableName}:`, e.message);
        }
        if (tableName.toUpperCase() === 'PCCONCOR') {
            return ['CODCONC', 'CONCORRENTE', 'ATIVO', 'TELEFONE', 'DTMXSALTER'];
        }
        if (tableName.toUpperCase() === 'PCCOTA') {
            return ['CODCOTACAO', 'CODPROD', 'CODCONC', 'CODCLI', 'PUNIT', 'DATA', 'CODUSUR', 'NUMREGIAO', 'CODFILIAL', 'PTABELA', 'CODPLPAG', 'FONTE', 'PRAZO', 'DATADOC', 'ESTOQUE', 'LISTA', 'PUNITATAC', 'TIPOEMBALAGEMPEDIDO'];
        }
        return [];
    }

    async consultarConcorrentes(termo, conn) {
        if (!termo || termo.trim().length === 0) return [];
        try {
            const termoLimpo = termo.trim();
            const termoSemAcento = termoLimpo.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            const sql = `
                SELECT CODCONC, CONCORRENTE
                FROM PCCONCOR
                WHERE UPPER(CONCORRENTE) LIKE UPPER(:t1)
                   OR UPPER(CONCORRENTE) LIKE UPPER(:t2)
                ORDER BY CONCORRENTE
            `;
            const res = await conn.execute(sql, { 
                t1: `%${termoLimpo}%`, 
                t2: `%${termoSemAcento}%` 
            }, { maxRows: 15 });

            return res.rows.map(row => ({
                codconcor: row[0],
                nome: (row[1] || '').trim(),
                cidade: '',
                bairro: ''
            }));
        } catch (err) {
            console.error(`${TAG} Erro ao consultar PCCONCOR:`, err);
            return [];
        }
    }

    async cadastrarNovoConcorrente(nomeBase, cidade, bairro, conn) {
        try {
            const resCod = await conn.execute(`SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(CODCONC, '^[0-9]+'))), 0) + 1 FROM PCCONCOR`);
            const novoCod = resCod.rows[0][0];

            let nomeFormatado = nomeBase.trim();
            const partesLoc = [bairro ? bairro.trim() : null, cidade ? cidade.trim() : null].filter(Boolean);
            if (partesLoc.length > 0) {
                const locStr = partesLoc.join(' - ');
                if (!nomeFormatado.toLowerCase().includes(locStr.toLowerCase())) {
                    nomeFormatado = `${nomeFormatado} - ${locStr}`;
                }
            }
            nomeFormatado = nomeFormatado.substring(0, 40).trim();

            const sql = `
                INSERT INTO PCCONCOR (CODCONC, CONCORRENTE, ATIVO, DTMXSALTER)
                VALUES (:cod, :nome, 'S', SYSDATE)
            `;
            await conn.execute(sql, { cod: String(novoCod), nome: nomeFormatado }, { autoCommit: true });
            console.log(`${TAG} ✅ Novo concorrente cadastrado em PCCONCOR: CODCONC=${novoCod}, CONCORRENTE="${nomeFormatado}"`);

            return {
                codconcor: novoCod,
                nome: nomeFormatado,
                cidade: (cidade || '').trim(),
                bairro: (bairro || '').trim()
            };
        } catch (err) {
            console.error(`${TAG} Erro ao cadastrar novo concorrente em PCCONCOR:`, err);
            throw err;
        }
    }

    async gravarCotacaoPCCOTA({ codconcor, codprod, preco, codusur, conn, numcota = null }) {
        try {
            const filial = String(process.env.ESTOQUE_CODFILIAL || '1');
            const regiao = Number(process.env.TABPR_NUMREGIAO || 1);

            let targetCodcotacao = numcota ? Number(numcota) : null;

            // 1. Se informou um numcota prévio, verifica se ele existe na PCCOTA para atualizar
            if (targetCodcotacao) {
                const checkRes = await conn.execute(
                    `SELECT CODCOTACAO FROM PCCOTA WHERE CODCOTACAO = :cota AND ROWNUM = 1`,
                    { cota: targetCodcotacao }
                );
                if (checkRes.rows.length === 0) {
                    targetCodcotacao = null; // Não achou na PCCOTA com esse código
                }
            }

            // 2. Se não tem targetCodcotacao, verifica se já existe uma cotação na PCCOTA para o mesmo concorrente e produto hoje
            if (!targetCodcotacao) {
                const existingRes = await conn.execute(
                    `SELECT CODCOTACAO 
                     FROM PCCOTA 
                     WHERE CODFILIAL = :filial 
                       AND CODCONC = :codconc 
                       AND CODPROD = :codprod 
                       AND TRUNC(DATA) = TRUNC(SYSDATE)
                     ORDER BY CODCOTACAO DESC
                     FETCH FIRST 1 ROWS ONLY`,
                    { filial, codconc: String(codconcor), codprod: Number(codprod) }
                );
                if (existingRes.rows && existingRes.rows.length > 0) {
                    targetCodcotacao = existingRes.rows[0][0];
                    console.log(`${TAG} ℹ️ Encontrada cotação existente na PCCOTA (#${targetCodcotacao}) para hoje. Atualizando para não multiplicar.`);
                }
            }

            // 3. Se achou cotação existente (por numcota ou por concorrente/produto hoje): ATUALIZA (UPDATE)!
            if (targetCodcotacao) {
                const sqlUpdate = `
                    UPDATE PCCOTA
                    SET CODCONC = :codconc,
                        CODPROD = :codprod,
                        PUNIT = :punit,
                        CODUSUR = :codusur,
                        CODFILIAL = :filial,
                        NUMREGIAO = :regiao,
                        DATA = TRUNC(SYSDATE),
                        DATADOC = TRUNC(SYSDATE)
                    WHERE CODCOTACAO = :codcotacao
                `;
                await conn.execute(sqlUpdate, {
                    codcotacao: targetCodcotacao,
                    codconc: String(codconcor),
                    codprod: Number(codprod),
                    punit: Number(preco),
                    codusur: codusur ? Number(codusur) : 1,
                    filial,
                    regiao
                }, { autoCommit: true });
                console.log(`${TAG} 🔄 Cotação atualizada na PCCOTA sem duplicar (CODCOTACAO: ${targetCodcotacao}, CODCONC: ${codconcor}, CODPROD: ${codprod}, PUNIT: ${preco})`);
                return targetCodcotacao;
            }

            // 4. Caso contrário, e somente se for um novo registro: INSERE NOVA COTAÇÃO (INSERT)!
            const resSeq = await conn.execute(`SELECT NVL(MAX(CODCOTACAO), 0) + 1 FROM PCCOTA`);
            const novoCodcotacao = resSeq.rows[0][0];

            const sqlInsert = `
                INSERT INTO PCCOTA (
                    CODCOTACAO, CODCONC, CODPROD, PUNIT, DATA, DATADOC,
                    CODUSUR, CODFILIAL, NUMREGIAO, CODCLI, CODPLPAG,
                    FONTE, PRAZO, ESTOQUE, LISTA, PUNITATAC, TIPOEMBALAGEMPEDIDO
                ) VALUES (
                    :codcotacao, :codconc, :codprod, :punit, TRUNC(SYSDATE), TRUNC(SYSDATE),
                    :codusur, :filial, :regiao, 1, 1,
                    'N', 0, 'S', 1, 0, 'V'
                )
            `;
            await conn.execute(sqlInsert, {
                codcotacao: novoCodcotacao,
                codconc: String(codconcor),
                codprod: Number(codprod),
                punit: Number(preco),
                codusur: codusur ? Number(codusur) : 1,
                filial,
                regiao
            }, { autoCommit: true });
            console.log(`${TAG} ✅ Nova cotação inserida com sucesso na PCCOTA (CODCOTACAO: ${novoCodcotacao}, CODCONC: ${codconcor}, CODPROD: ${codprod}, PUNIT: ${preco})`);

            return novoCodcotacao;
        } catch (err) {
            console.error(`${TAG} Erro ao gravar na PCCOTA:`, err);
            return null;
        }
    }

    async handleMessage(telefone, text, instanceName, conn, isAudio, audioBase64, originalMessage, codusurBot, mediaUrl = null) {
        const { estado, local, dados } = await this.getState(telefone, conn);
        
        console.log(`${TAG} ══════════════════════════════════════════`);
        console.log(`${TAG} Mensagem recebida de: ${telefone}`);
        console.log(`${TAG} Estado atual: ${estado} | Local: ${local}`);
        console.log(`${TAG} Texto: "${text || ''}" | temBase64: ${!!audioBase64}`);

        const cmd = text ? text.toLowerCase().trim() : '';

        // Comandos de controle
        if (cmd === 'sair' || cmd === 'cancelar' || cmd === 'encerrar') {
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ENCERRAR'), conn, instanceName);
            await conn.execute(`DELETE FROM CANAL_BOT_PESQUISA_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
            return;
        }

        if (cmd === 'trocar local' || cmd === 'novo local') {
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_TROCAR_LOCAL'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_LOCAL', null, {}, conn);
            return;
        }

        if (cmd === 'voltar') {
            if (estado === 'AGUARDANDO_ESCOLHA_CONCORRENTE' || estado === 'AGUARDANDO_NOVO_CIDADE') {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_INICIO'), conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_LOCAL', null, {}, conn);
                return;
            }
            if (estado === 'AGUARDANDO_NOVO_BAIRRO') {
                const msg = botMensagensService.getMsg('PESQUISA_PEDIR_CIDADE_NOVO').replace(/\{\{nome\}\}/g, dados.termoDigitado || 'Novo Concorrente');
                await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_NOVO_CIDADE', null, dados, conn);
                return;
            }
        }

        // Fluxo de Estados
        if (estado === 'INICIO') {
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_INICIO'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_LOCAL', null, {}, conn);
            return;
        }

        if (estado === 'AGUARDANDO_LOCAL') {
            if (!text || text.trim().length < 2) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_LOCAL_INVALIDO'), conn, instanceName);
                return;
            }

            const termo = text.trim();
            console.log(`${TAG} Consultando PCCONCOR para termo: "${termo}"`);
            const concorrentes = await this.consultarConcorrentes(termo, conn);

            // Caso 1: Nenhum concorrente encontrado -> oferece cadastro de novo
            if (concorrentes.length === 0) {
                const msgNaoEnc = botMensagensService.getMsg('PESQUISA_CONCORRENTE_NAO_ENCONTRADO').replace(/\{\{termo\}\}/g, termo);
                await this.webhookPoller.enviarMensagemBot(telefone, msgNaoEnc, conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_NOVO_CIDADE', null, { termoDigitado: termo }, conn);
                return;
            }

            // Caso 2: Exatamente 1 e o nome digitado é exatamente igual ao cadastrado
            if (concorrentes.length === 1 && concorrentes[0].nome.toUpperCase() === termo.toUpperCase()) {
                const c = concorrentes[0];
                let detalhes = '';
                if (c.cidade || c.bairro) {
                    detalhes = `📍 ${[c.bairro, c.cidade].filter(Boolean).join(', ')}\n`;
                }
                const msgConfirma = botMensagensService.getMsg('PESQUISA_CONCORRENTE_CONFIRMADO')
                                    .replace(/\{\{nome\}\}/g, c.nome)
                                    .replace(/\{\{codigo\}\}/g, c.codconcor)
                                    .replace(/\{\{detalhes\}\}/g, detalhes);
                await this.webhookPoller.enviarMensagemBot(telefone, msgConfirma, conn, instanceName);

                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', c.nome, { codconcor: c.codconcor, nomeConcorrente: c.nome }, conn);
                return;
            }

            // Caso 3: Múltiplos ou aproximado -> listar opções numeradas com código
            let opcoesTexto = '';
            const opcoes = [];
            const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

            concorrentes.slice(0, 9).forEach((c, idx) => {
                const num = idx + 1;
                opcoes.push({ index: num, codconcor: c.codconcor, nome: c.nome, cidade: c.cidade, bairro: c.bairro });
                const locInfo = [c.bairro, c.cidade].filter(Boolean).join(', ');
                const icon = emojis[idx] || `${num}.`;
                opcoesTexto += `${icon} - *${c.nome}* (Cód: ${c.codconcor})${locInfo ? ' - ' + locInfo : ''}\n`;
            });

            const msgOpcoes = botMensagensService.getMsg('PESQUISA_CONCORRENTES_ENCONTRADOS')
                                .replace(/\{\{termo\}\}/g, termo)
                                .replace(/\{\{opcoes\}\}/g, opcoesTexto);
            
            await this.webhookPoller.enviarMensagemBot(telefone, msgOpcoes, conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_ESCOLHA_CONCORRENTE', null, { opcoes, termoDigitado: termo }, conn);
            return;
        }

        if (estado === 'AGUARDANDO_ESCOLHA_CONCORRENTE') {
            const opcoes = dados.opcoes || [];
            const termoBase = dados.termoDigitado || 'Novo Concorrente';

            // Opção 0 ou Novo
            if (cmd === '0' || cmd === 'novo' || cmd === 'nenhum' || cmd.includes('cadastrar') || cmd.includes('nenhum destes')) {
                const msgPedirCidade = botMensagensService.getMsg('PESQUISA_PEDIR_CIDADE_NOVO').replace(/\{\{nome\}\}/g, termoBase);
                await this.webhookPoller.enviarMensagemBot(telefone, msgPedirCidade, conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_NOVO_CIDADE', null, { termoDigitado: termoBase }, conn);
                return;
            }

            const num = parseInt(cmd);
            let escolhido = null;

            if (!isNaN(num)) {
                escolhido = opcoes.find(o => o.index === num || o.codconcor === num);
            } else {
                // Tenta match pelo nome
                escolhido = opcoes.find(o => o.nome.toLowerCase().includes(cmd));
            }

            if (!escolhido) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_OPCAO_INVALIDA'), conn, instanceName);
                return;
            }

            let detalhes = '';
            if (escolhido.cidade || escolhido.bairro) {
                detalhes = `📍 ${[escolhido.bairro, escolhido.cidade].filter(Boolean).join(', ')}\n`;
            }

            const msgConfirma = botMensagensService.getMsg('PESQUISA_CONCORRENTE_CONFIRMADO')
                                .replace(/\{\{nome\}\}/g, escolhido.nome)
                                .replace(/\{\{codigo\}\}/g, escolhido.codconcor)
                                .replace(/\{\{detalhes\}\}/g, detalhes);
            await this.webhookPoller.enviarMensagemBot(telefone, msgConfirma, conn, instanceName);

            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', escolhido.nome, { codconcor: escolhido.codconcor, nomeConcorrente: escolhido.nome }, conn);
            return;
        }

        if (estado === 'AGUARDANDO_NOVO_CIDADE') {
            if (!text || text.trim().length < 2) {
                await this.webhookPoller.enviarMensagemBot(telefone, 'Por favor, informe o nome da Cidade:', conn, instanceName);
                return;
            }

            const inputCidade = text.trim();
            const termoBase = dados.termoDigitado || 'Concorrente';

            // Verifica se enviou "Cidade - Bairro" ou "Cidade, Bairro" junto
            if (inputCidade.includes('-') || inputCidade.includes(',') || inputCidade.includes('/')) {
                const parts = inputCidade.split(/[-,\/]/).map(p => p.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    const cidade = parts[0];
                    const bairro = parts.slice(1).join(' - ');
                    const novo = await this.cadastrarNovoConcorrente(termoBase, cidade, bairro, conn);

                    const msgSucesso = botMensagensService.getMsg('PESQUISA_NOVO_CONCORRENTE_SUCESSO')
                                        .replace(/\{\{nome\}\}/g, novo.nome)
                                        .replace(/\{\{codigo\}\}/g, novo.codconcor)
                                        .replace(/\{\{cidade\}\}/g, novo.cidade)
                                        .replace(/\{\{bairro\}\}/g, novo.bairro);
                    await this.webhookPoller.enviarMensagemBot(telefone, msgSucesso, conn, instanceName);

                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
                    await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', novo.nome, { codconcor: novo.codconcor, nomeConcorrente: novo.nome }, conn);
                    return;
                }
            }

            // Apenas a cidade foi informada: avança para pedir o Bairro
            const dadosProx = { ...dados, novaCidade: inputCidade };
            const msgBairro = botMensagensService.getMsg('PESQUISA_PEDIR_BAIRRO_NOVO')
                                .replace(/\{\{cidade\}\}/g, inputCidade)
                                .replace(/\{\{nome\}\}/g, termoBase);
            await this.webhookPoller.enviarMensagemBot(telefone, msgBairro, conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_NOVO_BAIRRO', null, dadosProx, conn);
            return;
        }

        if (estado === 'AGUARDANDO_NOVO_BAIRRO') {
            if (!text || text.trim().length < 2) {
                await this.webhookPoller.enviarMensagemBot(telefone, 'Por favor, informe o Bairro:', conn, instanceName);
                return;
            }

            const bairro = text.trim();
            const cidade = dados.novaCidade || '';
            const termoBase = dados.termoDigitado || 'Concorrente';

            const novo = await this.cadastrarNovoConcorrente(termoBase, cidade, bairro, conn);

            const msgSucesso = botMensagensService.getMsg('PESQUISA_NOVO_CONCORRENTE_SUCESSO')
                                .replace(/\{\{nome\}\}/g, novo.nome)
                                .replace(/\{\{codigo\}\}/g, novo.codconcor)
                                .replace(/\{\{cidade\}\}/g, novo.cidade)
                                .replace(/\{\{bairro\}\}/g, novo.bairro);
            await this.webhookPoller.enviarMensagemBot(telefone, msgSucesso, conn, instanceName);

            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', novo.nome, { codconcor: novo.codconcor, nomeConcorrente: novo.nome }, conn);
            return;
        }

        if (estado === 'AGUARDANDO_FOTO_OU_EAN') {
            const hasImage = originalMessage && (
                (originalMessage.message && originalMessage.message.imageMessage) ||
                (originalMessage.Message && originalMessage.Message.imageMessage)
            );
            if (audioBase64 && hasImage) {
                // Tem uma imagem
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ANALISE_IMAGEM'), conn, instanceName);
                
                let imagemUrl = mediaUrl;
                if (!imagemUrl) {
                    try {
                        let rawBase64 = audioBase64;
                        if (rawBase64.startsWith('data:image')) {
                            rawBase64 = rawBase64.split(',')[1];
                        }
                        const filename = `pesquisa_${telefone}_${Date.now()}.jpg`;
                        const filepath = path.join(__dirname, '../../uploads', filename);
                        if (!fs.existsSync(path.join(__dirname, '../../uploads'))) {
                            fs.mkdirSync(path.join(__dirname, '../../uploads'), { recursive: true });
                        }
                        fs.writeFileSync(filepath, rawBase64, 'base64');
                        imagemUrl = `/uploads/${filename}`;
                    } catch (err) {
                        console.error(`${TAG} Erro ao salvar imagem da pesquisa:`, err);
                    }
                }

                let extractedData = await this.extractDataFromImageGroq(audioBase64, conn);
                
                if (!extractedData) {
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_EXTRAIR'), conn, instanceName);
                    return;
                }
                
                if (!Array.isArray(extractedData)) {
                    extractedData = [extractedData]; // garante que seja array
                }

                let totalInseridos = 0;
                let msgsExtras = "";

                for (const item of extractedData) {
                    const { produto, preco, ean } = item;
                    if (!produto && !ean) continue;

                    const resBusca = await this.finalizarBuscaEInserir(telefone, local, produto, ean, preco, codusurBot, conn, instanceName, imagemUrl, true, dados.codconcor);
                    if (resBusca) {
                        totalInseridos++;
                        msgsExtras += `\n📦 *${resBusca.nomeProdutoBanco || 'Produto'}*`;
                        if (ean) msgsExtras += ` | EAN: ${ean}`;
                        if (preco) msgsExtras += ` | Concorrente: R$ ${parseFloat(preco).toFixed(2)}`;
                        if (resBusca.infoWinThor) msgsExtras += `\n   ↳ Sist: Cód ${resBusca.infoWinThor.codprod} - R$ ${parseFloat(resBusca.infoWinThor.preco || 0).toFixed(2)}\n`;
                        else msgsExtras += `\n   ↳ _Não encontrado no sistema._\n`;
                    }
                }
                
                if (totalInseridos === 0) {
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_FALTA_INFO'), conn, instanceName);
                    return;
                }

                const respBase = botMensagensService.getMsg('PESQUISA_SUCESSO')
                                .replace(/\{\{local\}\}/g, local)
                                .replace(/\{\{produto\}\}/g, `${totalInseridos} produto(s) detectado(s)`)
                                .replace(/\{\{dados_extras\}\}/g, msgsExtras.trim());

                await this.webhookPoller.enviarMensagemBot(telefone, respBase, conn, instanceName);
                
                // Volta para aguardar próxima leitura preservando codconcor
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', local, { codconcor: dados.codconcor, nomeConcorrente: dados.nomeConcorrente }, conn);
                return;
            } else {
                // É texto, tentamos validar EAN ou "SEM EAN"
                const eanText = text ? text.trim().toUpperCase() : '';
                
                if (eanText === 'SEM EAN' || /^\d+$/.test(eanText)) {
                    const eanToSave = eanText === 'SEM EAN' ? null : eanText;
                    
                    await this.setState(telefone, 'AGUARDANDO_NOME_PRODUTO', local, { ...dados, ean: eanToSave }, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_NOME'), conn, instanceName);
                } else {
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_EAN_INVALIDO'), conn, instanceName);
                }
                return;
            }
        }

        if (estado === 'AGUARDANDO_NOME_PRODUTO') {
            if (!text || text.length < 2 || audioBase64) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_ENTENDER'), conn, instanceName);
                return;
            }
            
            dados.produto = text.trim();
            await this.setState(telefone, 'AGUARDANDO_PRECO', local, dados, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_PRECO'), conn, instanceName);
            return;
        }

        if (estado === 'AGUARDANDO_PRECO') {
            if (!text || audioBase64) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_PRECO_INVALIDO'), conn, instanceName);
                return;
            }
            
            let priceMatch = text.match(/[\d.,]+/);
            if (!priceMatch) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_PRECO_INVALIDO'), conn, instanceName);
                return;
            }
            
            let precoStr = priceMatch[0];
            if(precoStr.includes(',') && precoStr.includes('.')) {
               precoStr = precoStr.replace(/\./g, '').replace(',', '.');
            } else if (precoStr.includes(',')) {
               precoStr = precoStr.replace(',', '.');
            }
            
            const preco = parseFloat(precoStr);
            if (isNaN(preco)) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_PRECO_INVALIDO'), conn, instanceName);
                return;
            }

            dados.preco = preco;
            await this.finalizarBuscaEInserir(telefone, local, dados.produto, dados.ean, dados.preco, codusurBot, conn, instanceName, null, false, dados.codconcor);
            
            // Volta pro loop preservando codconcor
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', local, { codconcor: dados.codconcor, nomeConcorrente: dados.nomeConcorrente }, conn);
            return;
        }
    }

    async finalizarBuscaEInserir(telefone, local, produto, ean, preco, codusurBot, conn, instanceName, imagemUrl = null, pularMensagem = false, codconcor = null) {
        // Busca no WinThor
        const infoWinThor = await this.buscarPrecoWinThor(ean, conn);
        
        // Salvar no banco
        let codprod = infoWinThor ? infoWinThor.codprod : null;
        let precoTabela = infoWinThor ? infoWinThor.preco : null;
        let custo = infoWinThor ? infoWinThor.custo : null;
        let nomeProdutoBanco = (infoWinThor && infoWinThor.descricao) ? infoWinThor.descricao : produto;

        let numcota = null;
        let statusIntegracao = 'PENDENTE';

        // Se tem produto identificado no WinThor, concorrente e preço -> Grava na PCCOTA!
        if (codprod && codconcor && preco) {
            numcota = await this.gravarCotacaoPCCOTA({
                codconcor,
                codprod,
                preco,
                codusur: codusurBot,
                conn
            });
            if (numcota) {
                statusIntegracao = 'INTEGRADO';
            }
        }

        // Insere na tabela CANAL_PESQUISA_PRECO
        try {
            const sqlInsert = `
                INSERT INTO CANAL_PESQUISA_PRECO (
                    TELEFONE_REMETENTE, LOCAL, CODCONCOR, PRODUTO_NOME, EAN, CODPROD, PRECO_ENCONTRADO, PRECO_TABELA, CUSTO, CODUSUR, IMAGEM_URL, NUMCOTA, STATUS_INTEGRACAO, DATA_INTEGRACAO
                ) VALUES (
                    :tel, :loc, :codconcor, :prod, :ean, :codprod, :preco_enc, :preco_tab, :custo, :codusur, :imagem_url, :numcota, :status_integracao, ${numcota ? 'SYSDATE' : 'NULL'}
                )
            `;
            const params = {
                tel: telefone,
                loc: local,
                codconcor: codconcor ? Number(codconcor) : null,
                prod: nomeProdutoBanco || 'Desconhecido',
                ean: ean || null,
                codprod: codprod ? Number(codprod) : null,
                preco_enc: preco ? Number(preco) : null,
                preco_tab: precoTabela ? Number(precoTabela) : null,
                custo: custo ? Number(custo) : null,
                codusur: codusurBot || null,
                imagem_url: imagemUrl,
                numcota: numcota ? Number(numcota) : null,
                status_integracao: statusIntegracao
            };
            await conn.execute(sqlInsert, params, { autoCommit: true });
            console.log(`${TAG} Dados salvos com sucesso em CANAL_PESQUISA_PRECO.`);
        } catch (err) {
            console.error(`${TAG} Erro ao salvar pesquisa:`, err);
        }

        // Montar resposta
        let dados_extras = '';
        if (ean) dados_extras += `🏷️ EAN: ${ean}\n`;
        if (preco) dados_extras += `💲 Preço Concorrente: R$ ${parseFloat(preco).toFixed(2)}\n`;

        if (infoWinThor) {
            dados_extras += `\n📊 *Dados Sistema (WinThor):*\n`;
            dados_extras += `Cód. Prod: ${infoWinThor.codprod}\n`;
            if (infoWinThor.descricao) dados_extras += `Descrição: ${infoWinThor.descricao}\n`;
            if (numcota) {
                dados_extras += `🎯 *Registrado no WinThor:* Cotação PCCOTA #${numcota}\n`;
            }
        } else if (ean) {
            dados_extras += `\n⚠️ _Produto não encontrado no sistema com este EAN._\n`;
        }

        const resp = botMensagensService.getMsg('PESQUISA_SUCESSO')
                        .replace(/\{\{local\}\}/g, local)
                        .replace(/\{\{produto\}\}/g, nomeProdutoBanco || 'Não identificado')
                        .replace(/\{\{dados_extras\}\}/g, dados_extras.trim());
        
        if (!pularMensagem) {
            await this.webhookPoller.enviarMensagemBot(telefone, resp, conn, instanceName);
        }
        return { nomeProdutoBanco, infoWinThor, dados_extras, numcota };
    }

    async getGroqApiKey(conn) {
        const configRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
        if (configRes.rows.length > 0 && configRes.rows[0][0]) {
            return configRes.rows[0][0];
        }
        return process.env.GROQ_API_KEY;
    }

    async extractDataFromImageGroq(base64Image, conn) {
        const apiKey = await this.getGroqApiKey(conn);
        if (!apiKey) {
            console.error(`${TAG} GROQ_API_KEY não configurada.`);
            return null;
        }

        try {
            // Adjust payload base64 prefix if needed
            let imageContent = base64Image;
            if (!imageContent.startsWith('data:image')) {
                imageContent = `data:image/jpeg;base64,${imageContent}`;
            }

            const payload = {
                model: "qwen/qwen3.8-27b",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Extraia da imagem TODOS os produtos, identificando o nome do produto, o código EAN/Código de barras (se visível) e o preço.\n\nRetorne EXCLUSIVAMENTE um array de objetos JSON neste formato:\n[{\"produto\": \"Nome do produto\", \"preco\": 10.50, \"ean\": \"1234567890123\"}]\n\nSe não encontrar algum dado em um produto, envie null para ele. Se o preço estiver com vírgula, converta para float (ex: 10,50 vira 10.50). Certifique-se de listar TODOS os produtos legíveis na imagem."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageContent
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.1
            };

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content;
            return this.parseJsonResponse(content);

        } catch (err) {
            console.error(`${TAG} Erro ao chamar Groq Vision:`, err.response?.data || err.message);
            return null;
        }
    }

    async extractDataFromTextGroq(text, conn) {
        const apiKey = await this.getGroqApiKey(conn);
        if (!apiKey) {
            console.error(`${TAG} GROQ_API_KEY não configurada.`);
            return null;
        }

        try {
            const payload = {
                model: "llama3-70b-8192", // text only model is fine here
                messages: [
                    {
                        role: "system",
                        content: "Você é um extrator de dados. O usuário enviará um texto contendo dados de preço, produto e EAN.\nRetorne EXCLUSIVAMENTE um objeto JSON neste formato:\n{\"produto\": \"Nome\", \"preco\": 10.50, \"ean\": \"12345\"}\nSe faltar alguma info, mande null."
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.1
            };

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content;
            return this.parseJsonResponse(content);

        } catch (err) {
            console.error(`${TAG} Erro ao chamar Groq Text:`, err.response?.data || err.message);
            return null;
        }
    }

    parseJsonResponse(content) {
        try {
            let jsonStr = content.trim();
            const startIdxArray = jsonStr.indexOf('[');
            const endIdxArray = jsonStr.lastIndexOf(']');
            const startIdxObj = jsonStr.indexOf('{');
            const endIdxObj = jsonStr.lastIndexOf('}');
            
            if (startIdxArray !== -1 && endIdxArray !== -1 && endIdxArray >= startIdxArray && (startIdxObj === -1 || startIdxArray < startIdxObj)) {
                jsonStr = jsonStr.substring(startIdxArray, endIdxArray + 1);
            } else if (startIdxObj !== -1 && endIdxObj !== -1 && endIdxObj >= startIdxObj) {
                jsonStr = jsonStr.substring(startIdxObj, endIdxObj + 1);
            }
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error(`${TAG} Falha ao parsear JSON da IA:`, content);
            return null;
        }
    }

    async buscarPrecoWinThor(ean, conn) {
        if (!ean) return null;

        try {
            const filial = process.env.ESTOQUE_CODFILIAL || '1';
            const regiao = process.env.TABPR_NUMREGIAO || '1';

            // 1. Achar codprod a partir da embalagem (PCEMBALAGEM / PCPRODUT)
            const sqlEmbalagem = `
                SELECT P.CODPROD, P.DESCRICAO 
                FROM PCPRODUT P
                JOIN PCEMBALAGEM E ON E.CODPROD = P.CODPROD
                WHERE E.CODAUXILIAR = :ean AND ROWNUM = 1
            `;
            const resProd = await conn.execute(sqlEmbalagem, { ean });
            
            if (resProd.rows.length === 0) return null;

            const codprod = resProd.rows[0][0];
            const descricao = resProd.rows[0][1];

            // 2. Achar Preço
            let preco = null;
            const sqlPreco = `SELECT PTABELA FROM PCTABPR WHERE CODPROD = :codprod AND NUMREGIAO = :regiao`;
            const resPreco = await conn.execute(sqlPreco, { codprod, regiao });
            if (resPreco.rows.length > 0) preco = resPreco.rows[0][0];

            // 3. Achar Custo
            let custo = null;
            const sqlCusto = `SELECT CUSTOFIN FROM PCEST WHERE CODPROD = :codprod AND CODFILIAL = :filial`;
            const resCusto = await conn.execute(sqlCusto, { codprod, filial });
            if (resCusto.rows.length > 0) custo = resCusto.rows[0][0];

            return { codprod, descricao, preco, custo };

        } catch (err) {
            console.error(`${TAG} Erro ao buscar no WinThor:`, err);
            return null;
        }
    }
}

module.exports = PesquisaBotService;

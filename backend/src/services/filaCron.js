const cron = require('node-cron');
const oracledb = require('oracledb');
const axios = require('axios');
const cacheService = require('./cacheService');
const { createMontage } = require('./imageMontage');

let isProcessingFila = false;

// Processar a cada minuto
cron.schedule('* * * * *', async () => {
    if (isProcessingFila) return;

    const currentHour = new Date().getHours();
    // Horário comercial das 8h às 18h (8:00 até 17:59)
    if (currentHour < 8 || currentHour >= 18) {
        return; // Fora do horário, não processa a fila
    }

    isProcessingFila = true;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT ID, CODCLI, TELEFONE, CODUSUR, MENSAGEM_TXT, CODATV1
            FROM CANAL_REATIVACAO_FILA
            WHERE STATUS = 'PENDENTE'
            ORDER BY DATA_CRIACAO ASC
            FETCH FIRST 4 ROWS ONLY
        `;
        
        const result = await connection.execute(sql, [], {
            fetchInfo: {
                "MENSAGEM_TXT": { type: oracledb.STRING }
            }
        });
        if (result.rows.length === 0) {
            isProcessingFila = false;
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
            return;
        }

        console.log(`[FILA CRON] Processando ${result.rows.length} registros da fila de reativação...`);

        const ids = result.rows.map(r => r[0]);
        const inClause = ids.join(',');
        await connection.execute(`UPDATE CANAL_REATIVACAO_FILA SET STATUS = 'PROCESSANDO', DATA_PROCESSAMENTO = SYSDATE WHERE ID IN (${inClause})`, [], { autoCommit: true });

        const formatPhone = (phone) => {
            if (!phone) return '';
            let p = phone.replace(/[^0-9]/g, '');
            if (!p.startsWith('55')) p = '55' + p;
            return p;
        };

        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows[i];
            const filaId = row[0];
            const codcli = row[1];
            const telClienteRaw = row[2];
            const codusur = row[3];
            const txtProdutos = row[4];
            const codatv1 = row[5];

            try {
                const configResult = await connection.execute(`
                    SELECT 
                        T.INSTANCE_NAME, 
                        T.API_TOKEN, 
                        COALESCE(T.API_URL, G.VALOR) AS URL_BASE
                    FROM CANAL_TOKENS_EVOLUTION T
                    LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
                    WHERE T.CODUSUR = :codusur
                `, { codusur });
                
                if (configResult.rows.length === 0) {
                    throw new Error('Token não cadastrado.');
                }
                const instanceName = configResult.rows[0][0];
                const evoToken = configResult.rows[0][1];
                let evoUrl = configResult.rows[0][2];
                if (evoUrl.endsWith('/')) evoUrl = evoUrl.slice(0, -1);
                
                const headers = {
                    'apikey': evoToken,
                    'instance': instanceName,
                    'Content-Type': 'application/json'
                };

                const telCliente = formatPhone(telClienteRaw);

                const detailsRes = await connection.execute(`
                    SELECT NVL(C.FANTASIA, C.CLIENTE), U.NOME, NVL(U.TELEFONE1, U.TELEFONE2)
                    FROM PCCLIENT C
                    LEFT JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                    WHERE C.CODCLI = :codcli
                `, { codcli });

                if (detailsRes.rows.length === 0) {
                    throw new Error('Cliente não encontrado');
                }

                const nomeCliente = detailsRes.rows[0][0];
                const nomeVendedor = detailsRes.rows[0][1];
                const telVendedorRaw = detailsRes.rows[0][2];
                const telVendedor = formatPhone(telVendedorRaw);

                let textoBase = txtProdutos;
                if (textoBase && typeof textoBase === 'object') {
                    textoBase = '[Mensagem de Reativação]';
                }
                let campanhaSelecionada = null;
                let enviarPreco = true;
                if (typeof textoBase === 'string') {
                    const matchCampanha = textoBase.match(/^\[CAMPANHA:(.*?)\]/);
                    if (matchCampanha) {
                        campanhaSelecionada = matchCampanha[1];
                        textoBase = textoBase.substring(matchCampanha[0].length);
                    }
                    
                    const matchSemPreco = textoBase.match(/^\[SEM_PRECO\]/);
                    if (matchSemPreco) {
                        enviarPreco = false;
                        textoBase = textoBase.substring(matchSemPreco[0].length);
                    }
                }

                let base64Data = null;
                let listaProdutos = '';
                if (codatv1) {
                    let campanhaFilter = '';
                    if (campanhaSelecionada) {
                        campanhaFilter = `AND UPPER(EMB.EMBALAGEM) LIKE UPPER('%' || :campanha || '%')`;
                    }
                    const sqlMix = `
                        SELECT 
                            CG.CODPROD, P.DESCRICAO, NVL(PR.PVENDA, 0) AS PVENDA, P.UNIDADE, NVL(P.QTUNITCX, 1) AS QTUNITCX
                        FROM (
                            SELECT M.CODPROD, SUM(M.QT) AS QTD_TOTAL, COUNT(DISTINCT M.CODCLI) AS QTD_CLIENTES_COMPRARAM
                            FROM PCMOV M
                            JOIN PCCLIENT CA ON CA.CODCLI = M.CODCLI
                            WHERE CA.CODATV1 = :codatv1 AND M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                              AND EXISTS (
                                  SELECT 1 FROM PCEST E 
                                  WHERE E.CODPROD = M.CODPROD 
                                  HAVING SUM(NVL(E.QTESTGER,0) - NVL(E.QTBLOQUEADA,0) - NVL(E.QTRESERV,0)) > 0
                              )
                              AND EXISTS (
                                  SELECT 1 FROM PCEMBALAGEM EMB 
                                  WHERE EMB.CODPROD = M.CODPROD 
                                    AND NVL(EMB.ENVIAFV, 'N') = 'S' 
                                    AND EMB.DTINATIVO IS NULL
                                    ${campanhaFilter}
                              )
                            GROUP BY M.CODPROD
                            ORDER BY QTD_CLIENTES_COMPRARAM DESC
                            FETCH FIRST 10 ROWS ONLY
                        ) CG
                        JOIN PCPRODUT P ON P.CODPROD = CG.CODPROD
                        LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
                    `;
                    const bindsMix = { codatv1 };
                    if (campanhaSelecionada) bindsMix.campanha = campanhaSelecionada;
                    const mixRes = await connection.execute(sqlMix, bindsMix);
                    if (mixRes.rows.length > 0) {
                        const fs = require('fs');
                        const path = require('path');
                        const getImagePath = (codprod) => {
                            const extensions = ['.jpg', '.png', '.jpeg', '.JPG', '.PNG', '.JPEG', '.webp', '.WEBP'];
                            const imagesDir = process.env.IMAGES_DIR || '/app/imagens_produtos';
                            for (const ext of extensions) {
                                const localPath = path.join(imagesDir, `${codprod}${ext}`);
                                if (fs.existsSync(localPath)) {
                                    return localPath;
                                }
                            }
                            return null;
                        };
                        const cards = mixRes.rows.map(r => {
                            const codprod = r[0];
                            const desc = r[1];
                            const pvenda = r[2];
                            const unidade = r[3] || 'UN';
                            const qtunitcx = r[4] || 1;
                            
                            let precoStr = "";
                            if (enviarPreco) {
                                precoStr = `R$ ${pvenda.toFixed(2)} / ${unidade}`;
                            }
                            
                            const imgPath = getImagePath(codprod);

                            return {
                                codprod: codprod,
                                title: desc,
                                text: precoStr,
                                imagePath: imgPath
                            };
                        });
                        base64Data = await createMontage(cards);

                        listaProdutos = '\n\n*Produtos sugeridos:*';
                        cards.forEach(c => {
                            listaProdutos += `\n- ${c.title}${c.text ? ` (${c.text})` : ''}`;
                        });
                    }
                }

                // textoBase foi extraido lá em cima, ignoramos o bloco que existia aqui
                
                console.log(`[FILA CRON] ID=${filaId} CODCLI=${codcli} textoBase=${String(textoBase).substring(0, 100)}`);
                
                let isCatalogoPdf = false;
                let catalogoPdfPath = '';
                let catalogoRamo = '';
                
                let finalClientText = textoBase || `Olá ${(nomeCliente || '').trim()}, notamos sua ausência! Que tal conferir as novidades?`;
                if (typeof textoBase === 'string' && textoBase.startsWith('[MEDIA_CATALOGO]')) {
                    isCatalogoPdf = true;
                    // ex: [MEDIA_CATALOGO]/caminho/arquivo.pdf|Ramo|MensagemCustom
                    const parts = textoBase.replace('[MEDIA_CATALOGO]', '').split('|');
                    catalogoPdfPath = parts[0];
                    catalogoRamo = parts[1] || 'Geral';
                    if (parts[2]) {
                        finalClientText = parts[2];
                    } else {
                        finalClientText = `Olá ${(nomeCliente || '').trim()}, confira nosso novo catálogo de produtos da categoria: ${catalogoRamo}!`;
                    }
                    console.log(`[FILA CRON] ✅ Modo Catálogo PDF | Path="${catalogoPdfPath}" | Ramo="${catalogoRamo}" | Msg="${finalClientText.substring(0, 60)}"`);
                } else {
                    finalClientText = String(finalClientText).replace(/¿/g, '\u2705');
                }
                
                const msgClienteTxt = {
                    number: telCliente,
                    text: finalClientText
                };
                const msgClienteVcard = {
                    number: telCliente,
                    contactName: nomeVendedor,
                    contactNumber: telVendedor
                };
                const horaAtual = new Date().getHours();
                let saudacao = 'Bom dia';
                if (horaAtual >= 12 && horaAtual < 18) saudacao = 'Boa tarde';
                else if (horaAtual >= 18) saudacao = 'Boa noite';

                const msgVendedorTxt = {
                    number: telVendedor,
                    text: `${saudacao}! O Cliente *${nomeCliente.trim()}* está recebendo ofertas e pode procurar por nossos produtos! Entre em contato com ele.${listaProdutos}`
                };
                const msgVendedorVcard = {
                    number: telVendedor,
                    contactName: nomeCliente.trim(),
                    contactNumber: telCliente
                };

                const sendEvo = async (type, payload) => {
                    if (payload && payload.number) {
                        payload.number = cacheService.getDestinoFinal(payload.number);
                    }
                    let endpoint = '';
                    let fallbackEndpoint = '';
                    let payloadFallback = null;

                    if (type === 'media') {
                        endpoint = `/message/sendMedia/${instanceName}`;
                        fallbackEndpoint = `/send/media`;
                        let mediaUrlForV2 = payload.mediaUrl || payload.media || '';
                        if (mediaUrlForV2.includes('base64,')) {
                            mediaUrlForV2 = mediaUrlForV2.split('base64,')[1];
                        }
                        if (!mediaUrlForV2.startsWith('http://') && !mediaUrlForV2.startsWith('https://')) {
                            mediaUrlForV2 = mediaUrlForV2.replace(/\s+/g, '');
                        }
                        payloadFallback = {
                            number: payload.number,
                            type: payload.mediatype || 'document',
                            filename: payload.fileName,
                            caption: payload.caption || '',
                            url: mediaUrlForV2
                        };
                    } else if (type === 'text') {
                        endpoint = `/message/sendText/${instanceName}`;
                        fallbackEndpoint = `/send/text`;
                        payloadFallback = {
                            number: payload.number,
                            text: payload.text
                        };
                    } else if (type === 'contact') {
                        endpoint = `/message/sendContact/${instanceName}`;
                        fallbackEndpoint = `/send/text`;
                        payloadFallback = {
                            number: payload.number,
                            text: `👤 Contato: ${payload.contactName}\n📱 WhatsApp: wa.me/${payload.contactNumber}`
                        };
                    }

                    try {
                        let res = await axios.post(`${evoUrl}${endpoint}`, payload, {
                            headers, timeout: 15000, validateStatus: () => true
                        });
                        
                        // Fallback para Evolution V2 (contactMessage array)
                        if (type === 'contact' && res.status >= 400) {
                            console.log(`[FILA CRON] Falha no VCard V1 (${res.status}), tentando V2...`);
                            const payloadV2 = {
                                number: payload.number,
                                contactMessage: [
                                    {
                                        fullName: payload.contactName,
                                        wuid: payload.contactNumber.replace(/[^0-9]/g, ''),
                                        phoneNumber: payload.contactNumber.replace(/[^0-9]/g, '')
                                    }
                                ]
                            };
                            res = await axios.post(`${evoUrl}${endpoint}`, payloadV2, {
                                headers, timeout: 15000, validateStatus: () => true
                            });
                        }

                        // Fallback geral (404 = endpoint não existe, ex. media vs sendMedia)
                        if (res.status === 404 && fallbackEndpoint) {
                            if (type === 'contact') {
                                fallbackEndpoint = `/send/contact`;
                                payloadFallback = {
                                    number: payload.number,
                                    contactName: payload.contactName,
                                    contactPhone: payload.contactNumber
                                };
                            }
                            console.log(`[FILA CRON] Endpoint ${endpoint} não encontrado, tentando fallback V2/GO: ${fallbackEndpoint}`);
                            res = await axios.post(`${evoUrl}${fallbackEndpoint}`, payloadFallback, {
                                headers, timeout: 15000, validateStatus: () => true
                            });
                        }
                        
                        // Se ainda deu erro, fallback para TEXTO se for contato
                        if (type === 'contact' && res.status >= 400) {
                             console.log(`[FILA CRON] Falha no envio de contato nativo, usando texto como fallback...`);
                             const fallbackText = `👤 Contato: ${payload.contactName}\n📱 WhatsApp: wa.me/${payload.contactNumber}`;
                             res = await axios.post(`${evoUrl}/message/sendText/${instanceName}`, {
                                 number: payload.number,
                                 text: fallbackText
                             }, { headers, timeout: 15000, validateStatus: () => true });
                             if (res.status === 404) {
                                res = await axios.post(`${evoUrl}/send/text`, {
                                    number: payload.number,
                                    text: fallbackText
                                }, { headers, timeout: 15000, validateStatus: () => true });
                             }
                        }

                        if (res.status >= 400) {
                            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
                        }
                    } catch (err) {
                        console.error(`[FILA CRON] Erro disparando ${type}:`, err.message);
                        throw new Error(`Erro API Evolution: ${err.message}`);
                    }
                };

                let b64Pdf = null;
                let pdfPublicUrl = null;
                
                if (isCatalogoPdf) {
                    // ENVIAR PDF DE CATÁLOGO AO CLIENTE
                    const fs = require('fs');
                    const path = require('path');
                    console.log(`[FILA CRON] Checando PDF Path: "${catalogoPdfPath}"`);
                    
                    // Tenta o path exato; se falhar e não tiver extensão, tenta com .pdf
                    let resolvedPdfPath = catalogoPdfPath;
                    if (fs.existsSync(catalogoPdfPath)) {
                        console.log(`[FILA CRON] PDF encontrado! Lendo arquivo...`);
                        b64Pdf = fs.readFileSync(catalogoPdfPath, { encoding: 'base64' });
                    } else if (!path.extname(catalogoPdfPath) && fs.existsSync(catalogoPdfPath + '.pdf')) {
                        resolvedPdfPath = catalogoPdfPath + '.pdf';
                        console.log(`[FILA CRON] PDF encontrado com extensão .pdf: "${resolvedPdfPath}". Lendo arquivo...`);
                        b64Pdf = fs.readFileSync(resolvedPdfPath, { encoding: 'base64' });
                    } else {
                        console.log(`[FILA CRON] PDF NÃO encontrado no caminho especificado (nem com extensão .pdf)!`);
                    }

                    // URL pública para V2 fallback: acessível pela Evolution API externamente
                    const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || 'http://backend:3001').replace(/\/$/, '');
                    let pdfBasename = path.basename(resolvedPdfPath);
                    if (!path.extname(pdfBasename)) pdfBasename += '.pdf'; // garante extensão na URL
                    pdfPublicUrl = b64Pdf ? `${backendPublicUrl}/uploads/catalogos/${pdfBasename}` : null;
                    console.log(`[FILA CRON] URL pública do PDF: ${pdfPublicUrl}`);

                    if (b64Pdf) {
                        // Primeiro manda a mensagem de saudação ao cliente
                        await sendEvo('text', {
                            number: telCliente,
                            text: finalClientText
                        });
                        
                        // Depois manda o PDF ao cliente
                        await sendEvo('media', {
                            number: telCliente,
                            mediatype: 'document',
                            mimetype: 'application/pdf',
                            fileName: `Catalogo_${catalogoRamo.trim()}.pdf`,
                            media: b64Pdf,
                            mediaUrl: pdfPublicUrl,
                            caption: ''
                        });
                    } else {
                        // Falhou ler PDF, manda só o texto ao cliente
                        await sendEvo('text', msgClienteTxt);
                    }
                } else if (base64Data) {
                    // Imagem de Reativação com mix de produtos para o cliente
                    await sendEvo('media', {
                        number: telCliente,
                        mediatype: 'image',
                        mimetype: 'image/jpeg',
                        fileName: `Ofertas_${codcli}.jpg`,
                        media: base64Data,
                        caption: msgClienteTxt.text
                    });
                } else {
                    // Só texto para o cliente
                    await sendEvo('text', msgClienteTxt);
                }

                // Enviar o VCard do Vendedor para o cliente
                await sendEvo('contact', msgClienteVcard);
                
                // --- SÓ CHEGA AQUI SE O ENVIO AO CLIENTE FOI BEM SUCEDIDO ---
                // Avisos / Cópia ao vendedor
                if (isCatalogoPdf) {
                    if (telVendedor) {
                        await sendEvo('text', {
                            number: telVendedor,
                            text: `Uma cópia do catálogo (${catalogoRamo}) foi enviada ao cliente *${nomeCliente.trim()}*.`
                        });
                        if (b64Pdf) {
                            await new Promise(r => setTimeout(r, 1000));
                            await sendEvo('media', {
                                number: telVendedor,
                                mediatype: 'document',
                                mimetype: 'application/pdf',
                                fileName: `Catalogo_${catalogoRamo.trim()}.pdf`,
                                media: b64Pdf,
                                mediaUrl: pdfPublicUrl,
                                caption: `Cópia do catálogo de ${catalogoRamo.trim()}`
                            });
                        }
                        await sendEvo('contact', msgVendedorVcard);
                    }
                } else {
                    if (telVendedor) {
                        await sendEvo('text', msgVendedorTxt);
                        await new Promise(r => setTimeout(r, 1000));
                        
                        if (base64Data) {
                            await sendEvo('media', {
                                number: telVendedor,
                                mediatype: 'image',
                                mimetype: 'image/jpeg',
                                fileName: `encarte_vendedor_${Date.now()}.jpg`,
                                caption: '',
                                media: base64Data
                            });
                            await new Promise(r => setTimeout(r, 1000));
                        }

                        await sendEvo('contact', msgVendedorVcard);
                    }
                }

                await connection.execute(`UPDATE CANAL_REATIVACAO_FILA SET STATUS = 'ENVIADO' WHERE ID = :id`, { id: filaId }, { autoCommit: true });
                
                const idMsg = Math.floor(Math.random() * 1000000);
                await connection.execute(`
                    INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
                    VALUES (:id, :cod, :tel, 'OUT', :txt)
                `, {
                    id: idMsg,
                    cod: codusur,
                    tel: telCliente,
                    txt: '[AUTO] Fluxo de Reativação Enviado (via Fila)'
                }, { autoCommit: true });

            } catch (err) {
                console.error(`Erro ao processar fila ID ${filaId}:`, err);
                const erroStr = err.message.substring(0, 4000);
                await connection.execute(`UPDATE CANAL_REATIVACAO_FILA SET STATUS = 'ERRO', LOG_ERRO = :erro WHERE ID = :id`, { erro: erroStr, id: filaId }, { autoCommit: true });
            }

            if (i < result.rows.length - 1) {
                const minDelay = 1000;
                const maxDelay = 237000; // 237 segundos
                const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                console.log(`[FILA CRON] Aguardando ${(randomDelay/1000).toFixed(1)} segundos para o próximo envio...`);
                await new Promise(r => setTimeout(r, randomDelay));
            }
        }
    } catch (err) {
        console.error('Erro na cron de fila:', err);
    } finally {
        isProcessingFila = false;
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

console.log('[CRON] Processador de fila de reativação configurado.');

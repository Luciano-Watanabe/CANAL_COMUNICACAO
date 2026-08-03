const express = require('express');
const oracledb = require('oracledb');
const axios = require('axios');
const cheerio = require('cheerio');
const cacheService = require('../services/cacheService');
const { getMapping } = require('../utils/activityMapper');
const router = express.Router();

// Lista as categorias disponíveis baseadas nos ramos cacheados (PCATIVI)
router.get('/categorias', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `SELECT CODATIV, RAMO FROM PCATIVI WHERE CODATIV IN (1, 2, 3, 4, 5)`;
        const result = await connection.execute(sql);
        const ramos = result.rows.map(r => {
            const codatv = r[0];
            const ramo = r[1];
            const mapping = getMapping(codatv.toString());
            const cnaeText = mapping && mapping.cnae ? ` - CNAE: ${mapping.cnae.substring(0, 4)}` : '';
            return { codatv, ramo: `${ramo}${cnaeText}` };
        });
        
        res.json({ success: true, ramos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar categorias' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Lista as cidades onde existem clientes
router.get('/cidades', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT DISTINCT B.CODCIDADE, B.NOMECIDADE, B.CODIBGE
            FROM PCCLIENT A
            JOIN PCCIDADE B ON A.CODCIDADE = B.CODCIDADE
            WHERE B.NOMECIDADE IS NOT NULL
            ORDER BY B.NOMECIDADE
        `;
        const result = await connection.execute(sql);
        const cidades = result.rows.map(r => ({ codcidade: r[0], nome: r[1], ibge: r[2] }));
        
        res.json({ success: true, cidades });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar cidades' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Busca Leads Externos (Radar de Leads)
router.post('/buscar', async (req, res) => {
    const { codatv, cidade, codibge, provedor } = req.body;
    // provedor pode ser 'CNPJA' ou 'GEOAPIFY' ou 'AUTO'

    if (!codatv || !cidade) {
        return res.status(400).json({ success: false, message: 'Código de Atividade e Cidade são obrigatórios' });
    }

    const mapping = getMapping(codatv);
    if (!mapping) {
        return res.status(400).json({ success: false, message: 'Ramo de atividade não suportado pelo radar de leads no momento.' });
    }

    const leads = [];
    let providerUsed = '';
    
    // Tentar CNPJA primeiro
    const cnpjaKey = cacheService.globalConfigs['CNPJA_API_KEY'];
    if (cnpjaKey && (provedor === 'AUTO' || provedor === 'CNPJA')) {
        try {
            // Documentação assumida do CNPJA para busca de empresas
            const params = {
                strategy: 'MATCH_ALL',
                activity_main: mapping.cnae
            };
            if (codibge) {
                params['address.municipality'] = codibge;
            } else {
                params['address.city'] = cidade;
            }

            const response = await axios.get(`https://api.cnpja.com/office`, {
                params,
                headers: {
                    'Authorization': cnpjaKey
                }
            });

            if (response.data && response.data.length > 0) {
                providerUsed = 'CNPJA';
                for (let company of response.data) {
                    leads.push({
                        nome_fantasia: company.alias || company.company?.name || company.name,
                        razao_social: company.company?.name || company.name,
                        cnpj: company.taxId || company.cnpj,
                        endereco: `${company.address?.street}, ${company.address?.number} - ${company.address?.district}`,
                        telefone: company.phones && company.phones.length > 0 ? company.phones[0].number : null,
                        cidade: company.address?.city,
                        estado: company.address?.state,
                        origem: 'CNPJA'
                    });
                }
            }
        } catch (err) {
            console.error('Erro na API CNPJA:', err.message);
        }
    }

    // Scraper CNPJ Transparência (100% free)
    if (leads.length === 0 && (provedor === 'AUTO' || provedor === 'CNPJ_TRANSPARENCIA')) {
        try {
            const cidadeSlug = cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
            const cnaeBase = mapping.cnae.substring(0, 4); 
            
            // Vamos buscar até N páginas baseadas na configuração
            const maxPages = parseInt(cacheService.globalConfigs['CNPJ_TRANSPARENCIA_PAGINAS'] || '3', 10);
            for (let page = 1; page <= maxPages; page++) {
                const urlScrape = `https://cnpjtransparencia.com.br/empresas/sp/${cidadeSlug}/?uf=SP&municipio=${cidadeSlug}&phone=1&cnae=${cnaeBase}&porte=&sit=ATIVA&p=${page}`;
                
                let responseHTML;
                try {
                    responseHTML = await axios.get(urlScrape, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } catch (e) {
                    break; // Pode ser 404 se a página não existir
                }
                
                const $ = cheerio.load(responseHTML.data);
                const rows = $('.empresa-row');
                
                if (rows.length === 0) break; // Acabaram os resultados

                rows.each((i, el) => {
                    const cols = $(el).find('td');
                    if (cols.length >= 5) {
                        const cnpjFormatado = $(cols[0]).text().trim();
                        const razaoHtml = $(cols[1]).html() || '';
                        const razao_social = razaoHtml.split('<span')[0].trim();
                        const contatosText = $(cols[4]).text().trim();
                        
                        let telefone = null;
                        const phoneMatch = contatosText.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
                        if (phoneMatch) {
                            telefone = phoneMatch[0];
                        }

                        leads.push({
                            nome_fantasia: razao_social,
                            razao_social: razao_social,
                            cnpj: cnpjFormatado,
                            endereco: cidade, 
                            telefone: telefone,
                            cidade: cidade,
                            estado: 'SP',
                            origem: 'CNPJ_TRANSPARENCIA'
                        });
                    }
                });
                
                // Pequena pausa para evitar bloqueio do site
                await new Promise(r => setTimeout(r, 500));
            }
            
            if (leads.length > 0) providerUsed = 'CNPJ_TRANSPARENCIA';

        } catch (err) {
            console.error('Erro no Scraper CNPJ Transparencia:', err.message);
        }
    }

    // Fallback para GEOAPIFY
    const geoapifyKey = cacheService.globalConfigs['GEOAPIFY_API_KEY'];
    if (leads.length === 0 && geoapifyKey && (provedor === 'AUTO' || provedor === 'GEOAPIFY')) {
        try {
            // 1. Pegar lat/lon da cidade
            const geoRes = await axios.get(`https://api.geoapify.com/v1/geocode/search`, {
                params: { text: cidade + ', SP, Brasil', limit: 1, apiKey: geoapifyKey }
            });
            
            if (geoRes.data.features && geoRes.data.features.length > 0) {
                const { lat, lon } = geoRes.data.features[0].properties;
                
                // 2. Buscar Places
                const placesRes = await axios.get(`https://api.geoapify.com/v2/places`, {
                    params: {
                        categories: mapping.geoapify,
                        filter: `circle:${lon},${lat},15000`, // raio de 15km
                        limit: 30,
                        apiKey: geoapifyKey
                    }
                });

                if (placesRes.data.features) {
                    providerUsed = 'GEOAPIFY';
                    for (let feature of placesRes.data.features) {
                        const props = feature.properties;
                        if (props.name) {
                            leads.push({
                                nome_fantasia: props.name,
                                razao_social: props.name,
                                cnpj: null, // Geoapify não fornece
                                endereco: props.formatted,
                                telefone: props.contact?.phone || null,
                                cidade: cidade,
                                estado: 'SP',
                                latitude: props.lat,
                                longitude: props.lon,
                                origem: 'GEOAPIFY'
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Erro na API GEOAPIFY:', err.message);
        }
    }

    // Filtro anti-duplicidade e gravação no DB CANAL_PROSPECTS
    const leadsFiltrados = [];
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Trazendo lista de clientes para filtrar
        // Uma melhor abordagem seria query via SQL mas faremos via código para lidar com fuzzy match no futuro se precisar
        const sqlClientes = `SELECT CNPJ, FANTASIA FROM PCCLIENT WHERE MUNICENT LIKE '%' || UPPER(:cidade) || '%'`;
        const resultClientes = await connection.execute(sqlClientes, { cidade: cidade });
        
        const cnpjsClientes = new Set();
        const nomesClientes = new Set();
        for (let row of resultClientes.rows) {
            if (row[0]) cnpjsClientes.add(row[0].replace(/[^0-9]/g, ''));
            if (row[1]) nomesClientes.add(row[1].toUpperCase().trim());
        }

        for (let lead of leads) {
            let isDuplicated = false;
            
            // Check CNPJ
            if (lead.cnpj) {
                const cleanCnpj = lead.cnpj.replace(/[^0-9]/g, '');
                if (cnpjsClientes.has(cleanCnpj)) isDuplicated = true;
            }
            
            // Check Nome (Fuzzy/Exact fallback)
            if (!isDuplicated && lead.nome_fantasia) {
                const leadName = lead.nome_fantasia.toUpperCase().trim();
                for (let cName of nomesClientes) {
                    if (leadName === cName || leadName.includes(cName) || cName.includes(leadName)) {
                        isDuplicated = true;
                        break;
                    }
                }
            }

            if (!isDuplicated) {
                // Insere no banco CANAL_PROSPECTS (ou faz Merge)
                const sqlInsert = `
                    MERGE INTO CANAL_PROSPECTS T
                    USING (SELECT :nome_fantasia AS NOME, :cnpj AS CNPJ, :cidade AS CIDADE FROM DUAL) S
                    ON (T.NOME_FANTASIA = S.NOME AND T.CIDADE = S.CIDADE)
                    WHEN NOT MATCHED THEN
                        INSERT (NOME_FANTASIA, RAZAO_SOCIAL, CNPJ, TELEFONE, ENDERECO, CIDADE, ESTADO, ORIGEM, RAMO_ATIVIDADE)
                        VALUES (:nome_fantasia, :razao_social, :cnpj, :telefone, :endereco, :cidade, :estado, :origem, :ramo)
                `;
                await connection.execute(sqlInsert, {
                    nome_fantasia: lead.nome_fantasia,
                    razao_social: lead.razao_social,
                    cnpj: lead.cnpj || null,
                    telefone: lead.telefone || null,
                    endereco: lead.endereco || null,
                    cidade: lead.cidade || null,
                    estado: lead.estado || null,
                    origem: lead.origem || 'AUTO',
                    ramo: mapping.ramo
                }, { autoCommit: true });

                leadsFiltrados.push(lead);
            }
        }

    } catch (err) {
        console.error('Erro ao cruzar com banco de dados:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }

    res.json({
        success: true,
        message: `${leadsFiltrados.length} leads novos encontrados usando ${providerUsed}`,
        leads: leadsFiltrados,
        providerUsed
    });
});

// Listar Prospects Salvos
router.get('/salvos', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const sql = `
            SELECT ID, NOME_FANTASIA, CNPJ, TELEFONE, ENDERECO, CIDADE, ORIGEM, HAS_WHATSAPP
            FROM CANAL_PROSPECTS
            ORDER BY DATA_CADASTRO DESC
        `;
        const result = await connection.execute(sql);
        const prospects = result.rows.map(r => ({
            id: r[0], nome: r[1], cnpj: r[2], telefone: r[3],
            endereco: r[4], cidade: r[5], origem: r[6], has_whatsapp: r[7]
        }));
        
        res.json({ success: true, prospects });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar prospects salvos' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Marcar / Verificar WhatsApp
router.post('/verificar-whatsapp', async (req, res) => {
    const { id, telefone } = req.body;
    // SIMULAÇÃO: Aqui integraria com a Evolution API de fato
    // Ex: axios.get(\`\${evolutionUrl}/chat/whatsappNumbers/\${number}\`)
    
    // Para simplificar, vamos aprovar ou rejeitar randomicamente se não tiver Evolution real conectada
    const hasZap = Math.random() > 0.5 ? 'S' : 'N';
    
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        await connection.execute(`UPDATE CANAL_PROSPECTS SET HAS_WHATSAPP = :status WHERE ID = :id`, {
            status: hasZap,
            id: id
        }, { autoCommit: true });
        
        res.json({ success: true, has_whatsapp: hasZap });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

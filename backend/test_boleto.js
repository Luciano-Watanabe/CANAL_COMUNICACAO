const oracledb = require('oracledb');
const fs = require('fs');
const { boleto } = require('gerador-boletos');
const { Boleto, bancos, Datas, Pagador, Beneficiario, Endereco } = boleto;

async function testOracle() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER || 'MERCADO',
            password: process.env.ORACLE_PASSWORD || 'MERCADO',
            connectString: process.env.ORACLE_CONN_STRING || '192.168.10.150:1521/WINT'
        });
        
        let res = await conn.execute(`
            SELECT P.VALOR, P.DTVENC, P.DTEMISSAO, P.NOSSONUMBCO, P.LINHADIG, P.CODBARRA, P.CODBANCO,
                   B.AGENCIA, B.CONTA, B.NUMCARTEIRA, B.NUMCONVENIO
            FROM PCPREST P
            LEFT JOIN PCBANCO B ON P.CODBANCO = B.CODBANCO
            WHERE P.DUPLIC = 98830 AND P.DTBAIXA IS NULL
            FETCH FIRST 1 ROWS ONLY
        `);
        
        if (res.rows.length === 0) return;
        const [valor, dtVenc, dtEmissao, nossoNum, linhaDig, codBarra, codBanco, agencia, conta, carteira, convenio] = res.rows[0];
        
        console.log({ valor, dtVenc, dtEmissao, nossoNum, linhaDig, codBarra, codBanco, agencia, conta, carteira });

        // Clean nosso numero (removes digits if any)
        let nn = nossoNum ? nossoNum.replace(/[^0-9]/g, '') : '';
        // Often nossoNumero has digit. E.g. "00819566-8". The base is "00819566" and digit "8".
        let nnBase = nn.substring(0, nn.length - 1);
        let nnDigito = nn.substring(nn.length - 1);

        const pagador = Pagador.novoPagador()
            .comNome('Cliente Ficticio')
            .comRegistroNacional('11122233344');
            
        const beneficiario = Beneficiario.novoBeneficiario()
            .comNome('Minha Empresa')
            .comRegistroNacional('43576788000191')
            .comCarteira(carteira || '109')
            .comAgencia(agencia || '0101')
            .comConta(conta || '12345')
            .comNossoNumero(nnBase || '1234567')
            .comDigitoNossoNumero(nnDigito || '8');
            
        let BClass = bancos.Itau;
        if (codBanco === 237) BClass = bancos.Bradesco;
        // else ...

        const meuBoleto = Boleto.novoBoleto()
            .comDatas(Datas.novasDatas().comVencimento(dtVenc.getUTCDate(), dtVenc.getUTCMonth()+1, dtVenc.getUTCFullYear())
                                        .comProcessamento(dtEmissao.getUTCDate(), dtEmissao.getUTCMonth()+1, dtEmissao.getUTCFullYear())
                                        .comDocumento(dtEmissao.getUTCDate(), dtEmissao.getUTCMonth()+1, dtEmissao.getUTCFullYear()))
            .comBeneficiario(beneficiario)
            .comPagador(pagador)
            .comBanco(new BClass())
            .comValorBoleto(valor)
            .comNumeroDoDocumento('98830')
            .comEspecieDocumento('DM');
            
        console.log('Cod Barra Oracle:', codBarra);
        console.log('Linha Dig Oracle:', linhaDig);
        
        const { Gerador } = boleto;
        const g = new Gerador(meuBoleto);
        g.gerarPDF({
            stream: fs.createWriteStream('./temp_oracle.pdf')
        }, (err, pdf) => {
            if(err) console.error(err);
            console.log('PDF gerado.');
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) {}
        }
    }
}
testOracle();

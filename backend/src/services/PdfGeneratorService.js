const { DANFe } = require('node-sped-pdf');
const fs = require('fs');
const path = require('path');
const { boleto } = require('gerador-boletos');
const { Itau } = require('gerador-boletos/src/bancos/itau'); // usually it's in bancos directory
const QRCode = require('qrcode');

class PdfGeneratorService {
    
    /**
     * Gera o PDF da DANFE baseado na string XML
     * @param {string} xmlString 
     * @returns {Promise<string>} Base64 do PDF gerado
     */
    static async gerarDanfe(xmlString) {
        try {
            // node-sped-pdf converte XML de NFe/NFCe para PDF
            // A função DANFe retorna uma promise com o ArrayBuffer/Uint8Array do PDF
            const pdfBuffer = await DANFe({ 
                xml: xmlString 
            });
            
            return Buffer.from(pdfBuffer).toString('base64');
        } catch (error) {
            console.error('[PdfGeneratorService] Erro ao gerar DANFE:', error);
            throw error;
        }
    }

    /**
     * Gera o PDF do Boleto
     * @param {Object} dadosBoleto 
     * @returns {Promise<string>} Base64 do PDF gerado
     */
    static async gerarBoleto(dadosBoleto) {
        try {
            const { boleto } = require('gerador-boletos');
            const { Boleto, bancos, Datas, Pagador, Beneficiario, Endereco } = boleto;
            
            const {
                valor,
                dataVencimento,
                dataEmissao,
                nossoNumero,
                linhaDigitavel, // used if we wanted to render, but gerador handles it based on data
                codigoBarras,
                banco, // ex: 341 para Itau, 237 para Bradesco, etc
                numnota,
                razao,
                cgc,
                carteira,
                agencia,
                conta
            } = dadosBoleto;

            // Limpeza do Nosso Numero
            let nn = nossoNumero ? nossoNumero.replace(/[^0-9]/g, '') : '';
            let nnBase = nn.substring(0, nn.length - 1) || '0000000';
            let nnDigito = nn.substring(nn.length - 1) || '0';
            
            // Dados ficticios ou vazios se nao disponivel
            const carteiraStr = carteira ? carteira.toString() : '109';
            const agenciaStr = agencia ? agencia.toString() : '0101';
            const contaStr = conta ? conta.toString() : '12345';
            
            const dtVenc = new Date(dataVencimento || new Date());
            const dtEmissao = new Date(dataEmissao || new Date());

            const pagador = Pagador.novoPagador()
                .comNome(razao || 'Cliente')
                .comRegistroNacional(cgc || '00000000000');
                
            const beneficiario = Beneficiario.novoBeneficiario()
                .comNome('Nossa Empresa')
                .comRegistroNacional('00000000000000') // CNPJ da sua empresa
                .comCarteira(carteiraStr)
                .comAgencia(agenciaStr)
                .comConta(contaStr)
                .comNossoNumero(nnBase)
                .comDigitoNossoNumero(nnDigito);
                
            let BClass = bancos.Itau;
            if (banco === 237) BClass = bancos.Bradesco;
            else if (banco === 104) BClass = bancos.Caixa;
            
            const meuBoleto = Boleto.novoBoleto()
                .comDatas(Datas.novasDatas()
                    .comVencimento(dtVenc.getUTCDate(), dtVenc.getUTCMonth() + 1, dtVenc.getUTCFullYear())
                    .comProcessamento(dtEmissao.getUTCDate(), dtEmissao.getUTCMonth() + 1, dtEmissao.getUTCFullYear())
                    .comDocumento(dtEmissao.getUTCDate(), dtEmissao.getUTCMonth() + 1, dtEmissao.getUTCFullYear())
                )
                .comBeneficiario(beneficiario)
                .comPagador(pagador)
                .comBanco(new BClass())
                .comValorBoleto(valor || 0)
                .comNumeroDoDocumento(numnota ? numnota.toString() : '0000')
                .comEspecieDocumento('DM');
                
            const { Gerador } = boleto;
            const gerador = new Gerador(meuBoleto);
            
            // Buffer the PDF
            return new Promise((resolve, reject) => {
                const chunks = [];
                const stream = new require('stream').Writable({
                    write(chunk, encoding, callback) {
                        chunks.push(chunk);
                        callback();
                    }
                });
                
                stream.on('finish', () => {
                    const buffer = Buffer.concat(chunks);
                    resolve(buffer.toString('base64'));
                });
                stream.on('error', reject);
                
                gerador.gerarPDF({ stream }, (err) => {
                    if (err) return reject(err);
                });
            });
        } catch (error) {
            console.error('[PdfGeneratorService] Erro ao gerar Boleto:', error);
            throw error;
        }
    }
}

module.exports = PdfGeneratorService;

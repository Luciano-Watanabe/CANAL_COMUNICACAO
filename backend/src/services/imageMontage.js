const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

async function createMontage(products) {
    if (!products || products.length === 0) return null;

    const width = 800;
    const headerHeight = 140;
    const itemHeight = 180;
    const padding = 20;
    const height = headerHeight + (products.length * (itemHeight + padding)) + padding;

    // Fundo Amarelo (Estilo Encarte Promocional)
    const image = new Jimp(width, height, '#fef08a');

    // Fonts
    const font32White = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const font16White = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const font32Black = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const font16Black = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Cabeçalho Vermelho (Estilo Supermercado)
    const headerBg = new Jimp(width, headerHeight, '#ef4444');
    
    // Faixa amarela forte na base do cabeçalho
    const yellowStripe = new Jimp(width, 10, '#facc15');
    headerBg.composite(yellowStripe, 0, headerHeight - 10);
    
    image.composite(headerBg, 0, 0);

    // Load Logo com uma caixinha branca para destacar no vermelho
    let logoWidth = 0;
    try {
        const logo = await Jimp.read('/app/logo-ag.png');
        logo.scaleToFit(200, 80);
        
        // Fundo branco arredondado/simples pro logo
        const logoBox = new Jimp(logo.bitmap.width + 20, logo.bitmap.height + 20, '#ffffff');
        logoBox.composite(logo, 10, 10);
        
        const logoY = (headerHeight - logoBox.bitmap.height) / 2 - 5;
        image.composite(logoBox, padding + 10, logoY);
        logoWidth = logoBox.bitmap.width;
    } catch (e) {
        console.error('Logo não encontrado', e);
    }

    // Títulos promocionais no cabeçalho
    const textStartX = padding + logoWidth + 40;
    image.print(font32White, textStartX, 35, 'OFERTAS DO SEU PEDIDO!');
    image.print(font16White, textStartX, 80, 'CONFIRA OS PRECOS ATUALIZADOS');

    let currentY = headerHeight + padding;

    for (const prod of products) {
        // Cartão do produto (Branco)
        const card = new Jimp(width - (padding * 2), itemHeight, '#ffffff');

        // Draw image
        let prodImg = null;
        let imagePath = prod.imagePath || (prod.codprod ? `/app/imagens_produtos/${prod.codprod}.jpg` : null);
        
        if (imagePath && fs.existsSync(imagePath)) {
            try {
                prodImg = await Jimp.read(imagePath);
                prodImg.scaleToFit(150, 150);
                
                const imgX = 15 + (150 - prodImg.bitmap.width) / 2;
                const imgY = 15 + (150 - prodImg.bitmap.height) / 2;
                card.composite(prodImg, imgX, imgY);
            } catch(e) {}
        }
        
        // Placeholder se a imagem não existir
        if (!prodImg) {
            const placeholder = new Jimp(150, 150, '#e2e8f0');
            try {
                const fadeLogo = await Jimp.read('/app/logo-ag.png');
                fadeLogo.resize(100, Jimp.AUTO);
                fadeLogo.opacity(0.2); 
                const imgX = (150 - fadeLogo.bitmap.width) / 2;
                const imgY = (150 - fadeLogo.bitmap.height) / 2;
                placeholder.composite(fadeLogo, imgX, imgY);
            } catch(e) {}
            card.composite(placeholder, 15, 15);
        }

        // Textos do Produto
        const textX = 180;
        let title = (prod.title || '').toUpperCase(); // Maiúsculo de encarte
        if (title.length > 45) title = title.substring(0, 42) + '...';
        card.print(font16Black, textX, 20, title);

        // Parse do texto para formato supermercado
        let textToPrint = prod.text || '';
        let hasSplash = !!prod.splashText;
        
        // Limpa o X se for 'Só Produtos'
        if (/^\d+(\.\d+)?x$/.test(textToPrint.trim())) {
            let qty = textToPrint.replace('x', '');
            if (hasSplash) {
                card.print(font16Black, textX, 65, `Quantidade: ${qty}`);
            } else {
                card.print(font32Black, textX, 80, `Qtd: ${qty}`);
            }
        } else if (textToPrint.includes('-')) {
            // Se for com preço (ex: "6x - R$ 10,00 un")
            const parts = textToPrint.split('-');
            const qty = parts[0].trim(); // "6x"
            let price = parts[1].trim(); // "R$ 10,00 un"
            
            // Qtd Menor
            card.print(font16Black, textX, 65, `Quantidade: ${qty}`);
            
            if (!hasSplash) {
                // Etiqueta de Preço Vermelha!! (Supermercado)
                const priceTag = new Jimp(300, 50, '#ef4444');
                priceTag.print(font32White, 15, 10, price);
                card.composite(priceTag, textX, 90);
            }
        } else {
            // Fallback genérico
            card.print(font32Black, textX, 80, textToPrint);
        }

        // Desenhar splash (serve tanto para "Só Produtos" quanto "Com Preço")
        if (hasSplash) {
            try {
                const splashTextWidth = Jimp.measureText(font32Black, prod.splashText);
                const badgeWidth = Math.max(260, splashTextWidth + 60); // Ajusta o tamanho da imagem de acordo com o texto
                const badgeHeight = 90;
                const badge = await Jimp.read('/app/splash.png');
                badge.resize(badgeWidth, badgeHeight); // Force resize to stretch it oval
                
                const splashTextX = (badge.bitmap.width - splashTextWidth) / 2;
                const splashTextY = (badge.bitmap.height / 2) - 10; 
                
                badge.print(font32Black, splashTextX, splashTextY, prod.splashText);
                card.composite(badge, textX, 85);
            } catch (e) {
                console.error('Erro ao colocar splash de oferta:', e);
            }
        }
        // Borda sutil no cartão
        for (let x = 0; x < card.bitmap.width; x++) {
            card.setPixelColor(Jimp.cssColorToHex('#cbd5e1'), x, card.bitmap.height - 1);
        }

        image.composite(card, padding, currentY);
        currentY += itemHeight + padding;
    }

    // Save as JPEG base64
    const buffer = await image.quality(90).getBufferAsync(Jimp.MIME_JPEG);
    return buffer.toString('base64');
}

module.exports = { createMontage };

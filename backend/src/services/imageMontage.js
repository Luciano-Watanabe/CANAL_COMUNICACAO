const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

async function createMontage(products) {
    if (!products || products.length === 0) return null;

    const width = 1080;
    const padding = 20;
    const cols = 2;
    const cardWidth = (width - (padding * (cols + 1))) / cols; // (1080 - 60) / 2 = 510
    const cardHeight = 200; // Cartão horizontal
    const imgBoxSize = 180;
    
    const rows = Math.ceil(products.length / cols);
    const headerHeight = 200;
    const height = headerHeight + (rows * (cardHeight + padding)) + padding;

    // Fundo Branco para os produtos
    const image = new Jimp(width, height, '#ffffff');

    // Fonts
    const font32Black = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const font16Black = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const font32White = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

    // Cabeçalho (Estilo Flyer de Mercado)
    const headerBg = new Jimp(width, headerHeight, '#ef4444');
    const yellowStripe = new Jimp(width, 10, '#facc15');
    headerBg.composite(yellowStripe, 0, headerHeight - 10);
    image.composite(headerBg, 0, 0);

    let logoHeight = 0;
    try {
        const logo = await Jimp.read('/app/logo-ag.png');
        logo.scaleToFit(200, 70);
        
        const logoBox = new Jimp(logo.bitmap.width + 30, logo.bitmap.height + 30, '#ffffff');
        logoBox.composite(logo, 15, 15);

        const logoX = (width - logoBox.bitmap.width) / 2;
        image.composite(logoBox, logoX, 30);
        logoHeight = logoBox.bitmap.height;
    } catch(e) {}

    const textStr = "CATÁLOGO DE OFERTAS";
    const textWidth = Jimp.measureText(font32White, textStr);
    image.print(font32White, (width - textWidth) / 2, 30 + (logoHeight || 70) + 20, textStr);

    let currentY = headerHeight;

    for (let i = 0; i < products.length; i++) {
        const prod = products[i];
        const col = i % cols;
        const row = Math.floor(i / cols);

        // Cartão do produto (Fundo cinza claro)
        const card = new Jimp(cardWidth, cardHeight, '#f8fafc');

        // Borda do card
        for (let x = 0; x < cardWidth; x++) {
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), x, 0);
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), x, cardHeight - 1);
        }
        for (let y = 0; y < cardHeight; y++) {
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), 0, y);
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), cardWidth - 1, y);
        }

        // Caixa de imagem branca com borda (Alinhada à esquerda do card)
        const imgBox = new Jimp(imgBoxSize, imgBoxSize, '#ffffff');
        for (let x = 0; x < imgBoxSize; x++) {
            imgBox.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), x, 0);
            imgBox.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), x, imgBoxSize - 1);
        }
        for (let y = 0; y < imgBoxSize; y++) {
            imgBox.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), 0, y);
            imgBox.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), imgBoxSize - 1, y);
        }

        let prodImg = null;
        let imagePath = prod.imagePath || (prod.codprod ? `/app/imagens_produtos/${prod.codprod}.jpg` : null);
        
        if (imagePath && fs.existsSync(imagePath)) {
            try {
                prodImg = await Jimp.read(imagePath);
                prodImg.scaleToFit(imgBoxSize - 20, imgBoxSize - 20);
                const imgX = 10 + (imgBoxSize - 20 - prodImg.bitmap.width) / 2;
                const imgY = 10 + (imgBoxSize - 20 - prodImg.bitmap.height) / 2;
                imgBox.composite(prodImg, imgX, imgY);
            } catch(e) {}
        }
        
        if (!prodImg) {
            try {
                const fadeLogo = await Jimp.read('/app/logo-ag.png');
                fadeLogo.resize(100, Jimp.AUTO);
                fadeLogo.opacity(0.2); 
                const imgX = (imgBoxSize - fadeLogo.bitmap.width) / 2;
                const imgY = (imgBoxSize - fadeLogo.bitmap.height) / 2;
                imgBox.composite(fadeLogo, imgX, imgY);
            } catch(e) {}
        }

        // Posiciona imgBox à esquerda
        card.composite(imgBox, 10, 10);

        // Textos à direita da imagem
        const textStartX = 10 + imgBoxSize + 15;
        const textMaxWidth = cardWidth - textStartX - 10;
        
        // Código
        card.print(font16Black, textStartX, 15, `Cod: ${prod.codprod}`);

        // Título (com text wrap simples limitando width)
        let title = (prod.title || '').toUpperCase();
        card.print(font16Black, textStartX, 40, {
            text: title,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_TOP
        }, textMaxWidth, 80);

        // Preço se existir (em text)
        if (prod.text) {
            let priceText = prod.text;
            if (/^\d+(\.\d+)?x$/.test(priceText.trim())) {
                priceText = `Qtd: ${priceText.replace('x', '')}`;
            } else if (priceText.includes('-')) {
                const parts = priceText.split('-');
                priceText = `${parts[1].trim()} (Qtd: ${parts[0].trim()})`;
            }
            card.print(font32Black, textStartX, 130, priceText);
        }

        const xPos = padding + (col * (cardWidth + padding));
        const yPos = headerHeight + (row * (cardHeight + padding));
        image.composite(card, xPos, yPos);
    }

    // Save as JPEG base64
    const buffer = await image.quality(90).getBufferAsync(Jimp.MIME_JPEG);
    return buffer.toString('base64');
}

module.exports = { createMontage };

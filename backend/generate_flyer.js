const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

async function createFlyer(products) {
    const width = 800;
    const headerHeight = 120;
    const itemHeight = 180;
    const padding = 20;
    const height = headerHeight + (products.length * (itemHeight + padding)) + padding;

    // Background
    const image = new Jimp(width, height, '#f0f2f5'); // cor de fundo do whatsapp

    // Fonts
    const font32White = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const font32Black = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const font16Black = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Header Background
    const headerBg = new Jimp(width, headerHeight, '#0f172a');
    image.composite(headerBg, 0, 0);

    // Load Logo
    let logoWidth = 0;
    try {
        const logo = await Jimp.read('/app/logo-ag.png');
        logo.resize(Jimp.AUTO, 80);
        image.composite(logo, padding, 20);
        logoWidth = logo.bitmap.width;
    } catch (e) {
        console.error('Logo não encontrado', e);
    }

    // Header Title
    image.print(font32White, padding + logoWidth + 30, 45, 'SUA ÚLTIMA COMPRA');

    let currentY = headerHeight + padding;

    for (const prod of products) {
        // Card Background
        const card = new Jimp(width - (padding * 2), itemHeight, '#ffffff');

        // Draw image
        let prodImg = null;
        if (prod.imagePath && fs.existsSync(prod.imagePath)) {
            try {
                prodImg = await Jimp.read(prod.imagePath);
                // Calcula redimensionamento mantendo proporção num quadrado de 150x150
                prodImg.scaleToFit(150, 150);
                
                // Centraliza a imagem no quadrado de 150x150
                const imgX = 15 + (150 - prodImg.bitmap.width) / 2;
                const imgY = 15 + (150 - prodImg.bitmap.height) / 2;
                card.composite(prodImg, imgX, imgY);
            } catch(e) {}
        }
        
        if (!prodImg) {
            const placeholder = new Jimp(150, 150, '#e2e8f0');
            card.composite(placeholder, 15, 15);
        }

        // Dividers & Text
        const textX = 180;
        
        // Title (Wrap text simple simulation if it's too long)
        let title = prod.title;
        if (title.length > 50) title = title.substring(0, 47) + '...';
        card.print(font16Black, textX, 20, title);

        // Prices
        card.print(font16Black, textX, 60, `De: R$ ${prod.oldPrice}`);
        card.print(font32Black, textX, 90, `Por: R$ ${prod.newPrice}`);
        
        if (prod.discount) {
            // Draw a fake badge for discount
            const badge = new Jimp(150, 30, '#10b981'); // Emerald green
            badge.print(font16Black, 10, 8, `ECONOMIA R$ ${prod.discount}`);
            card.composite(badge, textX, 135);
        }

        // Draw subtle border around card
        for (let x = 0; x < card.bitmap.width; x++) {
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), x, 0);
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), x, card.bitmap.height - 1);
        }
        for (let y = 0; y < card.bitmap.height; y++) {
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), 0, y);
            card.setPixelColor(Jimp.cssColorToHex('#e2e8f0'), card.bitmap.width - 1, y);
        }

        image.composite(card, padding, currentY);
        currentY += itemHeight + padding;
    }

    const outPath = path.join(__dirname, 'flyer.jpg');
    // Save as high quality JPEG
    await image.quality(90).writeAsync(outPath);
    console.log('Flyer gerado em', outPath);
}

const products = [
    { title: '6x EXTRATO TOMATE GOURMET BONARE BAG1,7/CX6', oldPrice: '24,99', newPrice: '23,99', discount: '1,00', imagePath: '/app/imagens_produtos/7358.jpg' },
    { title: '4.32x SALAME ITALIANO AURORA PC 750GR/CX7PCS', oldPrice: '86,91', newPrice: '84,50', discount: '2,41', imagePath: '/app/imagens_produtos/5637.jpg' },
    { title: '2x ALCAPARRAS SAFRA REAL BD2KG CX4', oldPrice: '99,50', newPrice: '99,50', discount: null, imagePath: '/app/imagens_produtos/10120.jpg' },
    { title: '2x MANTEIGA BLOCO S/SAL PAIOL CX 5 KG', oldPrice: '220,00', newPrice: '185,00', discount: '35,00', imagePath: '/app/imagens_produtos/5516.jpg' },
    { title: '8.84x QUEIJO PROVOLONE SIMPLES PAIOL PC 4,5 KG', oldPrice: '58,90', newPrice: '57,49', discount: '1,41', imagePath: '/app/imagens_produtos/6191.jpg' },
    { title: '4x AZEITO VERDE C/CAR BOM JESUS BD 2 KG FD4', oldPrice: '63,90', newPrice: '58,90', discount: '5,00', imagePath: '/app/imagens_produtos/6656.jpg' }
];

createFlyer(products);

const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? 
            walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const replaceConfig = (filePath) => {
    if (!filePath.endsWith('.js')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Replace E.CODFILIAL = '1' -> E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}'
    // Sometimes it's without spaces or with double quotes.
    if (content.includes("E.CODFILIAL = '1'")) {
        content = content.replace(/E\.CODFILIAL = '1'/g, "E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}'");
        changed = true;
    }

    // Replace PR.NUMREGIAO = 1 -> PR.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}
    if (content.includes("PR.NUMREGIAO = 1")) {
        content = content.replace(/PR\.NUMREGIAO = 1/g, "PR.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}");
        changed = true;
    }
    
    // Replace TAB.NUMREGIAO = 1
    if (content.includes("TAB.NUMREGIAO = 1")) {
        content = content.replace(/TAB\.NUMREGIAO = 1/g, "TAB.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}");
        changed = true;
    }

    // Also handle cases like: SELECT 1 FROM PCEST E WHERE E.CODPROD = A.CODPROD AND E.QTESTGER > 0
    // To: SELECT 1 FROM PCEST E WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' AND E.QTESTGER > 0
    if (content.includes("AND E.QTESTGER > 0") && !content.includes("E.CODFILIAL")) {
        content = content.replace(/AND E\.QTESTGER > 0/g, "AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' AND E.QTESTGER > 0");
        changed = true;
    }
    
    // Also handle SELECT 1 FROM PCEST E in routes/clientes.js, VendedorBotService.js which might just be:
    // SELECT 1 FROM PCEST E WHERE E.CODPROD = P.CODPROD AND E.QTESTGER > 0 (handled above)

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
};

walkDir('/opt/CANAL_COMUNICACAO_HOMOLOGACAO/backend/src', replaceConfig);
console.log('Done!');

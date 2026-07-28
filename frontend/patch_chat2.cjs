const fs = require('fs');
const file = 'src/pages/Chat.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldCode = `            // Contato Principal
            if (c.telefone) {`;

const newCode = `            // Contato Principal
            if (c.telefone && c.telefone.trim().length >= 10) {`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(file, content);
console.log("Frontend alterado");

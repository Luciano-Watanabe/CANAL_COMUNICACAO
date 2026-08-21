const fs = require('fs');
const path = '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/backend/src/services/SacBotService.js';
let content = fs.readFileSync(path, 'utf8');

// The standard return phrase requested by the user
const returnMsg = 'Para retornar ao menu anterior, use VOLTAR.\\nPara finalizar o atendimento use 0.';
const returnMsgEscaped = 'Para retornar ao menu anterior, use VOLTAR.\\nPara finalizar o atendimento use 0.';

content = content.replace(/Digite 0 para voltar ao menu\./g, returnMsg);
content = content.replace(/Digite 0 para voltar ao menu principal\./g, returnMsg);
content = content.replace(/ou 0 para voltar\./g, `ou VOLTAR.`);
content = content.replace(/ou digite 0 para voltar\./g, `ou digite VOLTAR.`);
content = content.replace(/Digite 0 para voltar\./g, returnMsg);
content = content.replace(/ou digite 0 para voltar ao menu principal\./g, `ou digite VOLTAR.`);
content = content.replace(/Digite apenas números, ou 0 para voltar\./g, `Digite apenas números, ou VOLTAR.`);

fs.writeFileSync(path, content, 'utf8');
console.log('Replaced successfully');

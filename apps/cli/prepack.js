const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
    if (!fs.existsSync(from)) return;
    if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        if (fs.lstatSync(fromPath).isFile()) {
            fs.copyFileSync(fromPath, toPath);
        } else {
            copyFolderSync(fromPath, toPath);
        }
    });
}

console.log('📦 [Prepack] Copiando arquivos estáticos do Dashboard...');
copyFolderSync(path.resolve(__dirname, '../dashboard/dist'), path.resolve(__dirname, 'dashboard-dist'));

console.log('📦 [Prepack] Copiando módulos transpilados do Agente...');
copyFolderSync(path.resolve(__dirname, '../../packages/agent/dist'), path.resolve(__dirname, 'agent'));

console.log('✅ [Prepack] CLI pronta para ser enviada para a nuvem!');

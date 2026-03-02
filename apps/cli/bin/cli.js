#!/usr/bin/env node
const express = require('express');
const { startAgent } = require('@my-infra/agent');
const path = require('path');

// 1. Inicia o Hardware do Agente silenciosamente
console.log('📡 [Telemetry] Iniciando sensores de Hardware locais...');
console.log('   -> HTTP/REST (Porta 9090)');
console.log('   -> UDP/SNMP  (Porta 1611)');
startAgent({ port: 9090 });

// 2. Levanta o Servidor de Arquivos Estáticos para o Dashboard React Minificado
const app = express();
const PORT = 3000;

// Resolvemos o caminho relativo ao instalar de dentro da node_modules
// A pasta dist do dashboard precisa ser empacotada junto com o monorepo ou lida globalmente
// Neste escopo do NPM Workspaces, apontamos para a pasta "apps/dashboard/dist"
const distPath = path.resolve(__dirname, '../../dashboard/dist');

app.use(express.static(distPath));

// Fallback de SPA do React-Router
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`\n🚀 [Dashboard] UI pronta e servida na porta ${PORT}!`);
    console.log(`Acesse: http://localhost:${PORT}`);

    // 3. Abre o Browser do Usuário Automaticamente
    try {
        const open = (await import('open')).default;
        await open(`http://localhost:${PORT}`);
    } catch (e) {
        console.log('Navegador não pôde ser aberto automaticamente. Clique no link acima.');
    }
});

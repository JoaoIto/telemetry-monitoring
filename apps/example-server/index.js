const express = require('express');
const { startAgent } = require('@my-infra/agent');

const app = express();

startAgent({ port: 9090 });

app.get('/', (req, res) => {
    res.send('Servidor rodando e sendo monitorado silenciosamente!');
});

app.get('/heavy-task', (req, res) => {
    let i = 0;
    while (i < 1000000000) { i++; }
    res.send('Tarefa Pesada Finalizada!');
});

app.listen(3000, () => console.log('Servidor HTTP rodando na 3000'));

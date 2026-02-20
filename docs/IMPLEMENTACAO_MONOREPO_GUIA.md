# Guia de Implementação: Infraestrutura de Telemetria (Stack JS/TS)

Este documento detalha o passo a passo técnico para construir a biblioteca de telemetria (`@my-infra/agent`) e o respectivo sistema de monitoramento (`dashboard`). A solução será construída do zero, sendo altamente escalável, reaproveitável e seguindo os padrões do ecossistema Node.js.

## 1. Arquitetura do Sistema (Monorepo Workspace)

A base do projeto será um Monorepo gerenciado via NPM Workspaces. Isso permite que você desenvolva a biblioteca localmente e a consuma em seus apps como se tivessem sido instaladas do Registro NPM, mas sem a necessidade de publicá-las primeiro.

A estrutura de diretórios final será:

```text
infra-redes/
├── package.json (Configuração do Workspace)
├── packages/
│   └── agent/ (A biblioteca de coleta de dados - equivalente ao Agente SNMP)
└── apps/
    ├── dashboard/ (O painel de monitoramento em React/Vite - equivalente ao Zabbix)
    └── example-server/ (O servidor alvo, que rodará a sua biblioteca)
```

### 1.1 Configuração Base do Monorepo
No `package.json` da raiz (`infra-redes/package.json`), você deve adicionar a chave `"workspaces"`:

```json
{
  "name": "my-infra-workspace",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ]
}
```

---

## 2. A Biblioteca (`packages/agent`)

**Objetivo:** Simular o papel do SNMP. Coletar dados reais do SO (CPU, RAM, Rede) e expô-los em uma rota HTTP leve.

### Tecnologias Usadas:
- **Node.js (nativo)**: O módulo `http` (Para subir o servidor sem depender do peso do Express).
- **TypeScript**: Para fornecer a tipagem pros projetos que consumirem a lib.
- **`systeminformation`**: A melhor biblioteca do NPM para extrair dados brutos de hardware/SO.

### Passo a Passo de Construção:

1. **Inicialização:**
   Dentro de `packages/agent`: execute `npm init -y` e atualize o nome do pacote para `"name": "@my-infra/agent"`.
   Instale as libs: `npm install systeminformation` e `npm install -D typescript @types/node`.
   Configure o `tsconfig.json` para dar output na pasta `dist/`.

2. **O Motor de Coleta (O Controller Interno):**
   Crie uma função assíncrona que lê do Sistema Operacional:
   - *CPU*: `const load = await si.currentLoad(); return load.currentLoad;`
   - *Memória*: `const mem = await si.mem(); return { total: mem.total, used: mem.used };`
   - *Rede (Opcional)*: `const net = await si.networkStats();`

3. **O Servidor HTTP Embutido:**
   A rota principal onde o monitoramento (Dashboard) vai bater pra pegar os dados. Use o `http` nativo do Node:

   ```typescript
   // Esboço de implementação em src/index.ts
   import http from 'http';
   import si from 'systeminformation';

   export interface AgentOptions {
     port?: number; // Ex: 9090
     path?: string; // Ex: '/metrics'
   }

   export function startAgent(options: AgentOptions = {}) {
     const port = options.port || 9090;
     const path = options.path || '/metrics';

     const server = http.createServer(async (req, res) => {
       if (req.method === 'GET' && req.url === path) {
         try {
           // Coleta em tempo real (Pode implementar cache se achar que pesa)
           const cpu = await si.currentLoad();
           const mem = await si.mem();
           
           const metrics = {
             cpu: cpu.currentLoad,              // Porcentagem: 0 a 100
             memoryUsedMb: mem.active / 1024 / 1024,
             memoryTotalMb: mem.total / 1024 / 1024,
             timestamp: Date.now()
           };

           res.writeHead(200, { 
             'Content-Type': 'application/json',
             // Importante para o Dashboard em outra porta fazer fetch:
             'Access-Control-Allow-Origin': '*' 
           });
           res.end(JSON.stringify(metrics));
         } catch (error) {
           res.writeHead(500);
           res.end(JSON.stringify({ error: 'Failed to collect metrics' }));
         }
       } else {
         res.writeHead(404);
         res.end();
       }
     });

     server.listen(port, () => {
       console.log(`[Telemetria] Servidor do Agente rodando na porta ${port}${path}`);
     });
     
     return server;
   }
   ```

---

## 3. O Servidor de Teste (`apps/example-server`)

**Objetivo:** Ser o "Servidor alvo" que a faculdade pede para monitorar, e provar que a biblioteca funciona.

1. **Inicialização:**
   Dentro de `apps/example-server`: `npm init -y` (`"name": "example-server"`).
   Instale o express: `npm install express`.
   **A Magia do Workspace:** Você pode instalar a sua própria lib! `npm install @my-infra/agent`.

2. **Implementação (index.js):**
   ```javascript
   const express = require('express');
   const { startAgent } = require('@my-infra/agent'); // <--- Importando a SUA biblioteca
   
   const app = express();

   // 1. Inicia o Agente de Telemetria na porta paralela (ex: 9090)
   startAgent({ port: 9090 });

   // 2. Rota normal do servidor na porta 3000
   app.get('/', (req, res) => {
     res.send('Servidor rodando e sendo monitorado silenciosamente!');
   });

   // 3. Rota pesada para o Laboratório 3 (Laboratório Prático - Atividade 3)
   app.get('/heavy-task', (req, res) => {
     // Simula processamento pesado no Event Loop ou estresse na máquina.
     let i = 0;
     while (i < 1000000000) { i++; } // Bloqueia síncronamente a Thread (vai subir a CPU)
     res.send('Tarefa Pesada Finalizada!');
   });

   app.listen(3000, () => console.log('Servidor HTTP rodando na 3000'));
   ```

---

## 4. O Sistema Monitor / Dashboard (`apps/dashboard`)

**Objetivo:** Substituir o Zabbix por uma aplicação Front-end que captura e desenha as métricas.

### Tecnologias Usadas:
- **Vite + React**: Setup mais rápido e moderno (`npm create vite@latest dashboard -- --template react-ts`).
- **TailwindCSS**: Para estilizar fácil.
- **Recharts**: Para desenhar gráficos lineares (AreaChart/LineChart).

### O Funcionamento ("Polling"):
O Dashboard não precisa de backend próprio. Ele vai direto no navegador do usuário fazer requisições *Fetch* contra a máquina do Agente.

1. **Estado Base (no componente App.tsx):**
   Mantenha um Array no estado (`const [data, setData] = useState([])`).

2. **O loop de Polling (useEffect):**
   ```typescript
   useEffect(() => {
     const interval = setInterval(async () => {
       try {
         // O front-end monitora o Agente batendo na porta onde ele subiu
         const response = await fetch('http://localhost:9090/metrics'); 
         const json = await response.json();
         
         // Adiciona os dados novos na lista e renderiza o gráfico de novo
         setData(prevData => {
           const newData = [...prevData, json];
           // Mantém apenas os últimos 30 pontos no gráfico (sliding window)
           return newData.slice(-30);
         });
       } catch (err) {
         console.error('Agente indisponível'); // (Simulação de indisponibilidade de rede/interface)
       }
     }, 2000); // 2 em 2 segundos
     
     return () => clearInterval(interval);
   }, []);
   ```

3. **Criação da View (JSX):**
   Use o `Recharts` para passar os dados (`<LineChart data={data}>`).
   Configure alertas visuais se a métrica atual passar de um limite!
   Exemplo: `const isAlert = data.at(-1)?.cpu > 80;` -> muda a cor do painel principal de azul para vermelho e adiciona o texto "ALERTA: CPU CRÍTICA" (Entregando a "Atividade 2" de alertas).

---

## 5. Como executar e demonstrar (A Entrega do Laboratório)

1. Você dará um `npm run start` no `apps/example-server`. Ele abrirá tanto o webserver (3000) quanto o Agente de Telemetria (9090).
2. Você dará um `npm run dev` no `apps/dashboard`. Irá abrir a sua tela. O gráfico começará a ler o uso da CPU e Memória (que devem estar baixos, na casa de 5~15%).
3. **Na Atividade 3 (Análise de Desempenho e Stress):** 
   Crie uma nova aba no Terminal.
   Use a ferramenta `autocannon` para fuzilar a rota lenta do seu servidor:
   ```bash
   npx autocannon -c 100 -d 30 http://localhost:3000/heavy-task
   ```
   *Explicação:* Isso abrirá 100 conexões pesadas durante 30 segundos batendo numa rota que tem loop "while", forçando o Node e o SO a 100% de processamento.
4. **O Grande Final:** Vá pro seu Dashboard React. O gráfico irá mostrar uma rampa massiva cruzando a linha de 80%, a UI piscará em Vermelho (Alerta!).
5. Tire seus prints, jogue no Word e receba sua nota!

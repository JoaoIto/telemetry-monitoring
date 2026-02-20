# Relatório Detalhado de Implementação: Infraestrutura de Telemetria

Este documento descreve detalhadamente a arquitetura, as pastas, as dependências instaladas e o código-fonte de cada módulo desenvolvido para a atividade de laboratório prático.

## 1. Arquitetura do Sistema (Monorepo)

O projeto foi construído utilizando **npm workspaces**, permitindo gerenciar múltiplos pacotes e aplicações no mesmo repositório, facilitando muito o compartilhamento de código (a biblioteca de telemetria).

### Estrutura de Diretórios Final
```text
monitoring/
├── docs/                             # Documentação do projeto
├── packages/
│   └── agent/                        # Biblioteca de coleta de dados de telemetria
└── apps/
    ├── example-server/               # Servidor alvo (monitorado pela lib)
    └── dashboard/                    # Aplicação front-end React para visualização
```

### Arquivo Raiz: `package.json`
O arquivo na raiz do repositório define os espaços de trabalho:
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

A biblioteca simula o papel de um agente SNMP, extraindo informações vitais do hardware/SO e as servindo em uma porta HTTP isolada.

- **Dependências de Produção:** `systeminformation` (para extrair os dados do SO).
- **Dependências de Desenvolvimento:** `typescript`, `@types/node` (para tipagem e compilação).

### Estrutura
```text
packages/agent/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### Código Fonte: `src/index.ts`
Este é o motor da biblioteca que sobe o servidor HTTP nativo.
```typescript
import http from 'http';
import si from 'systeminformation';

export interface AgentOptions {
  port?: number;
  path?: string;
}

export function startAgent(options: AgentOptions = {}) {
  const port = options.port || 9090;
  const path = options.path || '/metrics';

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === path) {
      try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        
        const metrics = {
          cpu: cpu.currentLoad,
          memoryUsedMb: mem.active / 1024 / 1024,
          memoryTotalMb: mem.total / 1024 / 1024,
          timestamp: Date.now()
        };

        res.writeHead(200, { 
          'Content-Type': 'application/json',
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

## 3. O Servidor Alvo (`apps/example-server`)

Este é o servidor simulado que nós precisamos monitorar.

- **Dependências Instaladas:** `express` (para o webserver principal) e `@my-infra/agent` (a nossa própria biblioteca instalada via workspace).

### Estrutura
```text
apps/example-server/
├── package.json
└── index.js
```

### Código Fonte: `index.js`
Este código inicia o agente paralelamente à aplicação normal, e cria uma rota de "Pico de CPU" para fins de estresse.
```javascript
const express = require('express');
const { startAgent } = require('@my-infra/agent');

const app = express();

// Inicia o agente na porta 9090 silenciosamente
startAgent({ port: 9090 });

app.get('/', (req, res) => {
  res.send('Servidor rodando e sendo monitorado silenciosamente!');
});

// Tarefa Pesada: Serve para estressar a CPU e ser pego pela telemetria
app.get('/heavy-task', (req, res) => {
  let i = 0;
  while (i < 1000000000) { i++; } // Loop síncrono trava a thread do Node
  res.send('Tarefa Pesada Finalizada!');
});

app.listen(3000, () => console.log('Servidor HTTP rodando na 3000'));
```

---

## 4. O Dashboard do Monitor (`apps/dashboard`)

Uma aplicação front-end robusta para substituir o papel de monitores como o Zabbix, lendo os dados de telemetria e gerando visuais úteis.

- **Framework:** React + Vite + TypeScript.
- **Dependências Instaladas:** `tailwindcss` (estilização) e `recharts` (geração dos gráficos de linha).

### Lógica Utilizada (O Polling)
O front-end usa o hook `useEffect` e o `setInterval` para a cada 2 segundos bater na URL `http://localhost:9090/metrics` da máquina alvo, coletar as respostas do Agente e atualizar um array que comporta até 30 "pontos" no tempo (Sliding Window), injetando isso imediatamente no gráfico da biblioteca `recharts`.

### Código Fonte: Lógica Principal `App.tsx` (Fragmento)
```tsx
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function App() {
  const [data, setData] = useState<Metrics[]>([]);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:9090/metrics');
        if (!response.ok) throw new Error('Network error');
        const json = await response.json();
        
        setData(prevData => {
          const newData = [...prevData, json];
          return newData.slice(-30);
        });
        setIsError(false);
      } catch (err) {
        setIsError(true);
      }
    }, 2000); // Bate na telemetria de 2 em 2 segundos
    
    return () => clearInterval(interval);
  }, []);

  const latestCpu = data.length > 0 ? data[data.length - 1].cpu : 0;
  const isAlert = latestCpu > 80;

  // Renderiza HTML dinâmico com mudança de cor visual (Tema Vermelho)
  // caso 'isAlert' seja verdadeiro
  // ...
```

---

## 5. Resumo da Ferramenta de Teste
Para forçar a sobrecarga descrita e disparar a lógica do Alerta Vermelho (CPU > 80%) no Front-end, o laboratório usa a biblioteca de terceiros `autocannon` executada temporariamente (via `npx`):
```bash
npx autocannon -c 100 -d 30 http://localhost:3000/heavy-task
```
Isso lança 100 conexões pesadas durante 30 segundos, maximizando o processamento para demonstrar o pico da telemetria.

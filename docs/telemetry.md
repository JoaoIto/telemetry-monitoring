# A Arquitetura de Telemetria e Coleta de Dados

Este documento descreve as engrenagens por trás do protocolo de observabilidade desenvolvido, detalhando o papel da Biblioteca (Agente), o método de coleta de dados de hardware e o funcionamento do protocolo de comunicação.

## 1. O Que é Telemetria e Monitoramento?

O **Monitoramento** refere-se ao processo contínuo de coleta, análise e exibição de dados sobre o estado de um sistema. No mundo corporativo, administradores de redes usam ferramentas como *Zabbix*, *Nagios* e *Prometheus* para ter certeza de que os servidores não vão cair por falta de memória ou sobrecarga de CPU.

A **Telemetria** é a tecnologia que torna o monitoramento possível: é o ato de instalar sensores e transmitir medições de instrumentos para pontos remotos. Neste projeto, ao invés de usar o protocolo SNMP tradicional via UDP, desenvolvemos nosso próprio protocolo de telemetria operando sob HTTP.

---

## 2. A Biblioteca (`@my-infra/agent`) e seu Papel

Para que um sistema como o Zabbix possa ler os dados de uma máquina, essa máquina precisa rodar o que chamamos de **Agente** (Zabbix Agent ou SNMP Agent). O nosso pacote npm `@my-infra/agent` cumpre exatamente este papel.

### Por que uma Biblioteca Isolada?
A biblioteca foi arquitetada como um módulo NPM independente dentro do *Monorepo* para que ela seja agnóstica à regra de negócios. Assim, qualquer aplicação Node.js (seja uma API de vendas ou um servidor de jogos) pode apenas importar o agente e inicializá-lo:

```javascript
// Exemplo no servidor de destino
const { startAgent } = require('@my-infra/agent');
startAgent({ port: 9090 });
```

### O que o Agente Faz?
1. **Isolamento de Processos de Rede**: Diferente de acoplar a rota de telemetria no próprio Express do servidor alvo, o Agente sobe o seu próprio servidor utilizando o módulo nativo `http` do Node.js (`const server = http.createServer(...)`). Isso previne que gargalos nas rotas de negócio derrubem a telemetria, além de escutar em uma porta paralela de gerência (`9090`).
2. **Coleta Cíclica**: Ao receber a requisição de observabilidade na rota configurada (`/metrics`), o agente vai direto no barramento do Sistema Operacional perguntar a saúde do host. 

---

## 3. Como os Dados São Coletados (A Mágica do SO)

O código interno do agente `@my-infra/agent` utiliza intensamente a biblioteca robusta de código aberto `systeminformation`. 

Como o Node.js em si é um ambiente interpretado de alto nível que não tem o poder para ler pinos de hardware ou setores do Kernel do SO nativamente, a biblioteca `systeminformation` faz essa ponte (usando chamadas em C++ e leituras de arquivos nativos do SO operacional do host, como o `/proc` no Linux, ou comandos de WMI no Windows).

### O Motor de Coleta (Código e Lógica)
No arquivo principal da nossa biblioteca de telemetria (`src/index.ts`), estruturamos a coleta para ser resolvida paralela ao Event Loop através do `Promise.all`. Isso garante que as medições demoradas (como tráfego de rede) não engarguem a varredura da CPU:

```typescript
const [cpuLoad, mem, osInfo, cpuInfo, temp, netStats, fsSize] = await Promise.all([
    si.currentLoad(),        // Ocupação do processador nas threads em %
    si.mem(),                // RAM Alocada vs Total no pente de memória
    si.osInfo(),             // Distribuição do SO
    si.cpu(),                // Dados construtivos do chip de processamento
    si.cpuTemperature(),     // Retorno térmico dos sensores da placa mãe
    si.networkStats(),       // Velocidade RX/TX na interface Ethernet ativa
    si.fsSize()              // Ocupação blocos no disco rigido (SSD/NVME/HDD)
]);
```

---

## 4. O "Protocolo" e a Transformação de Dados

Após a coleta bruta, o Agente atua como um tradutor, transformando milhares de variáveis sistêmicas soltas num pacote formato em um protocolo leve.

### Formatação em JSON
Nossa telemetria obedece a um contrato em JSON, convertendo bytes brutos em representações humanas. O sistema normaliza números, escolhendo tratar transferências de rede e limites de disco num formato legível para o Frontend:

```javascript
// Lógica de sanitização do pacote de protocolo da nossa lib:
const metrics = {
    // A CPU é tratada direto como percentual de estresse:
    cpu: cpuLoad.currentLoad,
    
    // A memória é convertida de `Bytes` para `Megabytes`:
    memoryUsedMb: mem.active / 1024 / 1024,
    
    // Unidades dinâmicas (exemplo: disco local extraído da primeira partição e convertido pra GB):
    diskUsedPercentage: (fsSize[0].used / fsSize[0].size) * 100,
    diskTotalGb: fsSize[0].size / 1024 / 1024 / 1024,
    
    // Injeção de Timestamp Unix para uso de gráficos em tempo real no receptor
    timestamp: Date.now()
};
```

---

## 5. O Monitoramento na Prática (O Dashboard Web)

O Dashboard `apps/dashboard` (O Monitor) consome e exibe essas métricas ativamente.

### Polling Constante (Modelo Pull vs Push)
Diferente de sistemas assíncronos via WebSockets (Push), onde o servidor empurra os dados passivamente para o cliente, a nossa arquitetura utiliza o modelo de **Pulling Contínuo (Polling)**, mesmo paradigma muito utilizado por raspadores clássicos de geradores SNMP.

No arquivo Front-end `App.tsx`, usamos um temporizador constante na Interface Web (Navegador):
```tsx
useEffect(() => {
    // Loop de observabilidade reativo (Time Series Data):
    const interval = setInterval(async () => {
        // Envia requisições de puxada pro Agente HTTP nas margens do Host
        const response = await fetch('http://localhost:9090/metrics');
        const newData = await response.json();
        
        // Mantém as últimas 30 coletas estruturando um Sliding Window pro Gráfico LineChart (Recharts)
    }, 2000); // 2000 ms Rate Limit
});
```

Este laço fecha o ciclo de vida do nosso ambiente de telemetria. Dados são gerados pelos Hardwares → extraídos pelo Agente JS em rotinas compiladas de SI → Traduzidos para protocolo Web JSON na rota 9090 → Consumidos pelas telas gerenciais do Dashboard para detecção de anomalias (Overloading e Alertas Vermelhos).

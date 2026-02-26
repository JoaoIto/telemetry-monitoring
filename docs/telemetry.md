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

## 5. SNMP vs HTTP: Monitoramento Híbrido Simultâneo

Para fins empíricos e acadêmicos, o projeto foi fortificado para **monitorar a máquina simultaneamente usando os dois protocolos**. Isso permite ao engenheiro de redes visualizar o comportamento e disparidade entre eles em tempo real, colhendo o melhor de dois mundos no painel principal:

*   **🌐 HTTP (Transporte TCP):** O agente processa a carga inteira e devolve um JSON mastigado na rota `/metrics`. Pelo TCP ser um protocolo **Orientado a Conexão**, ele garante que cada requisição entre o Dashboard e o Agente seja entregue com integridade, verificando pacotes perdidos. O lado negativo é um maior *Overhead* na rede (cabos) por causa do "3-Way Handshake".
*   **📡 SNMP (Transporte UDP):** O agente expõe uma árvore crua (*MIB*) via protocolo SNMP raiz na porta 1611. Sendo o transporte **UDP (Não Orientado a Conexão)**, ele apenas "atira" os dados (Fire-and-forget). Sem handshake, o gasto na rede despenca (até 10x menor tamanho de payload), por isso é o **Padrão Ouro e Indústria** em roteadores com processadores minúsculos. O tradeoff é que, em gargalos de rede severos, o dado será perdido sem retransmissão.

No nosso Frontend, o gráfico desenha estas duas linhas temporalmente lidas destas APIs em paralelo, provando de forma cabal a extração simultânea via MIB OID (SNMP) e API REST moderna.

### O Efeito Observador (Observer Effect) e a Coleta em Cache
Durante o desenvolvimento do monitoramento simultâneo, notamos que o gráfico da CPU disparava diferentes valores loucos para o HTTP (ex: 40%) e para o SNMP (ex: 90%) no mesmo segundo. **Por que isso acontece se os dados vêm da mesma máquina?**

Isso é um clássico *"Efeito do Observador"* em sistemas operacionais. A função que lê a carga da CPU (`si.currentLoad()`) não lê um estado estático; ela calcula **a diferença de carga desde a última vez que foi chamada**. 
Quando a rota HTTP chamava a função 100ms depois da rotina SNMP chamá-la no background, a API HTTP acabava medindo o estresse da CPU de apenas uma fração de segundo (lixo residual), enquanto o SNMP media outros 1.9 segundos de ociosidade, causando gráficos corrompidos que pareciam Dentes de Serra.

**A Solução Arquitetural:**
Para consertar a divergência, refatoramos o Agente `@my-infra/agent` para utilizar um **Unified Metric Cache** (Cache Unificado). Agora, a coleta nos sensores do Kernel de Sistema Operacional acontece em uma única e exclusiva _Thread de Background_ (a cada 2 segundos) que salva os dados num Objeto em memória.
Quando o SNMP-UDP ou o REST-HTTP pedem pelos dados, eles não rodam os sensores novamente, apenas **lêem** passivamente a última "foto tirada" em cache. Isso garante que as duas linhas do gráfico convirjam e andem juntas, pois relatam estatísticas perfeitamente sincrônicas!

### Umas Coisas Que Devem Ser Notadas: Tipagem Dinâmica vs MIB OIDs Estáticas
Outra dúvida muito pertinente e diferença cabal sobre implementar ambos protocolos reside na flexibilidade dos dados medidos. Notou-se na implementação do *Frontend* diversas vezes que as métricas HTTP vinham com Float (Casas decimais), e os gráficos via SNMP estavam sempre arredondados (Inteiros). 

Isso ocorre pelo contrato rigoroso das engrenagens do **Simple Network Management Protocol**. Um Agente SNMP sério é programado em roteadores IoT com pouca RAM. A Árvore de Dados Gerencial (*Management Information Base - MIB*) obriga o agente a pré-declarar o tipo de dado de cada "Object Identifier" (OID). 

Na nossa Library `/agent`:
1. **Memória, Rede, RAM e Disk (%)**: O REST API envia esses dados como uma String/JSON imensa com bytes quebrados e exatos, delegando ao Dashboard a conta de dividir por 1024 para renderizar na tela. Quando a mesma medição é chamada pela porta **UDP 1611 SNMP**, nosso agente é obrigado a converter e engessar a medição arredondando para `Integer32`. Assim, nós alocamos literalmente apenas "1 Byte" no cabeçalho UDP, economizando tráfego global da infraestrutura.
2. **Dados Textuais (SO, Processador Name e Modelos)**: Enviar texto no JSON REST HTTP é comum. No SNMP, trafegar uma corda extensa como _"Intel Gen Intel Core i7-13650HX"_ estoura a banda do protocolo. Por isso, a telemetria HTTP no Dashboard é capaz de mostrar os textos do Hardware; enquanto no protocolo SNMP optamos por não provisionar OIDs para metadados ricos (apenas transportando um `OctetString` simples com a Plataforma OS e cortando o resto).

---

## 6. O Monitoramento na Prática (O Dashboard Web)

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

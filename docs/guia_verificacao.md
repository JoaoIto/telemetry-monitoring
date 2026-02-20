# Guia de Verificação: Monorepo de Telemetria

O sistema completo foi implementado utilizando **NPM Workspaces** para simular uma arquitetura de monitoramento similar ao SNMP e Zabbix, conforme as especificações solicitadas.

## O Que Foi Construído

1. **A Biblioteca (`@my-infra/agent`)**: Um pacote isolado em `packages/agent` que usa `systeminformation` para ler dados da CPU e Memória RAM. O agente expõe essas métricas subindo um pequeno servidor HTTP interno na porta `9090` de forma independente.
2. **O Servidor Alvo (`apps/example-server`)**: Um servidor Express convencional na porta `3000` que importa sua própria biblioteca local `@my-infra/agent` para ser monitorado silenciosamente. Inclui uma rota `/heavy-task` capaz de engargar o Event Loop.
3. **O Dashboard React (`apps/dashboard`)**: Interface frontend usando Vite e TailwindCSS. Faz o *polling* contínuo de dados na porta `9090` e exibe os resultados em tempo real um gráfico interativo renderizado via `recharts`. A interface piscará em **Vermelho** sempre que o uso de processamento bater 80%+.

---

## Como Validar o Funcionamento (Prova de Conceito)

Para demonstrar o funcionamento na apresentação do seu laboratório, siga estes passos em três abas separadas do seu terminal:

### Passo 1: Iniciar os Servidores
No diretório raiz (`infra-redes/monitoring`), inicie o Servidor Alvo (que por consequência vai carregar e iniciar o Agente de Telemetria na porta paralela):
```bash
npm run start -w example-server
```
*(Ele anunciará estar rodando nas portas 3000 e 9090).*

### Passo 2: Iniciar o Dashboard (O Monitor)
Em um novo terminal, na mesma pasta raiz, rode o Front-end React:
```bash
npm run dev -w dashboard
```
 Abra o navegador no endereço indicado (geralmente `http://localhost:5173`). Você verá o gráfico lendo o uso normal da máquina (tendendo a estar entre 5% a 20%).

### Passo 3: Atividade Prática (Análise de Desempenho e Stress)
Com a tela do Dashboard aberta, rode em um novo terminal o gerador de estresse apontando para a rota assíncrona que bloqueia a CPU do Express:
```bash
npx autocannon -c 100 -d 30 http://localhost:3000/heavy-task
```

**Resultado Esperado:**
- A carga do Node vai travar o Event loop e elevar seu consumo computacional ao máximo por 30 segundos.
- O Dashboard React vai detectar a anomalia via telemetria no próximo *tick* de aferição.
- O gráfico irá formar um "pico" repentino, passando a marca de 80%.
- A Tela passará do Tema Claro para um **Tema Vermelho Intenso** sinalizando Estado Crítico ao vivo! 

Tire os *prints* em cada um dos estados (Uso calmo vs. Uso estressado) para colocar no seu trabalho final!

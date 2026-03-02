# 📊 Plataforma de Monitoramento e Telemetria

Este projeto é uma implementação acadêmica de uma solução de monitoramento de infraestrutura, simulando elementos críticos de ferramentas clássicas como o **SNMP** (Protocolo Simples de Gerenciamento de Rede) e o **Zabbix** (Painel de Monitoramento). 

O projeto provê uma biblioteca customizada de agenciamento (`@my-infra/agent`), um servidor em execução que precisa ser monitorado e um Dashboard em tempo real para observabilidade de recursos de hardware.


![Dashboard](https://github.com/JoaoIto/telemetry-monitoring/blob/main/docs/imgs/dashboard.png?raw=true)
![JSON-Metrics](https://github.com/JoaoIto/telemetry-monitoring/blob/main/docs/imgs/json-metrics.png?raw=true)

## 📦 Instalação e Execução Rápida (NPM Package)

O seu projeto já foi compilado e publicado como um executável universal no NPM.

[![NPM Version](https://img.shields.io/npm/v/my-telemetry.svg)](https://www.npmjs.com/package/my-telemetry)

Para testar o Dashboard completo agora mesmo (sem precisar clonar o repositório), você precisa ter o **Node.js 18+** instalado. No seu terminal, execute apenas:

```bash
npx my-telemetry
```

Este comando fará o download instantâneo, ligará os sensores SNMP locais (`1611`) e a API REST (`9090`), além de hospedar o Dashboard React na porta `3000` via Express - abrindo no seu navegador principal automaticamente.

---

## 📑 Sumário

1. [Sobre o Projeto](#1-sobre-o-projeto)
2. [O que é monitorado](#2-o-que-é-monitorado)
3. [Tecnologias Utilizadas](#3-tecnologias-utilizadas)
4. [Como Funciona (Arquitetura)](#4-como-funciona-arquitetura)
5. [Pré-requisitos e Instalação](#5-pré-requisitos-e-instalação)
6. [Como Rodar a Aplicação](#6-como-rodar-a-aplicação)
7. [Simulando um Incidente (Teste de Estresse)](#7-simulando-um-incidente-teste-de-estresse)

---

## 1. Sobre o Projeto

O objetivo do projeto é demonstrar, de forma prática, como dados de telemetria podem ser lidos de um sistema operacional hospedeiro e transportados para um painel gerencial em tempo real. O sistema também tem o papel de fornecer alertas ágeis em situações críticas de degradação da infraestrutura ou esgotamento de recursos na máquina alvo.

## 2. O que é monitorado?

Através da biblioteca em Node nativa, o sistema coleta de forma ininterrupta os dados da máquina:
- **Uso de CPU:** Carga atual de todo o processamento computacional da máquina (em %).
- **Consumo de Memória RAM:** Quantidade da memória ativa/em uso real (traduzido como Megabytes formatados) contra a especificação total disponível no equipamento.

## 3. Tecnologias Utilizadas

O projeto foi construído inteiramente na Stack **JavaScript/TypeScript**, adotando o gerenciamento estrutural de **Monorepo** através do nativo *NPM Workspaces*.

- **Agente de Telemetria (`packages/agent`):** Node.js Nativo (`node:http`), TypeScript puro, Módulo `systeminformation`.
- **Servidor Alvo Simulado (`apps/example-server`):** Node.js, Framework Express.
- **Painel de Controle (`apps/dashboard`):** React.js, Vite (Bundler Front-end), TailwindCSS (Estilização e Classes de Utilidades), Recharts (Componente de Linha Gráfica).
- **Gerador de Carga (Benchmarking):** Autocannon.

## 4. Como Funciona (Arquitetura)

A arquitetura do repositório é logicamente isolada por 3 grandes módulos de software que se comunicam através de requisições web simples:

1. **A Biblioteca do Agente**: Atua como o *"Agente SNMP"* local da máquina que será inspecionada. Por baixo dos panos, através do seu código exposto, o agente lê os hardwares via barramento e liga silenciosamente uma miniporta HTTP TCP (`:9090`) para responder JSON aos pedidos externos.
2. **O Servidor Observado**: Uma simulação em Express de uma aplicação real em nuvem rodando via porta web (`:3000`). Para não sofrer intervenção com Zabbix Agent pesado, nós atachamos a biblioteca Node nele, ativando automaticamente o monitoramento sem impactar a regra de negócio da aplicação.
3. **O Dashboard Monitor**: Representando a Estação de Gerência Zabbix (`:5173`), esta interface Web em React realiza *Polling* sistemático usando requisições Fetch na rota exposta `/metrics` dentro da porta `9090` da máquina e enfileira uma Array visual em forma gráfica na interface.

## 5. Pré-requisitos e Instalação

### Requisitos / O que baixar
Para garantir que a aplicação rode, assegure-se de que sua máquina atende aos requisitos abaixo. Nenhuma máquina virtual precisa ser baixada caso rode localmente:

* [Node.js](https://nodejs.org/pt) Instalado (Versão `v18.x` LTS ou mais recente).
* Instalação Ativa do NPM (incluso nativamente no instalável no Node).

### Instalação

Primeiro, obtenha a cópia local baixando o repositório deste projeto em sua máquina. Para inicializar e linkar as dependências cruzadas (o workspace cuidará do restante), execute apenas o comando abaixo a partir da raiz `monitoring/`:

```bash
npm install
```

## 6. Como Rodar a Aplicação

A observabilidade plena necessita dos dois nós principais online na sua rede interna/localhost, exigindo múltiplos terminais no seu Console:

**🖥️ Terminal 1 (Microserviço da Aplicação)**
A partir do diretório raiz (`monitoring/`), inicialize o serviço principal:
```bash
npm run start -w example-server
```
*(Confirme se os logs indicam atividade na porta 3000 e 9090).*

**💻 Terminal 2 (Interface Monitória Front-Emd)**
Em um promt limpo, a partir da raiz do mesmo diretório (`monitoring/`), coloque o React em modo Web:
```bash
npm run dev -w dashboard
```
> Imediatamente, navegue em seu programa Browser favorito até endereço `http://localhost:5173/` (ou do indicado pelo Vite). O consumo calmo do computador começará a ser exibido.

## 7. Simulando um Incidente (Teste de Estresse)

Testes de laboratórios práticos requerem demonstrações reais. A interface do Dashboard React tem instruções internas baseadas na CPU lida: se a CPU ultrapassar a linha de fogo (>80%), painéis vermelhos serão projetados alertando incidentes de falha técnica em tempo real.

![Stress-test](https://github.com/JoaoIto/telemetry-monitoring/blob/main/docs/imgs/stress-test.png?raw=true)


Para causar um vazamento síncrono que bloqueia o Node e força 100% da CPU, abra um promt inédito e comande de diretório raiz:

```bash
npx autocannon -c 100 -d 30 http://localhost:3000/heavy-task
```

Basta olhar ao vivo para a página Web e capturar os prints do alarme para o seu laboratório!

# my-telemetry

Uma solução inovadora e completa de observabilidade e monitoramento de hardware em tempo real, rodando de forma híbrida: **SNMP (UDP) + REST API (HTTP)**. Um projeto educacional focado em demonstrar a diferença de overhead e formatação em arquiteturas de redes.

## 🔗 Código Fonte (GitHub Repositório)

Para explorar o código de cada módulo em detalhes, acesse nosso repósitorio oficial aberto no GitHub:
👉 **[Monitoramento Híbrido Telemetry (GitHub)](https://github.com/JoaoIto/telemetry-monitoring)**

---

## 🚀 Instalação e Execução Mágica (One-Command)

O pacote provém a interface web (Dashboard Recharts responsivo) interligada ao Agente servidor simultaneamente, sem necessidade de configuração. Na sua máquina local, basta rodar:

```bash
npx my-telemetry
```

Ao executar o comando acima:
1. O Agente de Hardware inicializará silenciosamente os *sniffers* na porta TCP `9090` e UDP `1611`.
2. A interface gráfica (Web Dashboard) subirá na porta `3000`.
3. O seu navegador abrirá automaticamente a tela interativa.

## Visão Estrutural

- **Dashboard (Frontend React/Vite)**: Renderiza gráficos duplos para comparar dados brutos contra MIBs Integer parseados, provando de forma cabal o Efeito Observador na variação de Coleta simultânea.
- **Agent (Node.js)**: Coleta CPU crua, parse de fabricante do OS, memória total/ativa e Tráfego RX/TX, formatando tanto para strings HTTP quanto montando as respostas binárias do protocolo UDP enxuto para SNMP nativo. 

### Monitorando remotamente

O front-end disponibiliza uma aba para você apontar o alvo ativamente. Para monitorar servidores Linux ou Windows abertos na rede/internet, basta que instalem o NodeJS, instalem globalmente via `npm install -g my-telemetry` e deixem o agente rodando com o IP exposto (via provedor de nuvem VPS ou Ngrok). Você poderá inspecionar qualquer máquina a partir do Front-end!

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

interface Metrics {
  cpu: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  os: string;
  uptime: number;
  cpuName: string;
  cpuCores: number;
  temp: number;
  rxSec: number;
  txSec: number;
  diskUsedPercentage: number;
  diskTotalGb: number;
  timestamp: number;
  protocol?: string;
}

interface Point {
  timestamp: number;
  httpCpu: number | null;
  snmpCpu: number | null;
  http: Metrics | null;
  snmp: Metrics | null;
}

const InfoTooltip = ({ title, text, httpText, snmpText }: { title: string, text: string, httpText?: string, snmpText?: string }) => (
  <div className="group relative ml-2 inline-flex cursor-help align-middle">
    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-colors">?</div>
    <div className="invisible absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-white opacity-0 shadow-2xl transition-all group-hover:visible group-hover:opacity-100 font-sans pointer-events-none">
      <h4 className="font-bold text-indigo-300 mb-1">{title}</h4>
      <p className="opacity-90 leading-relaxed mb-3 text-xs">{text}</p>
      {(httpText || snmpText) && (
        <div className="space-y-2 text-xs border-t border-slate-700 pt-3 mt-2">
          {httpText && <div className="flex gap-2"><span className="text-sky-400 font-bold shrink-0">HTTP:</span><span className="opacity-80">{httpText}</span></div>}
          {snmpText && <div className="flex gap-2"><span className="text-violet-400 font-bold shrink-0">SNMP:</span><span className="opacity-80">{snmpText}</span></div>}
        </div>
      )}
      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
    </div>
  </div>
);

function App() {
  const [data, setData] = useState<Point[]>([]);
  const [isError, setIsError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [resHttp, resSnmp] = await Promise.all([
          fetch('http://localhost:9090/metrics').catch(() => null),
          fetch('http://localhost:9090/metrics/snmp').catch(() => null)
        ]);

        const httpJson = resHttp && resHttp.ok ? await resHttp.json() : null;
        const snmpJson = resSnmp && resSnmp.ok ? await resSnmp.json() : null;

        if (!httpJson && !snmpJson) {
          throw new Error('Todos os endpoints falharam');
        }

        setData(prevData => {
          const newData = [...prevData, {
            timestamp: Date.now(),
            httpCpu: httpJson ? httpJson.cpu : null,
            snmpCpu: snmpJson ? snmpJson.cpu : null,
            http: httpJson,
            snmp: snmpJson
          }];
          return newData.slice(-30);
        });
        setIsError(false);
      } catch (err) {
        setIsError(true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const latestInfo = data.length > 0 ? data[data.length - 1] : null;
  const latestHttp = latestInfo?.http;
  const latestSnmp = latestInfo?.snmp;

  const currentCpu = latestHttp?.cpu || latestSnmp?.cpu || 0;
  const isAlert = currentCpu > 80;

  const formatUptime = (seconds: number) => {
    if (!seconds) return '---';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className={`min-h-screen p-8 transition-colors duration-500 ${isAlert ? 'bg-red-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header e Status */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Monitoramento Simultâneo Híbrido</h1>
            <p className={`mt-1 text-sm font-medium ${isAlert ? 'text-red-200' : 'text-slate-500'}`}>
              Agente em: <code className="font-mono bg-black/10 px-1 py-0.5 rounded">http://localhost:9090/</code> | UDP `1611`
            </p>
          </div>

          <div className="flex items-center gap-4">

            <button
              onClick={() => setShowInfo(!showInfo)}
              className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold rounded-full shadow-sm border border-indigo-300 transition-colors"
            >
              📖 Entender a Diferença
            </button>

            <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold shadow-sm border ${isError
              ? 'bg-rose-100 text-rose-800 border-rose-300'
              : isAlert
                ? 'bg-red-700 text-white border-red-500 animate-pulse'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
              <div className={`w-3 h-3 rounded-full ${isError ? 'bg-rose-500' : isAlert ? 'bg-white' : 'bg-emerald-500'}`} />
              {isError ? 'Agentes Offline' : 'Telemetria Ativa'}
            </div>

            {isAlert && !isError && (
              <div className="animate-pulse bg-red-600 px-4 py-2 rounded-full font-bold text-white shadow-lg border border-red-400">
                ALERTA: CPU {Math.round(currentCpu)}%
              </div>
            )}

          </div>

          {/* Balão Explicativo Informativo */}
          {showInfo && (
            <div className="absolute top-16 right-0 w-96 z-50 p-6 bg-white rounded-2xl shadow-2xl border border-indigo-100 text-slate-800 text-sm">
              <h3 className="text-lg font-bold text-indigo-900 mb-2">Protocolos de Telemetria</h3>
              <p className="mb-2"><strong>🌐 HTTP (TCP):</strong> O agente coleta dados localmente e expõe uma REST API moderna em JSON. Utiliza protocolo TCP conectado que garante que os dados cheguem corretamente, porém possui mais <em>overhead</em> nos cabos de rede pelas negociações TCP.</p>
              <hr className="my-2 border-slate-100" />
              <p><strong>📡 SNMP (UDP):</strong> Uma implementação do Protocolo Simples de Gerenciamento de Redes. Ele devolve uma árvore binária MIB rodando numa porta UDP enxuta. Por ser UDP (fire-and-forget), gasta <strong>10x menos recursos de rede</strong> do que o HTTP e é o padrão "ouro" de hardwares de telecomunicação de baixo processamento, mesmo havendo chance de pacotes perdidos caso o tráfego congestionar.</p>
              <button onClick={() => setShowInfo(false)} className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Entendi!</button>
            </div>
          )}

        </header>

        {isError && (
          <div className="bg-yellow-500 text-yellow-950 p-4 rounded-xl shadow-md font-medium border border-yellow-400">
            ⚠️ O Dashboard não conseguiu se conectar nem na API REST e nem no Proxy SNMP do agente. O example-server está rodando?
          </div>
        )}

        {/* Visão Principal Expandida */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">

          {/* Coluna Esquerda: Gráfico Duplo (Ocupa 2 colunas) */}
          <div className={`lg:col-span-2 p-6 rounded-2xl shadow-xl transition-colors duration-500 ${isAlert ? 'bg-red-900/50 border border-red-700' : 'bg-white border border-slate-200'}`}>
            <h2 className="text-xl font-semibold mb-6 flex items-center justify-between">
              <span className="flex items-center">
                Comparativo de Coleta: Carga de CPU
                <InfoTooltip
                  title="Carga Média do Processador"
                  text="Mede o percentual de tempo que o processador passa executando tarefas em relação ao tempo ocioso nos últimos 2 segundos de coleta."
                  httpText="Mantém a precisão flutuante matemática via JSON (Ex: 45.3%)."
                  snmpText="Convertido para Inteiro no servidor e exposto como Int32 na MIB SNMP, ideal para leitura padronizada de modens e roteadores."
                />
              </span>
              <div className="flex gap-4">
                <span className="text-2xl font-black text-sky-600" title="HTTP/REST" >{latestHttp ? Math.round(latestHttp.cpu) : 0}%</span>
                <span className="text-2xl font-black text-violet-600" title="SNMP/UDP">{latestSnmp ? Math.round(latestSnmp.cpu) : 0}%</span>
              </div>
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isAlert ? '#fca5a5' : '#e2e8f0'} opacity={0.5} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(val) => new Date(val).toLocaleTimeString()}
                    stroke={isAlert ? '#fecaca' : '#64748b'}
                    fontSize={12}
                  />
                  <YAxis domain={[0, 100]} stroke={isAlert ? '#fecaca' : '#64748b'} fontSize={12} />
                  <RechartsTooltip
                    labelFormatter={(val) => new Date(val).toLocaleTimeString()}
                    contentStyle={{
                      backgroundColor: isAlert ? '#7f1d1d' : '#ffffff',
                      borderColor: isAlert ? '#ef4444' : '#e2e8f0',
                      color: isAlert ? '#ffffff' : '#0f172a',
                      borderRadius: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    name="🌐 HTTP/REST API"
                    type="monotone"
                    dataKey="httpCpu"
                    stroke="#0284c7" // light blue
                    strokeWidth={4}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    name="📡 SNMP UDP Agent"
                    type="monotone"
                    dataKey="snmpCpu"
                    stroke="#7c3aed" // violet
                    strokeWidth={4}
                    dot={false}
                    strokeDasharray="5 5" // Dashed line to differentiate
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Linha Inferior: Rede e Memória */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className={`p-6 rounded-2xl shadow-lg border ${isAlert ? 'bg-red-900/50 border-red-700' : 'bg-white border-slate-200'}`}>
            <h3 className="text-lg font-medium opacity-80 mb-4 flex items-center">
              Tráfego de Rede
              <InfoTooltip
                title="Soma de Banda Passante I/O"
                text="Uma totalização viva e contínua do uso de Bytes pelas suas placas de rede de internet, tanto via LAN (Cabo) quanto WLAN (Wi-fi)."
                httpText="Nós recebemos os montantes em Bytes e renderizamos ativamente a conversão em casas decimais de megabytes por segundo."
                snmpText="Tivemos que arredondar nativamente em KiloBytes Sec antes de trafegar na Árvore OID (pois os limites estruturais do SNMP Integer quebram fluxos decimais)."
              />
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs uppercase font-bold text-sky-600 mb-2">🌐 HTTP</h4>
                <p className="text-sm font-mono text-emerald-600">RX: {latestHttp ? (latestHttp.rxSec * 1024).toFixed(1) : '0.0'} KB/s</p>
                <p className="text-sm font-mono text-indigo-600">TX: {latestHttp ? (latestHttp.txSec * 1024).toFixed(1) : '0.0'} KB/s</p>
              </div>
              <div className="border-l pl-4 border-slate-200">
                <h4 className="text-xs uppercase font-bold text-violet-600 mb-2">📡 SNMP (UDP)</h4>
                <p className="text-sm font-mono text-emerald-600">RX: {latestSnmp ? (latestSnmp.rxSec * 1024).toFixed(1) : '0.0'} KB/s</p>
                <p className="text-sm font-mono text-indigo-600">TX: {latestSnmp ? (latestSnmp.txSec * 1024).toFixed(1) : '0.0'} KB/s</p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-2xl shadow-lg border ${isAlert ? 'bg-red-900/50 border-red-700' : 'bg-white border-slate-200'}`}>
            <h3 className="text-lg font-medium opacity-80 mb-4 flex items-center">
              Alocação de Memória RAM
              <InfoTooltip
                title="Consumo de Memória de Sistema"
                text="Reflete puramente a memória alocada ativamente por processos do SO, não listando a memória em cache adormecida, o que exibe um uso tangível."
                httpText="Um payload dinâmico. O HTTP fornece a flexibilidade do client de frontend calcular suas próprias aproximações."
                snmpText="Forçamos o engessamento na coleta (backend), onde o Agente divide o número para MB inteiro puro e pendura na MIB, economizando processamento front-end dos aparelhos receptores IoT."
              />
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs uppercase font-bold text-sky-600 mb-2">🌐 Via HTTP API</h4>
                <p className="text-xl font-bold font-mono">
                  {latestHttp ? Math.round(latestHttp.memoryUsedMb) : 0} <span className="text-xs opacity-50">MB</span>
                </p>
              </div>
              <div className="border-l pl-4 border-slate-200">
                <h4 className="text-xs uppercase font-bold text-violet-600 mb-2">📡 Via Agente SNMP</h4>
                <p className="text-xl font-bold font-mono text-violet-900">
                  {latestSnmp ? Math.round(latestSnmp.memoryUsedMb) : 0} <span className="text-xs opacity-50">MB</span>
                </p>
              </div>
            </div>
          </div>

        </div>
        {/* Coluna Direita: Cards de Status Físico e OS */}
        <div className="space-y-6">

          <div className={`p-6 rounded-2xl shadow-lg border ${isAlert ? 'bg-red-900/30 border-red-800' : 'bg-white border-slate-200'}`}>
            <h3 className="text-sm font-semibold uppercase tracking-wider opacity-70 mb-4 flex items-center">
              Disco Local (Comparativo)
              <InfoTooltip
                title="Uso da Partição de Disco Principal"
                text="Mede o volume de blocos oculados no HD principal (Drive primário do SO) comparado com o tamanho total e reflete o armazenamento disponível."
                httpText="A API exporta os dados limpos sem arredondamento. O JSON entrega a relação precisa de Gigabytes."
                snmpText="Para o payload UDP do SNMP ser mínimo, o Agente tira a média em Porcentagem do Disco, retornando um Inteiro que consome 1 byte."
              />
            </h3>
            <div className="space-y-4">

              {/* HTTP Disk */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-xs text-sky-600 font-bold uppercase">🌐 Uso via HTTP</span>
                  <span className="font-bold text-sm">{latestHttp ? Math.round(latestHttp.diskUsedPercentage) : 0}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${latestHttp ? latestHttp.diskUsedPercentage : 0}%` }}></div>
                </div>
              </div>

              {/* SNMP Disk */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-xs text-violet-600 font-bold uppercase">📡 Uso via SNMP</span>
                  <span className="font-bold text-sm">{latestSnmp ? Math.round(latestSnmp.diskUsedPercentage) : 0}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${latestSnmp ? latestSnmp.diskUsedPercentage : 0}%` }}></div>
                </div>
              </div>

            </div>
          </div>
          <div className={`p-6 rounded-2xl shadow-lg border ${isAlert ? 'bg-red-900/30 border-red-800' : 'bg-white border-slate-200'}`}>
            <h3 className="text-sm font-semibold uppercase tracking-wider opacity-70 mb-4 flex items-center">
              Host OS (Apenas HTTP)
              <InfoTooltip
                title="Identidade do Hospedeiro e Uptime"
                text="A telemetria profunda vai além do uso de hardware, lendo metadados de sistema e chip."
                httpText="Via TCP/HTTP não há problemas em trafegar Strings pesadas. Lemos toda a Distribuição, arquitetura ARM/x64 e modelo nominativo do Fabricante Inte/AMD na resposta."
                snmpText="SNMP comumente evita trafegar Strings para ser performático, por isso nós não integramos OIDs para o nome do CPU. Mantivemos apenas a versão do Sistema (OctetString MIB), que é exibida mas não exposta no painel unificado por quebra de design UI."
              />
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs opacity-60">Sistema</p>
                <p className="font-medium truncate">{latestHttp?.os || '---'}</p>
              </div>
              <div>
                <p className="text-xs opacity-60">Processador</p>
                <p className="font-medium text-sm">{latestHttp?.cpuName || '---'} ({latestHttp?.cpuCores || '-'} Cores)</p>
              </div>
              <div>
                <p className="text-xs opacity-60">Uptime da Máquina</p>
                <p className="font-medium">{latestHttp ? formatUptime(latestHttp.uptime) : '---'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

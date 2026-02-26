import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
}

function App() {
  const [data, setData] = useState<Metrics[]>([]);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:9090/metrics');
        if (!response.ok) throw new Error('Network response was not ok');
        const json = await response.json();

        setData(prevData => {
          const newData = [...prevData, json];
          return newData.slice(-30); // Keep last 30 points
        });
        setIsError(false);
      } catch (err) {
        setIsError(true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const latest = data.length > 0 ? data[data.length - 1] : null;
  const isAlert = latest ? latest.cpu > 80 : false;

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className={`min-h-screen p-8 transition-colors duration-500 ${isAlert ? 'bg-red-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header e Status */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Observabilidade de Infraestrutura</h1>
            <p className={`mt-1 text-sm font-medium ${isAlert ? 'text-red-200' : 'text-slate-500'}`}>
              Monitorando Agente em: <code className="font-mono bg-black/10 px-1 py-0.5 rounded">http://localhost:9090/metrics</code>
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Status Indicator */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold shadow-sm border ${isError
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : isAlert
                  ? 'bg-red-700 text-white border-red-500 animate-pulse'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
              <div className={`w-3 h-3 rounded-full ${isError ? 'bg-rose-500' : isAlert ? 'bg-white' : 'bg-emerald-500'}`} />
              {isError ? 'Agente Desconectado' : 'Conexão Ativa'}
            </div>

            {isAlert && !isError && (
              <div className="animate-pulse bg-red-600 px-4 py-2 rounded-full font-bold text-white shadow-lg border border-red-400">
                ALERTA DE INCIDENTE: Carga de CPU em {Math.round(latest!.cpu)}%
              </div>
            )}
          </div>
        </header>

        {isError && (
          <div className="bg-yellow-500 text-yellow-950 p-4 rounded-xl shadow-md font-medium border border-yellow-400">
            ⚠️ O Dashboard não conseguiu alcançar a porta de coleta do agente. O example-server está rodando?
          </div>
        )}

        {/* Visão Principal Expandida */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">

          {/* Coluna Esquerda: Gráfico Principal de CPU (Ocupa 2 colunas) */}
          <div className={`lg:col-span-2 p-6 rounded-2xl shadow-xl transition-colors duration-500 ${isAlert ? 'bg-red-900/50 border border-red-700' : 'bg-white border border-slate-200'}`}>
            <h2 className="text-xl font-semibold mb-6 flex items-center justify-between">
              <span>Carga de Processamento (CPU)</span>
              <span className="text-2xl font-black">{latest ? Math.round(latest.cpu) : 0}%</span>
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
                  <Tooltip
                    labelFormatter={(val) => new Date(val).toLocaleTimeString()}
                    contentStyle={{
                      backgroundColor: isAlert ? '#7f1d1d' : '#ffffff',
                      borderColor: isAlert ? '#ef4444' : '#e2e8f0',
                      color: isAlert ? '#ffffff' : '#0f172a',
                      borderRadius: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke={isAlert ? '#fef2f2' : '#3b82f6'}
                    strokeWidth={4}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Coluna Direita: Cards de Status Físico e OS */}
          <div className="space-y-6">

            {/* Sistema Operacional Card */}
            <div className={`p-6 rounded-2xl shadow-lg border ${isAlert ? 'bg-red-900/30 border-red-800' : 'bg-white border-slate-200'}`}>
              <h3 className="text-sm font-semibold uppercase tracking-wider opacity-70 mb-4">Informações do Hospedeiro</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs opacity-60">Sistema Operacional</p>
                  <p className="font-medium truncate">{latest?.os || '---'}</p>
                </div>
                <div>
                  <p className="text-xs opacity-60">Modelo do Processador</p>
                  <p className="font-medium text-sm">{latest?.cpuName || '---'} ({latest?.cpuCores || '-'} Cores)</p>
                </div>
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs opacity-60">Uptime da Máquina</p>
                    <p className="font-medium">{latest ? formatUptime(latest.uptime) : '---'}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-60">Temperatura CPU</p>
                    <p className={`font-medium ${latest?.temp && latest.temp > 75 ? 'text-orange-500' : ''}`}>
                      {latest?.temp && latest.temp > 0 ? `${latest.temp}°C` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Armazenamento Card */}
            <div className={`p-6 rounded-2xl shadow-lg border ${isAlert ? 'bg-red-900/30 border-red-800' : 'bg-white border-slate-200'}`}>
              <h3 className="text-sm font-semibold uppercase tracking-wider opacity-70 mb-4">Unidade de Disco Local</h3>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">Ocupado</span>
                  <span className="font-bold">{latest ? Math.round(latest.diskUsedPercentage) : 0}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700 overflow-hidden">
                  <div className={`h-2.5 rounded-full ${latest && latest.diskUsedPercentage > 90 ? 'bg-rose-500' : 'bg-blue-600'}`} style={{ width: `${latest ? latest.diskUsedPercentage : 0}%` }}></div>
                </div>
                <p className="text-xs opacity-60 mt-2 text-right">De {latest ? Math.round(latest.diskTotalGb) : 0} GB totais</p>
              </div>
            </div>
          </div>
        </div>

        {/* Linha Inferior: Rede e Memória */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Rede Card */}
          <div className={`p-6 rounded-2xl shadow-lg border flex items-center justify-between ${isAlert ? 'bg-red-900/50 border-red-700' : 'bg-white border-slate-200'}`}>
            <div>
              <h3 className="text-lg font-medium opacity-80 mb-1">Tráfego de Rede</h3>
              <p className="text-sm opacity-60">I/O da interface ativa</p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-xs uppercase font-bold text-emerald-500">Download (RX)</p>
                <p className="text-2xl font-mono mt-1">{latest ? latest.rxSec.toFixed(2) : '0.00'} <span className="text-sm opacity-50">MB/s</span></p>
              </div>
              <div>
                <p className="text-xs uppercase font-bold text-indigo-500">Upload (TX)</p>
                <p className="text-2xl font-mono mt-1">{latest ? latest.txSec.toFixed(2) : '0.00'} <span className="text-sm opacity-50">MB/s</span></p>
              </div>
            </div>
          </div>

          {/* Memória Card */}
          <div className={`p-6 rounded-2xl shadow-lg border flex items-center justify-between ${isAlert ? 'bg-red-900/50 border-red-700' : 'bg-white border-slate-200'}`}>
            <div>
              <h3 className="text-lg font-medium opacity-80 mb-1">Alocação de Memória</h3>
              <p className="text-sm opacity-60">RAM ativa</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold font-mono">
                {latest ? Math.round(latest.memoryUsedMb) : 0} <span className="text-lg opacity-50">MB</span>
              </p>
              <p className="text-sm opacity-60 font-medium">de {latest ? Math.round(latest.memoryTotalMb) : 0} MB</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default App;

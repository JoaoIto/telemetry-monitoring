import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Metrics {
  cpu: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
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
          return newData.slice(-30);
        });
        setIsError(false);
      } catch (err) {
        console.error('Agente indisponível');
        setIsError(true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const latestCpu = data.length > 0 ? data[data.length - 1].cpu : 0;
  const isAlert = latestCpu > 80;

  return (
    <div className={`min-h-screen p-8 transition-colors duration-500 ${isAlert ? 'bg-red-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Monitoramento em Tempo Real</h1>
          {isAlert && (
            <div className="animate-pulse bg-red-600 px-4 py-2 rounded-full font-bold text-white shadow-lg">
              ALERTA: CPU CRÍTICA ({Math.round(latestCpu)}%)
            </div>
          )}
        </header>

        {isError && (
          <div className="bg-yellow-500 text-yellow-900 p-4 rounded-xl shadow-md font-medium">
            Aviso: Agente de telemetria indisponível. Verifique se o example-server está rodando.
          </div>
        )}

        <div className={`p-6 rounded-2xl shadow-xl transition-colors duration-500 ${isAlert ? 'bg-red-800' : 'bg-white'}`}>
          <h2 className="text-xl font-semibold mb-4">Uso de CPU (%)</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={isAlert ? '#fca5a5' : '#e5e7eb'} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(val) => new Date(val).toLocaleTimeString()}
                  stroke={isAlert ? '#fecaca' : '#6b7280'}
                />
                <YAxis domain={[0, 100]} stroke={isAlert ? '#fecaca' : '#6b7280'} />
                <Tooltip
                  labelFormatter={(val) => new Date(val).toLocaleTimeString()}
                  contentStyle={{
                    backgroundColor: isAlert ? '#7f1d1d' : '#ffffff',
                    borderColor: isAlert ? '#ef4444' : '#e5e7eb',
                    color: isAlert ? '#ffffff' : '#000000'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke={isAlert ? '#fef2f2' : '#3b82f6'}
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`p-6 rounded-2xl shadow-lg transition-colors ${isAlert ? 'bg-red-800' : 'bg-white'}`}>
            <h3 className="text-lg font-medium opacity-80">CPU Atual</h3>
            <p className="text-4xl font-bold mt-2">{Math.round(latestCpu)}%</p>
          </div>
          <div className={`p-6 rounded-2xl shadow-lg transition-colors ${isAlert ? 'bg-red-800' : 'bg-white'}`}>
            <h3 className="text-lg font-medium opacity-80">Memória Usada</h3>
            <p className="text-4xl font-bold mt-2">
              {data.length > 0 ? Math.round(data[data.length - 1].memoryUsedMb) : 0} MB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

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
                // Coleta simultanea para otimização do Event Loop
                const [cpuLoad, mem, os, cpuInfo, temp, netStats, fsSize] = await Promise.all([
                    si.currentLoad(),
                    si.mem(),
                    si.osInfo(),
                    si.cpu(),
                    si.cpuTemperature(),
                    si.networkStats(),
                    si.fsSize()
                ]);

                let rxSec = 0;
                let txSec = 0;
                if (netStats && netStats.length > 0) {
                    // Pega a interface de rede ativa que tem tráfego
                    const activeNet = netStats.find(n => n.rx_sec > 0 || n.tx_sec > 0) || netStats[0];
                    rxSec = activeNet.rx_sec / 1024 / 1024; // MB/s
                    txSec = activeNet.tx_sec / 1024 / 1024; // MB/s
                }

                let diskUsedRaw = 0;
                let diskTotalRaw = 0;
                if (fsSize && fsSize.length > 0) {
                    const mainFs = fsSize[0];
                    diskUsedRaw = mainFs.used;
                    diskTotalRaw = mainFs.size;
                }

                const metrics = {
                    // Basics
                    cpu: cpuLoad.currentLoad,
                    memoryUsedMb: mem.active / 1024 / 1024,
                    memoryTotalMb: mem.total / 1024 / 1024,

                    // OS info
                    os: `${os.distro} ${os.release} (${os.platform})`,
                    uptime: si.time().uptime,

                    // Extras CPU
                    cpuName: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
                    cpuCores: cpuInfo.physicalCores,
                    temp: temp.main || -1, // -1 se o SO hospedeiro não oferecer leitura de temperatura hardware

                    // Network & Disk
                    rxSec: rxSec,
                    txSec: txSec,
                    diskUsedPercentage: diskTotalRaw > 0 ? (diskUsedRaw / diskTotalRaw) * 100 : 0,
                    diskTotalGb: diskTotalRaw / 1024 / 1024 / 1024,

                    timestamp: Date.now()
                };

                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(metrics));
            } catch (error) {
                console.error('[Telemetria] Erro ao coletar os dados do sistema', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to collect metrics' }));
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(port, () => {
        console.log(`[Telemetria] Servidor do Agente expandido rodando na porta ${port}${path}`);
    });

    return server;
}

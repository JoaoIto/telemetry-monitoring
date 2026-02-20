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

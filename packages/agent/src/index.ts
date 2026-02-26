import http from 'http';
import si from 'systeminformation';
// @ts-ignore
import snmp from 'net-snmp';

export interface AgentOptions {
    port?: number;
    path?: string;
    snmpPort?: number;
}

export function startAgent(options: AgentOptions = {}) {
    const port = options.port || 9090;
    const path = options.path || '/metrics';
    const snmpPort = options.snmpPort || 1611;

    // ==== 1. SNMP AGENT CONFIGURATION ====
    const agent = snmp.createAgent({ port: snmpPort, disableAuthorization: true }, (err: any) => {
        if (err) console.error('[SNMP] Erro interno:', err);
    });

    const authorizer = agent.getAuthorizer();
    authorizer.addCommunity("public");

    // Providers Registrations (OIDs)
    const oids = {
        cpu: "1.3.6.1.4.1.9999.1.1.0",
        memUsed: "1.3.6.1.4.1.9999.1.2.0",
        memTotal: "1.3.6.1.4.1.9999.1.3.0",
        rxSec: "1.3.6.1.4.1.9999.1.4.0",
        txSec: "1.3.6.1.4.1.9999.1.5.0",
        diskUsed: "1.3.6.1.4.1.9999.1.6.0",
        os: "1.3.6.1.4.1.9999.1.7.0",
    };

    const registerScalar = (name: string, oid: string, type: any, defVal: any) => {
        agent.registerProvider({
            name,
            type: snmp.MibProviderType.Scalar,
            oid: oid.substring(0, oid.length - 2), // Remove .0 for registration
            scalarType: type,
            maxAccess: snmp.MaxAccess['read-only'],
            defVal
        });
    };

    registerScalar("telemetryCpu", oids.cpu, snmp.ObjectType.Integer, 0);
    registerScalar("telemetryMemUsed", oids.memUsed, snmp.ObjectType.Integer, 0);
    registerScalar("telemetryMemTotal", oids.memTotal, snmp.ObjectType.Integer, 0);
    registerScalar("telemetryRx", oids.rxSec, snmp.ObjectType.Integer, 0);
    registerScalar("telemetryTx", oids.txSec, snmp.ObjectType.Integer, 0);
    registerScalar("telemetryDisk", oids.diskUsed, snmp.ObjectType.Integer, 0);
    registerScalar("telemetryOs", oids.os, snmp.ObjectType.OctetString, "Unknown OS");

    const mib = agent.getMib();

    // Background Loop to collect data and update SNMP MIB
    setInterval(async () => {
        try {
            const [cpuLoad, mem, netStats, fsSize, osInfo] = await Promise.all([
                si.currentLoad(), si.mem(), si.networkStats(), si.fsSize(), si.osInfo()
            ]);

            const cpuVal = Math.round(cpuLoad.currentLoad);
            const memUsedMb = Math.round(mem.active / 1024 / 1024);
            const memTotalMb = Math.round(mem.total / 1024 / 1024);

            let rx = 0, tx = 0;
            if (netStats && netStats.length > 0) {
                const activeNet = netStats.find(n => n.rx_sec > 0 || n.tx_sec > 0) || netStats[0];
                // Convert to KB/s for SNMP Integer compatibility
                rx = Math.round(activeNet.rx_sec / 1024);
                tx = Math.round(activeNet.tx_sec / 1024);
            }

            let diskUsed = 0;
            if (fsSize && fsSize.length > 0) {
                diskUsed = Math.round((fsSize[0].used / fsSize[0].size) * 100);
            }

            mib.setScalarValue("telemetryCpu", cpuVal);
            mib.setScalarValue("telemetryMemUsed", memUsedMb);
            mib.setScalarValue("telemetryMemTotal", memTotalMb);
            mib.setScalarValue("telemetryRx", rx);
            mib.setScalarValue("telemetryTx", tx);
            mib.setScalarValue("telemetryDisk", diskUsed);
            mib.setScalarValue("telemetryOs", `${osInfo.distro} ${osInfo.release}`);

        } catch (e) {
            // Ignorar erros na rotina silenciosa
        }
    }, 2000);

    // Helper to read SNMP data via a Client Session (Simulando o Zabbix)
    const getSnmpData = (): Promise<any> => {
        return new Promise((resolve, reject) => {
            const session = snmp.createSession("127.0.0.1", "public", { port: snmpPort });
            const requestedOids = Object.values(oids);

            session.get(requestedOids, (error: any, varbinds: any[]) => {
                if (error) {
                    reject(error);
                } else {
                    const result: any = {};
                    varbinds.forEach((vb: any) => {
                        if (snmp.isVarbindError(vb)) {
                            return; // Skip erros
                        }
                        if (vb.oid === oids.cpu) result.cpu = vb.value;
                        if (vb.oid === oids.memUsed) result.memoryUsedMb = vb.value;
                        if (vb.oid === oids.memTotal) result.memoryTotalMb = vb.value;
                        if (vb.oid === oids.rxSec) result.rxSec = (vb.value as number) / 1024; // De KB para MB
                        if (vb.oid === oids.txSec) result.txSec = (vb.value as number) / 1024;
                        if (vb.oid === oids.diskUsed) result.diskUsedPercentage = vb.value;
                        if (vb.oid === oids.os) result.os = vb.value.toString();
                    });

                    session.close();
                    resolve(result);
                }
            });
        });
    };

    // ==== 2. HTTP SERVER ====
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Rota 1: HTTP Polling Direto
        if (req.method === 'GET' && req.url === path) {
            try {
                const [cpuLoad, mem, os, cpuInfo, temp, netStats, fsSize] = await Promise.all([
                    si.currentLoad(), si.mem(), si.osInfo(), si.cpu(), si.cpuTemperature(),
                    si.networkStats(), si.fsSize()
                ]);

                let rxSec = 0, txSec = 0;
                if (netStats && netStats.length > 0) {
                    const activeNet = netStats.find(n => n.rx_sec > 0 || n.tx_sec > 0) || netStats[0];
                    rxSec = activeNet.rx_sec / 1024 / 1024;
                    txSec = activeNet.tx_sec / 1024 / 1024;
                }

                let diskUsedRaw = 0, diskTotalRaw = 0;
                if (fsSize && fsSize.length > 0) {
                    diskUsedRaw = fsSize[0].used;
                    diskTotalRaw = fsSize[0].size;
                }

                const metrics = {
                    protocol: 'HTTP Nativo REST',
                    cpu: cpuLoad.currentLoad,
                    memoryUsedMb: mem.active / 1024 / 1024,
                    memoryTotalMb: mem.total / 1024 / 1024,
                    os: `${os.distro} ${os.release} (${os.platform})`,
                    uptime: si.time().uptime,
                    cpuName: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
                    cpuCores: cpuInfo.physicalCores,
                    temp: temp.main || -1,
                    rxSec: rxSec,
                    txSec: txSec,
                    diskUsedPercentage: diskTotalRaw > 0 ? (diskUsedRaw / diskTotalRaw) * 100 : 0,
                    diskTotalGb: diskTotalRaw / 1024 / 1024 / 1024,
                    timestamp: Date.now()
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(metrics));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed' }));
            }
        }
        // Rota 2: Simulando Gerente SNMP fazendo Request via UDP
        else if (req.method === 'GET' && req.url === '/metrics/snmp') {
            try {
                const snmpValues = await getSnmpData();

                // Mantem os extras via OS pra n quebrar as views, mas os dados REAIS vêm do socket SNMP local
                const [cpuInfo, fsSize, temp] = await Promise.all([si.cpu(), si.fsSize(), si.cpuTemperature()]);

                const metrics = {
                    ...snmpValues,
                    protocol: 'SNMP Tradicional (UDP 1611)',
                    uptime: si.time().uptime,
                    cpuName: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
                    cpuCores: cpuInfo.physicalCores,
                    temp: temp.main || -1,
                    diskTotalGb: fsSize && fsSize.length > 0 ? fsSize[0].size / 1024 / 1024 / 1024 : 0,
                    timestamp: Date.now()
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(metrics));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Falha ao buscar dados no Agente SNMP (UDP)' }));
            }
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(port, () => {
        console.log(`[Telemetria] Servidor HTTP na porta ${port}`);
        console.log(`[Telemetria] Agente SNMP Verdadeiro na porta UDP ${snmpPort}`);
    });

    return server;
}

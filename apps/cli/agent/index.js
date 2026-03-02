"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAgent = startAgent;
const http_1 = __importDefault(require("http"));
const systeminformation_1 = __importDefault(require("systeminformation"));
// @ts-ignore
const net_snmp_1 = __importDefault(require("net-snmp"));
function startAgent(options = {}) {
    const port = options.port || 9090;
    const path = options.path || '/metrics';
    const snmpPort = options.snmpPort || 1611;
    // ==== 1. SNMP AGENT CONFIGURATION ====
    const agent = net_snmp_1.default.createAgent({ port: snmpPort, disableAuthorization: true }, (err) => {
        if (err)
            console.error('[SNMP] Erro interno:', err);
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
    const registerScalar = (name, oid, type, defVal) => {
        agent.registerProvider({
            name,
            type: net_snmp_1.default.MibProviderType.Scalar,
            oid: oid.substring(0, oid.length - 2), // Remove .0 for registration
            scalarType: type,
            maxAccess: net_snmp_1.default.MaxAccess['read-only'],
            defVal
        });
    };
    registerScalar("telemetryCpu", oids.cpu, net_snmp_1.default.ObjectType.Integer, 0);
    registerScalar("telemetryMemUsed", oids.memUsed, net_snmp_1.default.ObjectType.Integer, 0);
    registerScalar("telemetryMemTotal", oids.memTotal, net_snmp_1.default.ObjectType.Integer, 0);
    registerScalar("telemetryRx", oids.rxSec, net_snmp_1.default.ObjectType.Integer, 0);
    registerScalar("telemetryTx", oids.txSec, net_snmp_1.default.ObjectType.Integer, 0);
    registerScalar("telemetryDisk", oids.diskUsed, net_snmp_1.default.ObjectType.Integer, 0);
    registerScalar("telemetryOs", oids.os, net_snmp_1.default.ObjectType.OctetString, "Unknown OS");
    const mib = agent.getMib();
    // ==== UNIFIED METRIC CACHE ====
    // Calling si.currentLoad() multiple times concurrently breaks its calculation 
    // because it measures the delta since the *last* call. We must collect once and share.
    let cachedMetrics = {
        cpu: 0,
        memoryUsedMb: 0,
        memoryTotalMb: 0,
        rxSec: 0,
        txSec: 0,
        diskUsedPercentage: 0,
        diskTotalGb: 0,
        os: 'Unknown',
        uptime: 0,
        cpuName: 'Unknown',
        cpuCores: 0,
        temp: -1
    };
    // Background Loop to collect data and update both SNMP MIB and HTTP Cache
    setInterval(() => __awaiter(this, void 0, void 0, function* () {
        try {
            const [cpuLoad, mem, netStats, fsSize, osInfo, cpuInfo, temp] = yield Promise.all([
                systeminformation_1.default.currentLoad(), systeminformation_1.default.mem(), systeminformation_1.default.networkStats(), systeminformation_1.default.fsSize(), systeminformation_1.default.osInfo(), systeminformation_1.default.cpu(), systeminformation_1.default.cpuTemperature()
            ]);
            const cpuVal = cpuLoad.currentLoad;
            const memUsedMb = mem.active / 1024 / 1024;
            const memTotalMb = mem.total / 1024 / 1024;
            let rx = 0, tx = 0, rxKb = 0, txKb = 0;
            if (netStats && netStats.length > 0) {
                const totalRx = netStats.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0);
                const totalTx = netStats.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0);
                rx = totalRx / 1024 / 1024; // MB/s for HTTP
                tx = totalTx / 1024 / 1024;
                rxKb = Math.round(totalRx / 1024); // KB/s for SNMP Integer
                txKb = Math.round(totalTx / 1024);
            }
            let diskPercentage = 0, diskTotalGb = 0;
            if (fsSize && fsSize.length > 0) {
                diskPercentage = (fsSize[0].used / fsSize[0].size) * 100;
                diskTotalGb = fsSize[0].size / 1024 / 1024 / 1024;
            }
            // Update Global Cache for HTTP
            cachedMetrics = {
                cpu: cpuVal,
                memoryUsedMb: memUsedMb,
                memoryTotalMb: memTotalMb,
                rxSec: rx,
                txSec: tx,
                diskUsedPercentage: diskPercentage,
                diskTotalGb: diskTotalGb,
                os: `${osInfo.distro} ${osInfo.release} (${osInfo.platform})`,
                uptime: systeminformation_1.default.time().uptime,
                cpuName: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
                cpuCores: cpuInfo.physicalCores,
                temp: temp.main || -1
            };
            // Update Local SNMP MIB
            mib.setScalarValue("telemetryCpu", Math.round(cpuVal));
            mib.setScalarValue("telemetryMemUsed", Math.round(memUsedMb));
            mib.setScalarValue("telemetryMemTotal", Math.round(memTotalMb));
            mib.setScalarValue("telemetryRx", rxKb);
            mib.setScalarValue("telemetryTx", txKb);
            mib.setScalarValue("telemetryDisk", Math.round(diskPercentage));
            mib.setScalarValue("telemetryOs", `${osInfo.distro} ${osInfo.release}`);
        }
        catch (e) {
            // Ignorar erros na rotina silenciosa
        }
    }), 2000);
    // Helper to read SNMP data via a Client Session (Simulando o Zabbix no Frontend)
    const getSnmpData = () => {
        return new Promise((resolve, reject) => {
            const session = net_snmp_1.default.createSession("127.0.0.1", "public", { port: snmpPort });
            const requestedOids = Object.values(oids);
            session.get(requestedOids, (error, varbinds) => {
                if (error) {
                    reject(error);
                }
                else {
                    const result = {};
                    varbinds.forEach((vb) => {
                        if (net_snmp_1.default.isVarbindError(vb)) {
                            return; // Skip erros
                        }
                        if (vb.oid === oids.cpu)
                            result.cpu = vb.value;
                        if (vb.oid === oids.memUsed)
                            result.memoryUsedMb = vb.value;
                        if (vb.oid === oids.memTotal)
                            result.memoryTotalMb = vb.value;
                        if (vb.oid === oids.rxSec)
                            result.rxSec = vb.value / 1024; // De KB para MB
                        if (vb.oid === oids.txSec)
                            result.txSec = vb.value / 1024;
                        if (vb.oid === oids.diskUsed)
                            result.diskUsedPercentage = vb.value;
                        if (vb.oid === oids.os)
                            result.os = vb.value.toString();
                    });
                    session.close();
                    resolve(result);
                }
            });
        });
    };
    // ==== 2. HTTP SERVER ====
    const server = http_1.default.createServer((req, res) => __awaiter(this, void 0, void 0, function* () {
        res.setHeader('Access-Control-Allow-Origin', '*');
        // Rota 1: HTTP Polling Direto (Consome o Cache)
        if (req.method === 'GET' && req.url === path) {
            try {
                const metrics = Object.assign(Object.assign({}, cachedMetrics), { protocol: 'HTTP Nativo REST', timestamp: Date.now() });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(metrics));
            }
            catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed' }));
            }
        }
        // Rota 2: Proxy Gerente SNMP (Lê do Socket UDP real, mas pega extras visuais do Cache)
        else if (req.method === 'GET' && req.url === '/metrics/snmp') {
            try {
                const snmpValues = yield getSnmpData();
                const metrics = Object.assign(Object.assign({}, snmpValues), { protocol: 'SNMP Tradicional (UDP 1611)', uptime: cachedMetrics.uptime, cpuName: cachedMetrics.cpuName, cpuCores: cachedMetrics.cpuCores, temp: cachedMetrics.temp, diskTotalGb: cachedMetrics.diskTotalGb, timestamp: Date.now() });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(metrics));
            }
            catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Falha ao buscar dados no Agente SNMP (UDP)' }));
            }
        }
        else {
            res.writeHead(404);
            res.end();
        }
    }));
    server.listen(port, () => {
        console.log(`[Telemetria] Servidor HTTP na porta ${port}`);
        console.log(`[Telemetria] Agente SNMP Verdadeiro na porta UDP ${snmpPort}`);
    });
    return server;
}

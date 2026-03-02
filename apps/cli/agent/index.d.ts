import http from 'http';
export interface AgentOptions {
    port?: number;
    path?: string;
    snmpPort?: number;
}
export declare function startAgent(options?: AgentOptions): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;

// Messages between the API and the shop-PC agent over the WebSocket at
// /api/agent/ws. Every message is a JSON object with a `type`. The Go agent
// (apps/agent/protocol.go) mirrors these shapes, so change both together.

export const PROTOCOL_VERSION = 1;

export interface AgentPrinter {
  name: string;
  status: 'ready' | 'offline' | 'paper_out' | 'jammed' | 'error' | 'busy';
  isDefault: boolean;
}

/** Agent → server */
export type AgentMessage =
  | { type: 'hello'; version: string; os: string; hostname: string; printers: AgentPrinter[] }
  | { type: 'printers'; printers: AgentPrinter[] }
  | { type: 'job.accepted'; jobId: string }
  | { type: 'job.printing'; jobId: string }
  | { type: 'job.printed'; jobId: string }
  | { type: 'job.failed'; jobId: string; error: string }
  | { type: 'ping' };

export interface JobOrder {
  jobId: string;
  printer: string;
  copies: number;
  color: boolean;
  pages: number;
  fileName: string;
  /** Path on the API, fetched with the agent's own bearer token. */
  fileUrl: string;
  pickupCode: string;
}

/** Server → agent */
export type ServerMessage =
  | { type: 'welcome'; deviceId: string; shopName: string; shopCode: string }
  | { type: 'job'; job: JobOrder } // test pages use the same shape with a jobId starting 'test-'
  | { type: 'pong' }
  | { type: 'error'; error: string };

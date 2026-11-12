// Messages between the API and the shop-PC agent over the WebSocket at
// /api/agent/ws. Every message is a JSON object with a `type`. The Go agent
// (apps/agent/protocol.go) mirrors these shapes, so change both together.

export const PROTOCOL_VERSION = 1;

export interface AgentPrinter {
  name: string;
  status: 'ready' | 'offline' | 'paper_out' | 'jammed' | 'error' | 'busy';
  isDefault: boolean;
  /** Windows reports this printer can print both sides. */
  duplex?: boolean;
  /** Paper trays the driver names, e.g. "Tray 1", "Manual Feed". */
  trays?: string[];
}

/** Agent → server */
export type AgentMessage =
  | { type: 'hello'; version: string; os: string; hostname: string; printers: AgentPrinter[] }
  | { type: 'printers'; printers: AgentPrinter[] }
  | { type: 'job.accepted'; jobId: string }
  | { type: 'job.printing'; jobId: string }
  | { type: 'job.printed'; jobId: string }
  /** Still printing, with a note for the shop, e.g. a tray ran out and the next one took over. */
  | { type: 'job.waiting'; jobId: string; error: string }
  /** code 'paper_out': nothing printed, so another printer may take it. */
  | { type: 'job.failed'; jobId: string; error: string; code?: string }
  | { type: 'ping' };

export interface JobOrder {
  jobId: string;
  printer: string;
  copies: number;
  color: boolean;
  duplex: boolean;
  kind?: 'photo';
  /** Photos: 'A4', or '4x6' for the driver's own photo paper. */
  paper?: string;
  /** Trays in order of preference. Empty = the printer decides. */
  trays?: string[];
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

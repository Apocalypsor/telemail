export interface FetchedHeaderBlock {
  uid: number;
  header: ArrayBuffer;
}

export interface ImapMailbox {
  path: string;
  flags: string[];
}

export interface ImapLiteral {
  prefix: string;
  bytes: Uint8Array;
}

export interface ImapResponse {
  lines: string[];
  literals: ImapLiteral[];
}

export interface ImapStreamReader {
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel(reason?: unknown): Promise<void>;
}

import { connect } from "cloudflare:sockets";
import type {
  FetchedHeaderBlock,
  ImapLiteral,
  ImapMailbox,
  ImapResponse,
  ImapStreamReader,
} from "@worker/clients/imap/types";
import {
  formatUidSet,
  indexOfCrlf,
  parseFetchUid,
  parseFlags,
  parseListLine,
  parseLiteralLength,
  parseSearchResponse,
  quoteImapString,
  toArrayBuffer,
} from "@worker/clients/imap/utils";
import type { Account } from "@worker/types";

export class WorkerImapClient {
  private readonly reader: ImapStreamReader;
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private buffer = new Uint8Array(0);
  private tagSeq = 1;

  private constructor(private readonly socket: Socket) {
    this.reader = socket.readable.getReader() as ImapStreamReader;
    this.writer = socket.writable.getWriter();
  }

  static async connect(account: Account): Promise<WorkerImapClient> {
    const host = account.imap_host?.trim();
    const port = account.imap_port;
    const user = account.imap_user?.trim();
    const pass = account.imap_pass;
    if (!host || !port || !user || !pass) {
      throw new Error(`IMAP account ${account.id} is missing connection data`);
    }

    const socket = connect(
      { hostname: host, port },
      {
        allowHalfOpen: false,
        secureTransport: account.imap_secure ? "on" : "off",
      },
    );
    await socket.opened;

    const client = new WorkerImapClient(socket);
    const greeting = await client.readLine();
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) {
      await client.close();
      throw new Error(`IMAP server rejected connection: ${greeting}`);
    }

    if (!/^\* PREAUTH\b/i.test(greeting)) {
      await client.commandOk(
        `LOGIN ${quoteImapString(user)} ${quoteImapString(pass)}`,
      );
    }
    return client;
  }

  async logout(): Promise<void> {
    await this.command("LOGOUT").catch(() => null);
    await this.close();
  }

  async close(): Promise<void> {
    await this.writer.close().catch(() => null);
    await this.reader.cancel().catch(() => null);
    await this.socket.close().catch(() => null);
  }

  async selectMailbox(folder: string): Promise<void> {
    await this.commandOk(`SELECT ${quoteImapString(folder)}`);
  }

  async listMailboxes(): Promise<ImapMailbox[]> {
    const response = await this.commandOk('LIST "" "*"');
    return response.lines
      .map(parseListLine)
      .filter((mailbox): mailbox is ImapMailbox => mailbox !== null);
  }

  async createMailbox(folder: string): Promise<void> {
    await this.commandOk(`CREATE ${quoteImapString(folder)}`);
  }

  async search(criteria: string): Promise<number[]> {
    const response = await this.commandOk(`UID SEARCH ${criteria}`);
    return parseSearchResponse(response.lines);
  }

  async fetchHeaderBlocks(uids: number[]): Promise<FetchedHeaderBlock[]> {
    if (uids.length === 0) return [];
    const response = await this.commandOk(
      `UID FETCH ${formatUidSet(uids)} (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT FROM TO DATE)])`,
    );
    const order = new Map(uids.map((uid, index) => [uid, index]));
    return response.literals
      .map((literal) => {
        const uid = parseFetchUid(literal.prefix);
        if (uid === null) return null;
        return { uid, header: toArrayBuffer(literal.bytes) };
      })
      .filter((block): block is FetchedHeaderBlock => block !== null)
      .sort((a, b) => (order.get(a.uid) ?? 0) - (order.get(b.uid) ?? 0));
  }

  async fetchRaw(uid: number): Promise<ArrayBuffer> {
    const response = await this.commandOk(`UID FETCH ${uid} (UID BODY.PEEK[])`);
    const literal = response.literals.find((item) =>
      /\bBODY(?:\[\]|\[)/i.test(item.prefix),
    );
    if (!literal)
      throw new Error(`IMAP FETCH returned no raw body for UID ${uid}`);
    return toArrayBuffer(literal.bytes);
  }

  async fetchFlags(uid: number): Promise<string[]> {
    const response = await this.commandOk(`UID FETCH ${uid} (UID FLAGS)`);
    for (const line of response.lines) {
      const flags = parseFlags(line);
      if (flags) return flags;
    }
    return [];
  }

  async addFlags(uids: number[], flags: string[]): Promise<void> {
    if (uids.length === 0) return;
    await this.commandOk(
      `UID STORE ${formatUidSet(uids)} +FLAGS.SILENT (${flags.join(" ")})`,
    );
  }

  async removeFlags(uids: number[], flags: string[]): Promise<void> {
    if (uids.length === 0) return;
    await this.commandOk(
      `UID STORE ${formatUidSet(uids)} -FLAGS.SILENT (${flags.join(" ")})`,
    );
  }

  async moveToFolder(uid: number, folder: string): Promise<void> {
    try {
      await this.commandOk(`UID MOVE ${uid} ${quoteImapString(folder)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/\b(BAD|NO)\b/i.test(message)) throw err;
      await this.commandOk(`UID COPY ${uid} ${quoteImapString(folder)}`);
      await this.addFlags([uid], ["\\Deleted"]);
      await this.commandOk("EXPUNGE");
    }
  }

  async deleteUid(uid: number): Promise<void> {
    await this.addFlags([uid], ["\\Deleted"]);
    await this.commandOk("EXPUNGE");
  }

  private async commandOk(command: string): Promise<ImapResponse> {
    const { response, statusLine } = await this.command(command);
    if (!/^[A-Z0-9]+ OK\b/i.test(statusLine)) {
      throw new Error(`IMAP command failed: ${command}; ${statusLine}`);
    }
    return response;
  }

  private async command(
    command: string,
  ): Promise<{ response: ImapResponse; statusLine: string }> {
    const tag = `A${String(this.tagSeq++).padStart(4, "0")}`;
    await this.writer.write(this.encoder.encode(`${tag} ${command}\r\n`));

    const lines: string[] = [];
    const literals: ImapLiteral[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);

      const literalLength = parseLiteralLength(line);
      if (literalLength !== null) {
        literals.push({
          prefix: line,
          bytes: await this.readBytes(literalLength),
        });
      }

      if (line.startsWith(`${tag} `)) {
        return { response: { lines, literals }, statusLine: line };
      }
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      const index = indexOfCrlf(this.buffer);
      if (index >= 0) {
        const lineBytes = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        return this.decoder.decode(lineBytes);
      }
      await this.readMore();
    }
  }

  private async readBytes(count: number): Promise<Uint8Array> {
    while (this.buffer.length < count) {
      await this.readMore();
    }
    const bytes = this.buffer.slice(0, count);
    this.buffer = this.buffer.slice(count);
    return bytes;
  }

  private async readMore(): Promise<void> {
    const result = await this.reader.read();
    if (result.done) throw new Error("IMAP socket closed");
    const next = new Uint8Array(this.buffer.length + result.value.length);
    next.set(this.buffer);
    next.set(result.value, this.buffer.length);
    this.buffer = next;
  }
}

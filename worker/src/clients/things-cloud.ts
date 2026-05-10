import { http } from "@worker/clients/http";

const DEFAULT_ENDPOINT = "https://cloud.culturedcode.com";
const THINGS_USER_AGENT = "ThingsMac/32209501";
const THINGS_SCHEMA = "301";
const APP_ID = "com.culturedcode.ThingsMac";
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface ThingsCloudConfig {
  email: string;
  password: string;
  appInstanceId: string;
  endpoint?: string;
}

export interface ThingsTodoInput {
  id?: string;
  title: string;
  notes?: string;
  when?: Date;
  timeZone?: string;
}

interface VerifyResponse {
  "history-key"?: string;
}

interface ItemsResponse {
  schema?: number;
  "current-item-index"?: number;
  "latest-total-content-size"?: number;
}

interface CommitResponse {
  "server-head-index"?: number;
}

interface WireNote {
  _t: "tx";
  ch: number;
  v: string;
  t: 1;
}

interface WireExtension {
  sn: Record<string, never>;
  _t: "oo";
}

interface TaskCreatePayload {
  tp: number;
  sr: number | null;
  dds: number | null;
  rt: string[];
  rmd: number | null;
  ss: number;
  tr: boolean;
  dl: string[];
  icp: boolean;
  st: number;
  ar: string[];
  tt: string;
  do: number;
  lai: number | null;
  tir: number | null;
  tg: string[];
  agr: string[];
  ix: number;
  cd: number;
  lt: boolean;
  icc: number;
  md: number | null;
  ti: number;
  dd: number | null;
  ato: number | null;
  nt: WireNote;
  icsd: number | null;
  pr: string[];
  rp: string | null;
  acrd: number | null;
  sp: number | null;
  sb: number;
  rr: null;
  xx: WireExtension;
}

interface WriteEnvelope {
  t: 0;
  e: "Task6";
  p: TaskCreatePayload;
}

interface SyncedHistory {
  id: string;
  latestServerIndex: number;
}

function endpointUrl(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

function encodeBase64Ascii(value: string): string {
  return btoa(value);
}

function thingsClientInfoHeader(): string {
  return encodeBase64Ascii(
    JSON.stringify({
      dm: "MacBookPro18,3",
      lr: "US",
      nf: true,
      nk: true,
      nn: "ThingsMac",
      nv: "32209501",
      on: "macOS",
      ov: "15.7.3",
      pl: "en-US",
      ul: "en-Latn-US",
    }),
  );
}

function commonHeaders(): Record<string, string> {
  return {
    "User-Agent": THINGS_USER_AGENT,
    Accept: "application/json",
    "Accept-Charset": "UTF-8",
    "Accept-Language": "en-US,en;q=0.9",
    "Things-Client-Info": thingsClientInfoHeader(),
  };
}

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  if (value === 0n) return "1";

  let encoded = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    encoded = BASE58_ALPHABET[mod] + encoded;
    value /= 58n;
  }
  return encoded;
}

export function generateThingsUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base58Encode(bytes);
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export function generateThingsAppInstanceId(): string {
  return `${randomHex(63)}-${APP_ID}-${randomHex(63)}`;
}

export async function deriveThingsUuid(
  secret: string,
  namespace: string,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${secret}:${namespace}`),
  );
  return base58Encode(new Uint8Array(bytes).slice(0, 16));
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(value: string): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function textNote(value: string): WireNote {
  return { _t: "tx", ch: value ? crc32(value) : 0, v: value, t: 1 };
}

function extension(): WireExtension {
  return { sn: {}, _t: "oo" };
}

function nowTimestamp(): number {
  return Date.now() / 1000;
}

function partsInTimeZone(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

function thingsSchedule(
  date: Date | undefined,
  timeZone: string | undefined,
): { scheduledDate: number | null; alarmOffset: number | null } {
  if (!date) return { scheduledDate: null, alarmOffset: null };
  const parts = partsInTimeZone(date, timeZone || "UTC");
  const scheduledDate = Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 1000,
  );
  const alarmOffset = parts.hour * 60 * 60 + parts.minute * 60 + parts.second;
  return { scheduledDate, alarmOffset };
}

function createTaskPayload(input: ThingsTodoInput): TaskCreatePayload {
  const { scheduledDate, alarmOffset } = thingsSchedule(
    input.when,
    input.timeZone,
  );
  const schedule = scheduledDate == null ? 0 : 1;
  return {
    tp: 0,
    sr: scheduledDate,
    dds: null,
    rt: [],
    rmd: null,
    ss: 0,
    tr: false,
    dl: [],
    icp: false,
    st: schedule,
    ar: [],
    tt: input.title,
    do: 0,
    lai: null,
    tir: scheduledDate,
    tg: [],
    agr: [],
    ix: 0,
    cd: nowTimestamp(),
    lt: false,
    icc: 0,
    md: null,
    ti: 0,
    dd: null,
    ato: alarmOffset,
    nt: textNote(input.notes ?? ""),
    icsd: null,
    pr: [],
    rp: null,
    acrd: null,
    sp: null,
    sb: 0,
    rr: null,
    xx: extension(),
  };
}

export class ThingsCloudClient {
  private readonly endpoint: string;
  private readonly email: string;
  private readonly password: string;
  private readonly appInstanceId: string;

  constructor(config: ThingsCloudConfig) {
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.email = config.email;
    this.password = config.password;
    this.appInstanceId = config.appInstanceId;
  }

  async verify(): Promise<VerifyResponse> {
    return await http
      .get(
        endpointUrl(
          this.endpoint,
          `/version/1/account/${encodeURIComponent(this.email)}`,
        ),
        {
          headers: {
            ...commonHeaders(),
            Authorization: `Password ${this.password}`,
          },
        },
      )
      .json<VerifyResponse>();
  }

  async ownSyncedHistory(): Promise<SyncedHistory> {
    const account = await this.verify();
    const historyKey = account["history-key"];
    if (!historyKey)
      throw new Error("Things Cloud response has no history key");

    const items = await http
      .get(
        endpointUrl(this.endpoint, `/version/1/history/${historyKey}/items`),
        {
          headers: commonHeaders(),
          searchParams: { "start-index": "0" },
        },
      )
      .json<ItemsResponse>();

    return {
      id: historyKey,
      latestServerIndex: items["current-item-index"] ?? 0,
    };
  }

  async createTodo(input: ThingsTodoInput): Promise<string> {
    const history = await this.ownSyncedHistory();
    const id = input.id ?? generateThingsUuid();
    const envelope: WriteEnvelope = {
      t: 0,
      e: "Task6",
      p: createTaskPayload(input),
    };
    const body: Record<string, WriteEnvelope> = { [id]: envelope };
    const response = await http
      .post(
        endpointUrl(this.endpoint, `/version/1/history/${history.id}/commit`),
        {
          headers: {
            ...commonHeaders(),
            "Content-Type": "application/json; charset=UTF-8",
            "Content-Encoding": "UTF-8",
            Schema: THINGS_SCHEMA,
            "Push-Priority": "5",
            "App-Instance-Id": this.appInstanceId,
            "App-Id": APP_ID,
          },
          searchParams: {
            "ancestor-index": String(history.latestServerIndex),
            _cnt: "1",
          },
          json: body,
        },
      )
      .json<CommitResponse>();
    if (typeof response["server-head-index"] !== "number") {
      throw new Error("Things Cloud commit response has no server head index");
    }
    return id;
  }
}

import {
  APP_ID,
  BASE58_ALPHABET,
  THINGS_USER_AGENT,
} from "@worker/clients/things-cloud/constants";
import type {
  TaskCreatePayload,
  ThingsTodoInput,
  WireExtension,
  WireNote,
} from "@worker/clients/things-cloud/types";

export const endpointUrl = (endpoint: string, path: string): string => {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
};

const encodeBase64Ascii = (value: string): string => {
  return btoa(value);
};

const thingsClientInfoHeader = (): string => {
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
};

export const commonHeaders = (): Record<string, string> => {
  return {
    "User-Agent": THINGS_USER_AGENT,
    Accept: "application/json",
    "Accept-Charset": "UTF-8",
    "Accept-Language": "en-US,en;q=0.9",
    "Things-Client-Info": thingsClientInfoHeader(),
  };
};

const base58Encode = (bytes: Uint8Array): string => {
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
};

export const generateThingsUuid = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base58Encode(bytes);
};

const randomHex = (length: number): string => {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
};

export const generateThingsAppInstanceId = (): string => {
  return `${randomHex(63)}-${APP_ID}-${randomHex(63)}`;
};

export const deriveThingsUuid = async (
  secret: string,
  namespace: string,
): Promise<string> => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${secret}:${namespace}`),
  );
  return base58Encode(new Uint8Array(bytes).slice(0, 16));
};

const getCrcTable = (): Uint32Array => {
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
};

const crc32 = (value: string): number => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const textNote = (value: string): WireNote => {
  return { _t: "tx", ch: value ? crc32(value) : 0, v: value, t: 1 };
};

const extension = (): WireExtension => {
  return { sn: {}, _t: "oo" };
};

const nowTimestamp = (): number => {
  return Date.now() / 1000;
};

const partsInTimeZone = (
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} => {
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
};

const thingsSchedule = (
  date: Date | undefined,
  timeZone: string | undefined,
): { scheduledDate: number | null; alarmOffset: number | null } => {
  if (!date) return { scheduledDate: null, alarmOffset: null };
  const parts = partsInTimeZone(date, timeZone || "UTC");
  const scheduledDate = Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 1000,
  );
  const alarmOffset = parts.hour * 60 * 60 + parts.minute * 60 + parts.second;
  return { scheduledDate, alarmOffset };
};

export const createTaskPayload = (
  input: ThingsTodoInput,
): TaskCreatePayload => {
  const { scheduledDate, alarmOffset } = thingsSchedule(
    input.when,
    input.timeZone,
  );
  const todayParts = input.today
    ? partsInTimeZone(new Date(), input.timeZone || "UTC")
    : null;
  const todayDate = todayParts
    ? Math.floor(
        Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) / 1000,
      )
    : null;
  const scheduleDate = scheduledDate ?? todayDate;
  const schedule = scheduleDate == null ? 0 : 1;
  return {
    tp: 0,
    sr: scheduleDate,
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
    tir: scheduleDate,
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
};
let crcTable: Uint32Array | null = null;

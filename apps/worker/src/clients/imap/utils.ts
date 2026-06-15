import type { ImapMailbox } from "@worker/clients/imap/types";

export const quoteImapString = (value: string): string => {
  if (/[\r\n]/.test(value)) throw new Error("Invalid IMAP string");
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

export const parseLiteralLength = (line: string): number | null => {
  const match = line.match(/\{(\d+)\}\s*$/);
  return match ? Number(match[1]) : null;
};

export const parseSearchResponse = (lines: string[]): number[] => {
  const uids: number[] = [];
  for (const line of lines) {
    const match = line.match(/^\* SEARCH(?:\s+(.+))?$/i);
    if (!match) continue;
    const raw = match[1]?.trim();
    if (!raw) continue;
    for (const part of raw.split(/\s+/)) {
      const uid = Number(part);
      if (Number.isInteger(uid) && uid > 0) uids.push(uid);
    }
  }
  return uids;
};

export const parseFetchUid = (line: string): number | null => {
  const match = line.match(/\bUID\s+(\d+)\b/i);
  if (!match) return null;
  const uid = Number(match[1]);
  return Number.isInteger(uid) && uid > 0 ? uid : null;
};

export const parseFlags = (line: string): string[] | null => {
  const match = line.match(/\bFLAGS\s+\(([^)]*)\)/i);
  if (!match) return null;
  const raw = match[1]?.trim();
  return raw ? raw.split(/\s+/) : [];
};

export const parseListLine = (line: string): ImapMailbox | null => {
  const match = line.match(
    /^\* LIST \(([^)]*)\) (?:"(?:\\.|[^"\\])*"|NIL) (.+)$/i,
  );
  if (!match) return null;
  const name = decodeImapString(match[2]?.trim() ?? "");
  if (!name) return null;
  const rawFlags = match[1]?.trim();
  return {
    path: name,
    flags: rawFlags ? rawFlags.split(/\s+/) : [],
  };
};

export const formatUidSet = (uids: number[]): string => {
  return uids.join(",");
};

export const indexOfCrlf = (bytes: Uint8Array): number => {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10) return i;
  }
  return -1;
};

export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

const decodeImapString = (raw: string): string => {
  if (!raw.startsWith('"')) return raw;
  let result = "";
  for (let i = 1; i < raw.length - 1; i++) {
    const char = raw[i];
    if (char === "\\" && i + 1 < raw.length - 1) {
      result += raw[i + 1];
      i++;
      continue;
    }
    result += char;
  }
  return result;
};

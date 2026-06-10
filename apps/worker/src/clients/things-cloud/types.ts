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
  today?: boolean;
  timeZone?: string;
}

export interface VerifyResponse {
  "history-key"?: string;
}

export interface ItemsResponse {
  schema?: number;
  "current-item-index"?: number;
  "latest-total-content-size"?: number;
}

export interface CommitResponse {
  "server-head-index"?: number;
}

export interface WireNote {
  _t: "tx";
  ch: number;
  v: string;
  t: 1;
}

export interface WireExtension {
  sn: Record<string, never>;
  _t: "oo";
}

export interface TaskCreatePayload {
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

export interface WriteEnvelope {
  t: 0;
  e: "Task6";
  p: TaskCreatePayload;
}

export interface SyncedHistory {
  id: string;
  latestServerIndex: number;
}

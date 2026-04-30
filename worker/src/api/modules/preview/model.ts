import { t } from "elysia";

export const PreviewBody = t.Object({
  html: t.Optional(t.String()),
});
export type PreviewBody = typeof PreviewBody.static;

export const PreviewResponse = t.Object({
  result: t.String(),
  length: t.Number(),
});
export type PreviewResponse = typeof PreviewResponse.static;

export const JunkCheckBody = t.Object({
  subject: t.Optional(t.String()),
  body: t.Optional(t.String()),
});
export type JunkCheckBody = typeof JunkCheckBody.static;

export const JunkCheckResponse = t.Object({
  isJunk: t.Boolean(),
  junkConfidence: t.Number(),
  summary: t.String(),
  tags: t.Array(t.String()),
});
export type JunkCheckResponse = typeof JunkCheckResponse.static;

export const ProxyQuery = t.Object({
  url: t.String(),
  sig: t.String(),
});

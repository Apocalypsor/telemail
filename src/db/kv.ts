import { MAIL_HTML_CACHE_TTL } from '../constants';
import type { Env } from '../types';

// ─── Key helpers ────────────────────────────────────────────────────────────

function kvAccessTokenKey(accountId: number): string {
	return `access_token:${accountId}`;
}

function kvHistoryIdKey(accountId: number): string {
	return `history_id:${accountId}`;
}

// ─── History ID ─────────────────────────────────────────────────────────────

export async function getHistoryId(env: Env, accountId: number): Promise<string | null> {
	return env.EMAIL_KV.get(kvHistoryIdKey(accountId));
}

export async function putHistoryId(env: Env, accountId: number, historyId: string): Promise<void> {
	await env.EMAIL_KV.put(kvHistoryIdKey(accountId), historyId);
}

export async function deleteHistoryId(env: Env, accountId: number): Promise<void> {
	await env.EMAIL_KV.delete(kvHistoryIdKey(accountId));
}

// ─── Access Token Cache ─────────────────────────────────────────────────────

export async function getCachedAccessToken(env: Env, accountId: number): Promise<string | null> {
	return env.EMAIL_KV.get(kvAccessTokenKey(accountId));
}

export async function putCachedAccessToken(env: Env, accountId: number, token: string, ttlSeconds: number): Promise<void> {
	await env.EMAIL_KV.put(kvAccessTokenKey(accountId), token, {
		expirationTtl: ttlSeconds,
	});
}

// ─── Mail HTML Cache ────────────────────────────────────────────────────────

function kvMailHtmlKey(gmailMessageId: string): string {
	return `mail_html:${gmailMessageId}`;
}

export async function getCachedMailHtml(env: Env, gmailMessageId: string): Promise<string | null> {
	return env.EMAIL_KV.get(kvMailHtmlKey(gmailMessageId));
}

export async function putCachedMailHtml(env: Env, gmailMessageId: string, html: string): Promise<void> {
	await env.EMAIL_KV.put(kvMailHtmlKey(gmailMessageId), html, {
		expirationTtl: MAIL_HTML_CACHE_TTL,
	});
}


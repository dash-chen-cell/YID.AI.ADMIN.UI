import { err, ok, type ResultAsync } from 'neverthrow';
import type { AppError } from '$lib/types';
import { beginRequest, endRequest } from '$lib/stores/loading';

const BASE = '/api';
const TIMEOUT_MS = 30_000;

function mapStatus(status: number, message: string): AppError {
	if (status === 401 || status === 403) return { type: 'auth', reason: 'invalid' };
	if (status >= 400 && status < 500) return { type: 'api', status: '4xx', message };
	return { type: 'api', status: '5xx', message };
}

async function request<T>(path: string, init: RequestInit = {}, silent = false): Promise<ResultAsync<T, AppError>> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	// silent = caller shows its own loading UI (page skeleton / section spinner),
	// so don't also trigger the global top progress bar.
	if (!silent) beginRequest();
	try {
		const res = await fetch(`${BASE}${path}`, {
			...init,
			signal: ctrl.signal,
			credentials: 'same-origin'
		});
		clearTimeout(timer);
		if (!res.ok) {
			const msg = await res.text().catch(() => `HTTP ${res.status}`);
			return err(mapStatus(res.status, msg));
		}
		if (res.status === 204) return ok(undefined as T);
		const data = await res.json().catch(() => null);
		return ok(data as T);
	} catch (e) {
		clearTimeout(timer);
		if (e instanceof DOMException && e.name === 'AbortError')
			return err({ type: 'api', status: 'network', message: 'Request timeout' });
		return err({ type: 'api', status: 'network', message: String(e) });
	} finally {
		if (!silent) endRequest();
	}
}

// opts.silent: caller renders its own loading UI (skeleton/section spinner),
// so suppress the global top progress bar. Use for page-first-load and
// section reloads; omit for background/secondary requests.
type ReqOpts = { silent?: boolean };

export function apiGet<T>(path: string, opts: ReqOpts = {}): Promise<ResultAsync<T, AppError>> {
	return request<T>(path, {}, opts.silent);
}

export function apiPost<T>(path: string, body?: unknown, opts: ReqOpts = {}): Promise<ResultAsync<T, AppError>> {
	return request<T>(path, {
		method: 'POST',
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	}, opts.silent);
}

export function apiPatch<T>(path: string, body?: unknown, opts: ReqOpts = {}): Promise<ResultAsync<T, AppError>> {
	return request<T>(path, {
		method: 'PATCH',
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	}, opts.silent);
}

export function apiPut<T>(path: string, body?: unknown, opts: ReqOpts = {}): Promise<ResultAsync<T, AppError>> {
	return request<T>(path, {
		method: 'PUT',
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	}, opts.silent);
}

export function apiDelete<T>(path: string, body?: unknown, opts: ReqOpts = {}): Promise<ResultAsync<T, AppError>> {
	return request<T>(path, {
		method: 'DELETE',
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	}, opts.silent);
}

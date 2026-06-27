// ── Error types ──────────────────────────────────────────────────────────────

export type AppError =
	| { type: 'api'; status: '4xx' | '5xx' | 'network'; message: string; code?: string }
	| { type: 'auth'; reason: 'expired' | 'invalid' }
	| { type: 'validation'; message: string };

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AdminSession {
	authenticated: boolean;
	lang: string;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface User {
	username: string;
	display_name: string | null;
	email: string | null;
	role: 'admin' | 'user';
	disabled: boolean;
	created_at: string;
}

// ── Tokens ───────────────────────────────────────────────────────────────────

export interface Token {
	token_id: string;
	user: string;
	scopes: string[];
	ttl_days: number;
	issued_at: string;
	expires_at: string;
	note: string | null;
	revoked: boolean;
}

export interface IssuedToken extends Token {
	raw_token: string;
}

// ── Devices ───────────────────────────────────────────────────────────────────

export interface Device {
	device_id: string;
	user: string;
	device_name: string;
	status: 'pending' | 'approved' | 'rejected' | 'revoked';
	allowed_ip: string | null;
	requested_at: string;
	reviewed_at: string | null;
	note: string | null;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditEvent {
	id: string;
	event_type: string;
	actor: string | null;
	target_user: string | null;
	target_id: string | null;
	ip_address: string | null;
	details: string | null;        // JSON string from token service
	created_at: string;
}

// ── Models ────────────────────────────────────────────────────────────────────

export interface Model {
	name: string;
	alias: string;
	purpose: string[];
	size_gb: number | null;
	hf_repo: string;
	hf_file: string;
	local_name: string;
	port: string | null;
	downloaded: boolean;
	running: boolean;
	service: string;
	dl_status: '' | 'downloading' | 'done' | 'error';
	dl_pct: number;
	dl_msg: string;
}

export interface ModelSlots {
	[port: string]: Model[];
}

export interface DownloadProgress {
	status: 'downloading' | 'done' | 'error';
	pct: number;
	msg: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NtfyUser {
	username: string;
	role: 'admin' | 'user';
	topics: Record<string, string>;
}

export interface NtfyTopics {
	[name: string]: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
	user_count: number;
	active_user_count: number;
	pending_device_count: number;
	active_token_count: number;
	recent_audit: AuditEvent[];
}

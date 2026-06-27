import { writable, derived } from 'svelte/store';
import { apiPost, apiGet } from '$lib/api/client';

export type AdminRole = 'super_admin' | 'ops_admin' | 'user_admin' | 'viewer';

export const ROLE_LEVEL: Record<AdminRole, number> = {
	super_admin: 0,
	ops_admin:   1,
	user_admin:  2,
	viewer:      3,
};

export function hasRole(userRole: AdminRole | null, minRole: AdminRole): boolean {
	if (!userRole) return false;
	return ROLE_LEVEL[userRole] <= ROLE_LEVEL[minRole];
}

interface AuthState {
	authenticated: boolean;
	checking: boolean;
	username: string | null;
	role: AdminRole | null;
}

interface AuthConfig {
	teleport_enabled: boolean;
	teleport_url: string;
	oidc_enabled: boolean;
	oidc_issuer: string;
	oidc_end_session_url: string;
}

const _state = writable<AuthState>({ authenticated: false, checking: true, username: null, role: null });
export const authConfig = writable<AuthConfig | null>(null);

export const authState = { subscribe: _state.subscribe };
export const isAuthenticated = derived(_state, ($s) => $s.authenticated);
export const isCheckingAuth = derived(_state, ($s) => $s.checking);
export const currentUser = derived(_state, ($s) => $s.username);
export const currentRole = derived(_state, ($s) => $s.role);

export async function checkAuth(): Promise<void> {
	const [authResult, cfgResult] = await Promise.all([
		apiGet<{ authenticated: boolean; username: string | null; role: AdminRole | null }>('/auth/me'),
		apiGet<AuthConfig>('/auth/oidc/config'),
	]);
	authResult.match(
		(data) => _state.set({ authenticated: data.authenticated, checking: false, username: data.username, role: data.role ?? null }),
		() => _state.set({ authenticated: false, checking: false, username: null, role: null })
	);
	cfgResult.match(
		(data) => authConfig.set(data),
		() => {}
	);
}

export async function startOidcLogin(): Promise<void> {
	const result = await apiGet<{ url: string }>('/auth/oidc/start');
	result.match(
		(data) => { window.location.href = data.url; },
		() => {}
	);
}

export async function login(
	password: string,
	username?: string
): Promise<{ ok: boolean; error?: string }> {
	const body = username ? { username, password } : { password };
	const result = await apiPost<{ ok: boolean; username?: string }>('/auth/login', body);
	return result.match(
		(data) => {
			if (data.ok) _state.update((s) => ({ ...s, authenticated: true, username: data.username ?? null }));
			return { ok: true };
		},
		(e) => ({ ok: false, error: e.type === 'auth' ? 'Invalid credentials' : 'Login failed' })
	);
}

export async function logout(): Promise<void> {
	await apiPost('/auth/logout');
	_state.set({ authenticated: false, checking: false, username: null, role: null });
}

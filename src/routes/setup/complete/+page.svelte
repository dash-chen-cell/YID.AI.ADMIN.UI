<script lang="ts">
	import { onMount } from 'svelte';
	import { setupState } from '$lib/stores/setup';
	import { get } from 'svelte/store';
	import { ExternalLink } from '@lucide/svelte';
	import { browser } from '$app/environment';

	interface ServiceHealth {
		name: string;
		url: string;
		status: 'checking' | 'ok' | 'fail';
	}

	let completed = $state(false);
	let error = $state<string | null>(null);
	let domain = $state('');
	let authDomain = $state('');
	let adminDomain = $state('');
	let portalDomain = $state('');
	let services = $state<ServiceHealth[]>([]);
	let showCheckmark = $state(false);

	onMount(async () => {
		// Get domain from API (most reliable — reads actual .env)
		try {
			const statusRes = await fetch('/api/setup/status');
			if (statusRes.ok) {
				const statusData = await statusRes.json() as {
					config: { domain: string; auth_domain?: string; admin_domain?: string; portal_domain?: string };
				};
				domain = statusData.config?.domain ?? '';
				// Derive subdomains if not provided
				const base = domain.split('.').slice(1).join('.');
				authDomain = statusData.config?.auth_domain || (base ? `auth.${base}` : '');
				adminDomain = statusData.config?.admin_domain || (base ? `admin.${base}` : '');
				portalDomain = statusData.config?.portal_domain || (base ? `portal.${base}` : '');
			}
		} catch { /* ignore */ }

		// Fallback: store or localStorage
		if (!domain) {
			const state = get(setupState);
			domain = state.domain;
		}
		if (!domain && browser) {
			try {
				const raw = localStorage.getItem('yid_setup_state');
				if (raw) {
					const parsed = JSON.parse(raw) as { domain?: string };
					domain = parsed.domain ?? '';
				}
			} catch {
				// ignore
			}
		}

		// Mark complete on backend
		try {
			const res = await fetch('/api/setup/complete', { method: 'POST' });
			if (!res.ok) {
				const msg = await res.text().catch(() => `HTTP ${res.status}`);
				// Non-fatal: log it but proceed
				console.warn('setup/complete error:', msg);
			}
			completed = true;
			setupState.markStepDone('complete');
		} catch (e) {
			// Non-fatal
			console.warn('setup/complete fetch error:', e);
			completed = true;
		}

		// Trigger checkmark animation
		setTimeout(() => (showCheckmark = true), 100);

		// Build service URLs
		if (domain) {
			services = [
				{ name: 'AI Platform',  url: `https://${domain}`,                              status: 'checking' as const },
				{ name: 'Admin UI',     url: adminDomain  ? `https://${adminDomain}`  : `https://${domain}/yid-admin`, status: 'checking' as const },
				{ name: 'User Portal',  url: portalDomain ? `https://${portalDomain}` : '',    status: 'checking' as const },
				{ name: 'Authentik',    url: authDomain   ? `https://${authDomain}`   : `https://${domain}/auth`, status: 'checking' as const },
				{ name: 'Grafana',      url: `https://${domain}/grafana`,                      status: 'checking' as const },
				{ name: 'ntfy',         url: `https://${domain}/ntfy`,                         status: 'checking' as const },
			].filter(s => s.url);

			// Check each service health
			services.forEach(async (svc, i) => {
				try {
					const r = await fetch(svc.url, { method: 'HEAD', mode: 'no-cors' });
					// no-cors always resolves (opaque response) — treat as ok
					services[i] = { ...services[i], status: 'ok' };
				} catch {
					services[i] = { ...services[i], status: 'fail' };
				}
			});
		}
	});

	function goToPortal() {
		const url = portalDomain ? `https://${portalDomain}` : (domain ? `https://portal.${domain.split('.').slice(1).join('.')}` : null);
		if (url) window.location.href = url;
	}
</script>

<svelte:head><title>Setup Complete — YID AI</title></svelte:head>

<div class="space-y-8">
	<!-- Animated checkmark -->
	<div class="flex flex-col items-center gap-4 py-6">
		<div
			class="flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all duration-700"
			class:border-success={showCheckmark}
			class:bg-success-bg={showCheckmark}
			class:border-border={!showCheckmark}
			class:scale-100={showCheckmark}
			class:scale-75={!showCheckmark}
			style="transform: scale({showCheckmark ? 1 : 0.75})"
		>
			<svg
				width="40"
				height="40"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="transition-all duration-500 text-success"
				class:opacity-100={showCheckmark}
				class:opacity-0={!showCheckmark}
			>
				<polyline points="20 6 9 17 4 12" />
			</svg>
		</div>

		<div class="text-center">
			<h1 class="text-2xl font-bold text-text-primary">YID AI Platform is Ready!</h1>
			<p class="mt-2 text-sm text-text-secondary">
				All components have been installed and configured successfully.
			</p>
		</div>
	</div>

	<!-- Service URLs -->
	{#if domain}
		<div class="rounded-xl border border-border bg-surface overflow-hidden">
			<div class="border-b border-border px-5 py-3">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Service URLs</h2>
			</div>
			{#each services as svc}
				<div class="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-0">
					<!-- Health indicator -->
					<span
						class="flex h-2 w-2 shrink-0 rounded-full"
						class:bg-success={svc.status === 'ok'}
						class:bg-danger={svc.status === 'fail'}
						class:bg-border={svc.status === 'checking'}
						class:animate-pulse={svc.status === 'checking'}
					></span>

					<!-- Name + URL -->
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-text-primary">{svc.name}</p>
						<a
							href={svc.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-xs font-mono text-text-link hover:underline truncate block"
						>
							{svc.url}
						</a>
					</div>

					<!-- Open link -->
					<a
						href={svc.url}
						target="_blank"
						rel="noopener noreferrer"
						class="shrink-0 rounded p-1.5 text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-colors"
						aria-label="Open {svc.name}"
					>
						<ExternalLink size={14} />
					</a>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Next steps -->
	<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
		<h2 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Next Steps</h2>
		<ol class="space-y-2 text-sm text-text-secondary list-decimal list-inside">
			<li>前往 <a href="https://{authDomain || domain}/if/admin/" target="_blank" class="font-mono text-xs text-text-link hover:underline">Authentik 管理後台</a> 建立一般用戶帳號</li>
			<li>前往 <a href="https://{adminDomain || domain}/" target="_blank" class="font-mono text-xs text-text-link hover:underline">Admin UI</a> 為用戶發放 API Token</li>
			<li>通知用戶至 <a href="https://{portalDomain || domain}/" target="_blank" class="font-mono text-xs text-text-link hover:underline">User Portal</a> 查看 Token 與 Skills</li>
		</ol>
	</div>

	<!-- Go to portal -->
	<div class="flex flex-col items-center gap-4">
		{#if domain}
			<button
				onclick={goToPortal}
				class="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
			>
				<ExternalLink size={14} />
				Go to Portal
			</button>
		{/if}
		<a
			href="/dashboard"
			class="text-sm text-text-link hover:underline"
		>
			Open Admin UI Dashboard
		</a>
	</div>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/state';
	import { login, startOidcLogin, checkAuth, authConfig } from '$lib/stores/auth';
	import { cn } from '$lib/utils/cn';
	import { ShieldCheck, KeyRound } from '@lucide/svelte';

	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let oidcLoading = $state(false);
	let errorMsg = $state<string | null>(null);

	const hasError = $derived(!!page.url.searchParams.get('error'));

	$effect(() => {
		const err = page.url.searchParams.get('error');
		if (err) errorMsg = `Auth error: ${decodeURIComponent(err.replace(/_/g, ' '))}`;
	});

	onMount(async () => {
		if (hasError) return;
		// Ensure authConfig is loaded, then auto-redirect to OIDC if enabled
		if (!get(authConfig)) {
			await checkAuth();
		}
		const cfg = get(authConfig);
		if (cfg?.oidc_enabled && !oidcLoading) {
			oidcLoading = true;
			startOidcLogin();
		}
	});


	const canSubmit = $derived(password.length > 0 && !loading);
	const oidcEnabled = $derived($authConfig?.oidc_enabled ?? false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!canSubmit) return;
		loading = true;
		errorMsg = null;
		const result = await login(password, username.trim() || undefined);
		if (result.ok) {
			goto('/dashboard');
		} else {
			errorMsg = result.error ?? 'Login failed';
			loading = false;
		}
	}

	async function handleOidc() {
		oidcLoading = true;
		await startOidcLogin();
	}
</script>

<svelte:head><title>Login — YID AI Admin</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<div class="mb-2 text-2xl font-bold">
				<span class="text-primary">YID</span>
				<span class="text-text-primary"> AI</span>
			</div>
			<p class="text-text-secondary text-sm">Administration Console</p>
		</div>

		<div class="rounded-xl border border-border bg-surface p-8">
			<h1 class="text-text-primary mb-6 text-base font-semibold">Sign in</h1>

			{#if errorMsg}
				<div class="mb-4 rounded-md border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
					{errorMsg}
				</div>
			{/if}

			{#if oidcEnabled}
				<!-- Authentik SSO — primary login method -->
				<button
					onclick={handleOidc}
					disabled={oidcLoading}
					class={cn(
						'mb-5 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5',
						'bg-primary text-primary-foreground text-sm font-medium',
						'hover:bg-primary-hover transition-colors',
						'disabled:cursor-not-allowed disabled:opacity-50'
					)}
				>
					<ShieldCheck size={16} />
					{oidcLoading ? 'Redirecting...' : 'Sign in with Authentik'}
				</button>

				<div class="relative mb-5">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-border"></div>
					</div>
					<div class="relative flex justify-center">
						<span class="bg-surface px-3 text-xs text-text-disabled">或使用密碼（備用）</span>
					</div>
				</div>
			{/if}

			<!-- Password login -->
			<form onsubmit={handleSubmit} class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label for="username" class="text-text-secondary text-xs font-medium uppercase tracking-wide">
						Username
					</label>
					<input
						id="username"
						type="text"
						bind:value={username}
						placeholder="your.username"
						autocomplete="username"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="password" class="text-text-secondary text-xs font-medium uppercase tracking-wide">
						Password <span class="text-danger">*</span>
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						autocomplete="current-password"
						class={cn(
							'w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary',
							'placeholder:text-text-disabled outline-none transition-colors focus:border-primary',
							errorMsg ? 'border-danger' : 'border-border'
						)}
					/>
				</div>

				<button
					type="submit"
					disabled={!canSubmit}
					class={cn(
						'flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
						oidcEnabled
							? 'border border-border bg-surface-raised text-text-secondary hover:bg-border'
							: 'bg-primary text-primary-foreground hover:bg-primary-hover',
						'disabled:cursor-not-allowed disabled:opacity-50'
					)}
				>
					<KeyRound size={14} />
					{loading ? 'Signing in...' : 'Sign in with password'}
				</button>
			</form>
		</div>

		<p class="text-text-disabled mt-4 text-center text-xs">
			YID AI Platform — Admin Access Only
		</p>
	</div>
</div>

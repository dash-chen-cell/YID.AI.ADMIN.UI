<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { setupState } from '$lib/stores/setup';
	import { Eye, EyeOff, Upload } from '@lucide/svelte';

	let domain = $state('');
	let companyName = $state('');
	let lanSubnet = $state('192.168.0.0/16');
	let hfToken = $state('');
	let showToken = $state(false);
	let alreadyConfigured = $state(false);

	onMount(async () => {
		try {
			const res = await fetch('/api/setup/status');
			if (res.ok) {
				const data = await res.json() as {
					config_done: boolean;
					config: { domain: string; company_name: string; lan_subnet: string };
				};
				if (data.config_done) {
					alreadyConfigured = true;
					domain = data.config.domain;
					companyName = data.config.company_name;
					lanSubnet = data.config.lan_subnet || '192.168.0.0/16';
				}
			}
		} catch { /* ignore */ }
	});

	let logoFile = $state<File | null>(null);
	let logoPreview = $state<string | null>(null);

	let submitting = $state(false);
	let error = $state<string | null>(null);
	let domainError = $state<string | null>(null);

	const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

	function validateDomain() {
		if (!domain.trim()) {
			domainError = 'Domain is required';
			return false;
		}
		if (!DOMAIN_RE.test(domain.trim())) {
			domainError = 'Enter a valid domain (e.g. ai.yid.office.tw)';
			return false;
		}
		domainError = null;
		return true;
	}

	function onLogoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		logoFile = file;
		if (file) {
			const reader = new FileReader();
			reader.onload = (ev) => {
				logoPreview = ev.target?.result as string ?? null;
			};
			reader.readAsDataURL(file);
		} else {
			logoPreview = null;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!validateDomain()) return;

		submitting = true;
		error = null;

		try {
			// Upload logo first if selected
			if (logoFile) {
				const form = new FormData();
				form.append('logo', logoFile);
				const logoRes = await fetch('/api/setup/upload-logo', { method: 'POST', body: form });
				if (!logoRes.ok) {
					const msg = await logoRes.text().catch(() => `HTTP ${logoRes.status}`);
					throw new Error(`Logo upload failed: ${msg}`);
				}
			}

			// Submit config
			const configBody: Record<string, string> = {
				domain: domain.trim(),
				company_name: companyName.trim(),
				lan_subnet: lanSubnet.trim(),
			};
			if (hfToken.trim()) configBody.hf_token = hfToken.trim();

			const configRes = await fetch('/api/setup/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(configBody),
			});
			if (!configRes.ok) {
				const msg = await configRes.text().catch(() => `HTTP ${configRes.status}`);
				throw new Error(`Config failed: ${msg}`);
			}

			// Persist domain to store
			setupState.setDomain(domain.trim());
			setupState.markStepDone('config');

			goto('/setup/secrets');
		} catch (e) {
			error = String(e);
		} finally {
			submitting = false;
		}
	}

	const canSubmit = $derived(domain.trim().length > 0 && companyName.trim().length > 0 && !submitting);
</script>

<svelte:head><title>Configure — YID AI Setup</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold text-text-primary">Platform Configuration</h1>
		<p class="mt-1 text-sm text-text-secondary">
			Configure your YID AI platform's basic settings.
		</p>
	</div>

	{#if alreadyConfigured}
	<div class="rounded-xl border border-success bg-success-bg px-5 py-4 flex items-start justify-between gap-4">
		<div class="flex gap-3">
			<span class="text-base shrink-0">✅</span>
			<div class="text-sm">
				<p class="font-medium text-text-primary">已設定完成</p>
				<p class="text-text-secondary mt-0.5">
					Platform 已設定為 <code class="bg-background px-1 rounded">{domain}</code>。
					可直接跳過此步驟，或修改後重新儲存。
				</p>
			</div>
		</div>
		<button
			onclick={() => goto('/setup/secrets')}
			class="shrink-0 rounded-md bg-success px-4 py-2 text-xs font-medium text-white hover:bg-success/90 transition-colors whitespace-nowrap">
			跳過此步驟 →
		</button>
	</div>
	{/if}

	{#if error}
		<div class="rounded-xl border border-danger bg-danger-bg px-5 py-4">
			<p class="text-sm text-danger">{error}</p>
		</div>
	{/if}

	<form onsubmit={handleSubmit} class="space-y-5">
		<div class="rounded-xl border border-border bg-surface p-6 space-y-5">

			<!-- Domain -->
			<div class="flex flex-col gap-1.5">
				<label for="domain" class="text-xs font-medium uppercase tracking-wide text-text-secondary">
					Public Domain <span class="text-danger">*</span>
				</label>
				<input
					id="domain"
					type="text"
					bind:value={domain}
					onblur={validateDomain}
					placeholder="ai.yid.office.tw"
					autocomplete="off"
					class="w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary transition-colors"
					class:border-danger={domainError}
					class:border-border={!domainError}
				/>
				{#if domainError}
					<p class="text-xs text-danger">{domainError}</p>
				{:else}
					<p class="text-xs text-text-disabled">The public-facing domain for your AI platform (e.g. ai.yid.office.tw)</p>
				{/if}
			</div>

			<!-- Company name -->
			<div class="flex flex-col gap-1.5">
				<label for="company" class="text-xs font-medium uppercase tracking-wide text-text-secondary">
					Company Name <span class="text-danger">*</span>
				</label>
				<input
					id="company"
					type="text"
					bind:value={companyName}
					placeholder="YID Technology"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary transition-colors"
				/>
			</div>

			<!-- LAN subnet -->
			<div class="flex flex-col gap-1.5">
				<label for="subnet" class="text-xs font-medium uppercase tracking-wide text-text-secondary">
					LAN Subnet
				</label>
				<input
					id="subnet"
					type="text"
					bind:value={lanSubnet}
					placeholder="192.168.0.0/16"
					class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary transition-colors"
				/>
				<p class="text-xs text-text-disabled">CIDR notation for your local network</p>
			</div>

			<!-- HuggingFace token -->
			<div class="flex flex-col gap-1.5">
				<label for="hf-token" class="text-xs font-medium uppercase tracking-wide text-text-secondary">
					HuggingFace Token <span class="text-text-disabled">(Optional)</span>
				</label>
				<div class="relative">
					<input
						id="hf-token"
						type={showToken ? 'text' : 'password'}
						bind:value={hfToken}
						placeholder="hf_..."
						autocomplete="off"
						class="w-full rounded-md border border-border bg-background py-2 pl-3 pr-10 font-mono text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary transition-colors"
					/>
					<button
						type="button"
						onclick={() => (showToken = !showToken)}
						class="absolute right-2 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-secondary"
						aria-label={showToken ? 'Hide token' : 'Show token'}
					>
						{#if showToken}
							<EyeOff size={15} />
						{:else}
							<Eye size={15} />
						{/if}
					</button>
				</div>
				<p class="text-xs text-text-disabled">Required to download gated models from HuggingFace</p>
			</div>

			<!-- Logo upload -->
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-medium uppercase tracking-wide text-text-secondary">
					Organization Logo <span class="text-text-disabled">(Optional)</span>
				</span>
				<div class="flex items-center gap-4">
					<label
						for="logo"
						class="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
					>
						<Upload size={14} />
						Choose file
						<input
							id="logo"
							type="file"
							accept="image/png,image/jpeg,image/svg+xml"
							onchange={onLogoChange}
							class="sr-only"
						/>
					</label>
					{#if logoFile}
						<span class="text-xs text-text-secondary truncate max-w-48">{logoFile.name}</span>
					{/if}
					{#if logoPreview}
						<img
							src={logoPreview}
							alt="Logo preview"
							class="h-10 w-auto rounded border border-border object-contain"
						/>
					{/if}
				</div>
				<p class="text-xs text-text-disabled">Accepts PNG, JPG, SVG — max 2 MB</p>
			</div>
		</div>

		<!-- Navigation -->
		<div class="flex items-center justify-between">
			<button
				type="button"
				onclick={() => goto('/setup/preflight')}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
			>
				Back
			</button>
			<button
				type="submit"
				disabled={!canSubmit}
				class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
			>
				{submitting ? 'Saving...' : 'Continue to Secrets'}
			</button>
		</div>
	</form>
</div>

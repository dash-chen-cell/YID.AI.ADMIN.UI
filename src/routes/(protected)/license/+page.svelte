<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { BadgeCheck, AlertTriangle, XCircle, RefreshCw, Key, Trash2 } from '@lucide/svelte';

	interface LicenseStatus {
		edition: string;
		company: string;
		license_id: string;
		max_users: number | null;
		expires_at: string | null;
		days_left: number | null;
		expired: boolean;
		source: 'env' | 'file' | 'trial';
		heartbeat_ok: boolean;
		warning: string | null;
		features: Record<string, boolean | number | string | null>;
	}

	let status = $state<LicenseStatus | null>(null);
	let loading = $state(true);
	let activateDialog = $state<HTMLDialogElement | null>(null);
	let newKey = $state('');
	let activateLoading = $state(false);
	let removeLoading = $state(false);

	const FEATURE_LABELS: Record<string, string> = {
		sso:                'SSO（Authentik）',
		departments:        '多部門 Quota',
		skills_upload:      'Skills 管理上傳',
		portal:             '用戶自助 Portal',
		service_management: '系統服務管理',
		custom_branding:    '品牌自訂',
	};

	const EDITION_COLORS: Record<string, string> = {
		community:  'text-text-secondary',
		trial:      'text-warning',
		business:   'text-primary',
		enterprise: 'text-success',
	};

	const EDITION_LABELS: Record<string, string> = {
		community:  'Community',
		trial:      'Trial（30天試用）',
		business:   'Business',
		enterprise: 'Enterprise',
	};

	onMount(load);

	async function load() {
		loading = true;
		const result = await apiGet<LicenseStatus>('/license');
		result.match(
			(data) => { status = data; },
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}

	async function activate(e: Event) {
		e.preventDefault();
		if (activateLoading || !newKey.trim()) return;
		activateLoading = true;
		const result = await apiPost<{ ok: boolean; license: LicenseStatus }>('/license', { key: newKey.trim() });
		result.match(
			(data) => {
				toast.success(`License activated: ${data.license.edition} edition`);
				status = data.license;
				activateDialog?.close();
				newKey = '';
			},
			(e) => toast.error(errorMessage(e))
		);
		activateLoading = false;
	}

	async function removeLicense() {
		if (!confirm('移除 License Key 後將回復為 30 天試用版。確定繼續？')) return;
		removeLoading = true;
		const result = await apiDelete<{ ok: boolean; license: LicenseStatus }>('/license');
		result.match(
			(data) => { toast.success('License removed, reverted to trial'); status = data.license; },
			(e) => toast.error(errorMessage(e))
		);
		removeLoading = false;
	}

	let heartbeatResetLoading = $state(false);
	async function resetHeartbeat() {
		heartbeatResetLoading = true;
		const result = await apiPost<{ ok: boolean; license: LicenseStatus }>('/license/heartbeat/reset');
		result.match(
			(data) => { toast.success('Heartbeat state reset — features restored'); status = data.license; },
			(e) => toast.error(errorMessage(e))
		);
		heartbeatResetLoading = false;
	}

	function expiryLabel(status: LicenseStatus): string {
		if (!status.expires_at) return '永久授權';
		if (status.expired) return '已到期';
		if (status.days_left !== null && status.days_left <= 7) return `${status.days_left} 天後到期 ⚠️`;
		if (status.days_left !== null) return `${status.days_left} 天後到期`;
		return new Date(status.expires_at).toLocaleDateString('zh-TW');
	}
</script>

<svelte:head><title>License — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">授權管理</h1>
			<p class="mt-1 text-sm text-text-secondary">管理平台授權版本與功能開關。</p>
		</div>
		<div class="flex gap-2">
			<button onclick={load} class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				重新整理
			</button>
			<button onclick={() => { newKey=''; activateDialog?.showModal(); }}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Key size={14} /> 啟用 License
			</button>
		</div>
	</div>

	{#if loading}
		<div class="h-48 animate-pulse rounded-xl border border-border bg-surface"></div>
	{:else if status}
		<!-- Status card -->
		<div class={cn(
			'rounded-xl border p-6 space-y-5',
			status.expired ? 'border-danger bg-danger-bg/20' :
			status.warning ? 'border-warning bg-warning-bg/20' :
			'border-border bg-surface'
		)}>
			<div class="flex items-start justify-between gap-4 flex-wrap">
				<div class="space-y-1">
					<div class="flex items-center gap-2">
						{#if status.expired}
							<XCircle size={20} class="text-danger" />
						{:else if status.warning}
							<AlertTriangle size={20} class="text-warning" />
						{:else}
							<BadgeCheck size={20} class="text-success" />
						{/if}
						<span class={cn('text-xl font-bold', EDITION_COLORS[status.edition] ?? 'text-text-primary')}>
							{EDITION_LABELS[status.edition] ?? status.edition}
						</span>
					</div>
					{#if status.company}
					<p class="text-sm text-text-secondary">授權給：<strong class="text-text-primary">{status.company}</strong></p>
					{/if}
					{#if status.license_id && status.license_id !== 'trial'}
					<p class="text-xs text-text-disabled font-mono">ID: {status.license_id}</p>
					{/if}
				</div>
				<div class="text-right">
					<div class={cn('text-sm font-medium', status.expired ? 'text-danger' : status.warning ? 'text-warning' : 'text-text-secondary')}>
						{expiryLabel(status)}
					</div>
					<div class="text-xs text-text-disabled mt-0.5">
						來源：{status.source === 'trial' ? '試用版（未啟用）' : status.source === 'env' ? '環境變數' : '授權檔案'}
					</div>
				</div>
			</div>

			{#if status.warning}
			<div class="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
				⚠️ {status.warning}
			</div>
			{/if}

			<!-- Features grid -->
			<div>
				<p class="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">功能清單</p>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{#each Object.entries(FEATURE_LABELS) as [key, label]}
					{@const enabled = status.features[key]}
					<div class={cn(
						'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
						enabled ? 'bg-success-bg text-success' : 'bg-surface-raised text-text-disabled'
					)}>
						<span class="text-base">{enabled ? '✅' : '❌'}</span>
						<span class="text-xs">{label}</span>
					</div>
					{/each}

					<!-- User limit -->
					<div class="flex items-center gap-2 rounded-lg bg-primary-subtle px-3 py-2 text-sm text-primary">
						<span class="text-base">👥</span>
						<span class="text-xs">
							{status.max_users === null ? '無限用戶' : `最多 ${status.max_users} 用戶`}
						</span>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-between items-center pt-2 border-t border-border flex-wrap gap-2">
				<!-- Reset heartbeat (shown when heartbeat failed) -->
				{#if !status.heartbeat_ok || status.warning?.includes('server')}
				<button onclick={resetHeartbeat} disabled={heartbeatResetLoading}
					class="flex items-center gap-1.5 rounded-md text-xs text-warning bg-warning-bg hover:bg-warning/20 px-3 py-1.5 transition-colors disabled:opacity-50">
					{heartbeatResetLoading ? '重置中...' : '🔄 重置 Heartbeat 狀態'}
				</button>
				{:else}
				<div></div>
				{/if}

				{#if status.source !== 'trial'}
				<button onclick={removeLicense} disabled={removeLoading}
					class="flex items-center gap-1.5 rounded-md text-xs text-danger hover:bg-danger-bg px-3 py-1.5 transition-colors disabled:opacity-50">
					<Trash2 size={12} />
					{removeLoading ? '移除中...' : '移除 License'}
				</button>
				{/if}
			</div>
		</div>

		<!-- How to get a license -->
		{#if status.source === 'trial' || status.edition === 'community'}
		<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
			<h3 class="text-sm font-semibold text-text-primary">升級授權</h3>
			<div class="grid gap-3 sm:grid-cols-3 text-xs text-text-secondary">
				<div class="rounded-lg bg-background p-3 space-y-1">
					<div class="font-semibold text-text-primary">Community</div>
					<div>5 用戶、基本功能</div>
					<div class="text-success font-medium">免費</div>
				</div>
				<div class="rounded-lg bg-primary-subtle border border-primary/20 p-3 space-y-1">
					<div class="font-semibold text-primary">Business</div>
					<div>50 用戶、SSO、Portal、部門管理</div>
					<div class="text-primary font-medium">聯繫 YID 取得報價</div>
				</div>
				<div class="rounded-lg bg-background p-3 space-y-1">
					<div class="font-semibold text-text-primary">Enterprise</div>
					<div>無限用戶、全功能、專屬支援</div>
					<div class="text-text-secondary font-medium">報價制</div>
				</div>
			</div>
			<p class="text-xs text-text-disabled">
				聯繫 YID Digital 取得正式授權：
				<a href="mailto:yid@yid.com.tw" class="text-text-link hover:underline">yid@yid.com.tw</a>
			</p>
		</div>
		{/if}
	{/if}
</div>

<!-- Activate License Dialog -->
<dialog bind:this={activateDialog}>
	<div class="p-5 border-b border-border flex justify-between items-center">
		<h3 class="text-sm font-semibold text-text-primary">啟用 License Key</h3>
		<button onclick={() => activateDialog?.close()} class="text-text-disabled hover:text-text-primary text-lg">×</button>
	</div>
	<form onsubmit={activate} class="p-5 space-y-4">
		<div>
			<label for="lic-key" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
				License Key <span class="text-danger">*</span>
			</label>
			<textarea
				id="lic-key"
				bind:value={newKey}
				required
				rows={4}
				placeholder="yidlic_..."
				style="font-family:monospace;font-size:11px"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary resize-none"
			></textarea>
			<p class="mt-1 text-xs text-text-disabled">
				License key 以 <code>yidlic_</code> 開頭，由 YID Digital 提供。
			</p>
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" onclick={() => activateDialog?.close()}
				class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">Cancel</button>
			<button type="submit" disabled={activateLoading || !newKey.trim()}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{activateLoading ? '驗證中...' : '啟用授權'}
			</button>
		</div>
	</form>
</dialog>

<style>
dialog {
	background: var(--color-surface); border: 1px solid var(--color-border);
	border-radius: 10px; padding: 0; width: 520px; max-width: 95vw;
	color: var(--color-text-primary); position: fixed;
	top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0;
	box-shadow: 0 8px 32px rgba(0,0,0,.4);
}
dialog::backdrop { background: rgba(0,0,0,.55); }
</style>

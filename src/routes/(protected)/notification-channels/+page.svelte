<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiPut } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/stores/i18n';
	import { get } from 'svelte/store';
	import { marked } from 'marked';
	import { Bell, RefreshCw, Save, Send, CheckCircle, XCircle, BookOpen, AlertTriangle, Plus, Trash2 } from '@lucide/svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface Field {
		key: string;
		label: string;
		type: 'text' | 'url' | 'bool';
		secret: boolean;
		placeholder?: string;
		has_value?: boolean;
	}
	interface Channel {
		name: string;
		label: string;
		doc_anchor: string;
		secret_keys: string[];
		fields: Field[];
		enabled: boolean;
	}
	// webhook-routable providers (topic → URL). Others (telegram/line, ntfy) keep
	// the simple credential/topic model and aren't shown in the routing table.
	const ROUTABLE = ['google_chat', 'slack', 'ntfy'];

	let channels = $state<Channel[]>([]);
	let guideMd = $state('');
	let topics = $state<string[]>([]);
	// routes[provider][topic] = webhook url (or ntfy topic name). '_default' = fallback.
	let routes = $state<Record<string, Record<string, string>>>({});
	let loading = $state(true);
	let saving = $state(false);
	let testing = $state<Record<string, boolean>>({});
	let activeTab = $state<string>('');
	let newTopic = $state('');
	let showGuide = $state(false);

	async function load() {
		loading = true;
		const res = await apiGet<{ channels: Channel[]; guide_md: string; topics: string[]; routes: Record<string, Record<string, string>> }>(
			'/notifications/channels', { silent: true });
		res.match(
			(d) => {
				channels = d.channels || [];
				guideMd = d.guide_md || '';
				topics = d.topics || [];
				routes = d.routes || {};
				// Pre-fill every routable provider's topic cells so `bind:value`
				// always has a defined member expression (avoids reading
				// routes[provider][topic] before init → undefined deref).
				for (const p of ROUTABLE) {
					if (!routes[p]) routes[p] = {};
					for (const topic of [...topics, '_default']) {
						if (routes[p][topic] === undefined) routes[p][topic] = '';
					}
				}
				if (!activeTab && channels.length) activeTab = channels[0].name;
			},
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}
	onMount(load);

	const activeChannel = $derived(channels.find((c) => c.name === activeTab));
	const isRoutable = $derived(ROUTABLE.includes(activeTab));

	function addTopic() {
		const t = newTopic.trim().toLowerCase().replace(/\s+/g, '-');
		if (!t) return;
		// create the cell in every routable provider so bind:value is defined
		for (const p of ROUTABLE) {
			if (!routes[p]) routes[p] = {};
			if (routes[p][t] === undefined) routes[p][t] = '';
		}
		if (!topics.includes(t)) topics = [...topics, t];
		newTopic = '';
	}

	function removeRoute(provider: string, topic: string) {
		if (routes[provider]) routes[provider][topic] = '';
		// also drop the topic from the topic list if it's a custom one
		topics = topics.filter((t) => t !== topic);
	}

	async function saveRouting() {
		saving = true;
		// strip empty url entries so we don't persist blanks
		const clean: Record<string, Record<string, string>> = {};
		for (const [prov, m] of Object.entries(routes)) {
			const kept = Object.fromEntries(Object.entries(m).filter(([, v]) => v && v.trim()));
			if (Object.keys(kept).length) clean[prov] = kept;
		}
		const res = await apiPut('/notifications/routing', { topics, routes: clean });
		res.match(
			() => { toast.success(get(t)('notify_channels.routing_saved', '路由設定已儲存，約 30 秒內生效')); load(); },
			(e) => toast.error(errorMessage(e))
		);
		saving = false;
	}

	async function sendTest(channel: string, topic: string) {
		const tk = `${channel}:${topic}`;
		testing[tk] = true;
		const res = await apiPost<{ results: Record<string, boolean> }>('/notifications/test', { channel, topic });
		res.match(
			(d) => {
				if (d.results?.[channel]) toast.success(get(t)('notify_channels.toast_test_ok', '測試訊息已發送'));
				else toast.error(get(t)('notify_channels.toast_test_fail', '發送失敗，請檢查設定'));
			},
			(e) => toast.error(errorMessage(e))
		);
		testing[tk] = false;
	}

	// Slice the guide markdown to one provider's section and render it.
	function guideFor(anchor: string): string {
		if (!guideMd || !anchor) return '';
		const lines = guideMd.split('\n');
		let start = -1, end = lines.length;
		for (let i = 0; i < lines.length; i++) {
			const m = lines[i].match(/^##\s+.*\{#([\w-]+)\}/);
			if (m) {
				if (m[1] === anchor) start = i;
				else if (start >= 0) { end = i; break; }
			}
		}
		if (start < 0) return '';
		return marked.parse(lines.slice(start, end).join('\n')) as string;
	}

	function limitsFor(anchor: string): string[] {
		if (!guideMd || !anchor) return [];
		const lines = guideMd.split('\n');
		let inSection = false, inLimits = false;
		const out: string[] = [];
		for (const line of lines) {
			const h2 = line.match(/^##\s+.*\{#([\w-]+)\}/);
			if (h2) { inSection = h2[1] === anchor; inLimits = false; continue; }
			if (!inSection) continue;
			if (/^###\s/.test(line)) { inLimits = /限制/.test(line); continue; }
			if (inLimits && /^\s*-\s+/.test(line)) out.push(line.replace(/^\s*-\s+/, '').replace(/\*\*/g, ''));
		}
		return out;
	}

	const enabledCount = $derived(channels.filter((c) => c.enabled).length);
	// rows shown in the routing table: every topic + the _default fallback
	const routingRows = $derived(isRoutable ? [...topics, '_default'] : []);
</script>

<svelte:head><title>{$t('notify_channels.page_title', '通知通道')} — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('notify_channels.title', '通知通道設定')}</h1>
			<p class="mt-1 text-sm text-text-secondary">
				{$t('notify_channels.subtitle', '事件依 topic 路由到各通道；不同角色可訂閱不同 topic')} · {enabledCount} {$t('notify_channels.enabled_count', '個已啟用')}
			</p>
		</div>
		<button onclick={load}
			class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{$t('notify_channels.refresh', '重新整理')}
		</button>
	</div>

	{#if loading}
		<SkeletonCard lines={5} />
	{:else}
		<!-- Provider tabs -->
		<div class="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
			{#each channels as channel}
			<button onclick={() => { activeTab = channel.name; showGuide = false; }}
				class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
					activeTab === channel.name ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
				<Bell size={12} />
				{channel.label}
				{#if channel.enabled}
					<CheckCircle size={11} class={activeTab === channel.name ? 'text-white' : 'text-success'} />
				{/if}
			</button>
			{/each}
		</div>

		{#if activeChannel}
		<div class="rounded-xl border border-border bg-surface">
			<!-- header -->
			<div class="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
				<div class="flex items-center gap-2.5">
					<span class="text-sm font-semibold text-text-primary">{activeChannel.label}</span>
					{#if activeChannel.enabled}
						<span class="flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success"><CheckCircle size={11} /> {$t('notify_channels.enabled', '已啟用')}</span>
					{:else}
						<span class="flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-disabled"><XCircle size={11} /> {$t('notify_channels.disabled', '未設定')}</span>
					{/if}
				</div>
				<button onclick={() => (showGuide = !showGuide)}
					class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-raised">
					<BookOpen size={12} /> {$t('notify_channels.guide', '設定說明')}
				</button>
			</div>

			<div class="px-5 py-4 space-y-4">
				{#if isRoutable}
					<!-- Topic → webhook routing table -->
					<div>
						<p class="text-xs font-medium text-text-secondary mb-2">
							{$t('notify_channels.routing_title', '依 Topic 指派目的地')}
							<span class="text-text-disabled font-normal">— {activeTab === 'ntfy'
								? $t('notify_channels.ntfy_hint', '填 ntfy topic 名稱（不同角色訂閱不同 topic）')
								: $t('notify_channels.webhook_hint', '填各 topic 專屬的 webhook URL，解耦速率限制')}</span>
						</p>
						<div class="space-y-2">
							{#each routingRows as topic}
							<div class="flex items-center gap-2">
								<span class={cn('w-28 shrink-0 text-xs', topic === '_default' ? 'text-warning font-medium' : 'text-text-secondary')}>
									{topic === '_default' ? $t('notify_channels.default_route', '預設（未匹配）') : topic}
								</span>
								<input
									type={activeTab === 'ntfy' ? 'text' : 'url'}
									placeholder={activeTab === 'ntfy' ? 'yid-ai-alerts' : 'https://...'}
									bind:value={routes[activeTab][topic]}
									class="flex-1 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none" />
								<button onclick={() => sendTest(activeTab, topic)}
									disabled={!routes[activeTab]?.[topic] || testing[`${activeTab}:${topic}`]}
									title={$t('notify_channels.test', '測試發送')}
									class="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-40">
									{#if testing[`${activeTab}:${topic}`]}<RefreshCw size={12} class="animate-spin" />{:else}<Send size={12} />{/if}
								</button>
								{#if topic !== '_default'}
								<button onclick={() => removeRoute(activeTab, topic)} title={$t('notify_channels.clear', '清除')}
									class="rounded-md border border-border px-2 py-1.5 text-xs text-text-secondary hover:bg-danger-bg hover:text-danger">
									<Trash2 size={12} />
								</button>
								{/if}
							</div>
							{/each}
						</div>

						<!-- add custom topic -->
						<div class="flex items-center gap-2 mt-3">
							<input bind:value={newTopic} placeholder={$t('notify_channels.new_topic', '新增 topic（如 billing）')}
								onkeydown={(e) => e.key === 'Enter' && addTopic()}
								class="w-56 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none" />
							<button onclick={addTopic} disabled={!newTopic.trim()}
								class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-40">
								<Plus size={12} /> {$t('notify_channels.add_topic', '新增 Topic')}
							</button>
						</div>
					</div>

					<div class="flex justify-end border-t border-border pt-3">
						<button onclick={saveRouting} disabled={saving}
							class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
							{#if saving}<RefreshCw size={14} class="animate-spin" />{:else}<Save size={14} />{/if}
							{$t('notify_channels.save_routing', '儲存路由設定')}
						</button>
					</div>
				{:else}
					<!-- Non-routable providers (telegram/line): credentials live in Secrets -->
					<p class="text-xs text-text-secondary">
						{$t('notify_channels.token_based', '此通道為 token 制，請於 Secrets 頁設定下列金鑰；目前以單一目的地發送（暫不支援 topic 路由）。')}
					</p>
					<ul class="space-y-1">
						{#each activeChannel.fields as field}
						<li class="flex items-center gap-2 text-xs">
							<code class="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">{field.key}</code>
							{#if field.has_value}
								<span class="flex items-center gap-1 text-success"><CheckCircle size={11} /> {$t('notify_channels.set', '已設定')}</span>
							{:else}
								<span class="text-text-disabled">{$t('notify_channels.unset', '未設定')}</span>
							{/if}
						</li>
						{/each}
					</ul>
					<button onclick={() => sendTest(activeTab, 'general')} disabled={!activeChannel.enabled || testing[`${activeTab}:general`]}
						class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-40 w-fit">
						{#if testing[`${activeTab}:general`]}<RefreshCw size={12} class="animate-spin" />{:else}<Send size={12} />{/if}
						{$t('notify_channels.test', '測試發送')}
					</button>
				{/if}

				<!-- Key limitations — always visible -->
				{#if limitsFor(activeChannel.doc_anchor).length > 0}
				<div class="rounded-lg border border-warning/20 bg-warning-bg/40 px-3 py-2">
					<p class="flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle size={11} /> {$t('notify_channels.limits', '限制')}</p>
					<ul class="mt-1 space-y-0.5">
						{#each limitsFor(activeChannel.doc_anchor) as limit}
						<li class="text-xs text-text-secondary">· {limit}</li>
						{/each}
					</ul>
				</div>
				{/if}

				<!-- per-provider guide -->
				{#if showGuide}
				<div class="rounded-lg border border-border bg-surface-raised px-4 py-3">
					<div class="prose prose-sm prose-invert max-w-none markdown-guide">
						{@html guideFor(activeChannel.doc_anchor)}
					</div>
				</div>
				{/if}
			</div>
		</div>
		{/if}
	{/if}
</div>

<style>
	.markdown-guide :global(h1) { display: none; }
	.markdown-guide :global(h2) { font-size: 0.95rem; font-weight: 600; margin: 0.25rem 0 0.4rem; }
	.markdown-guide :global(h3) { font-size: 0.8rem; font-weight: 600; margin: 0.6rem 0 0.3rem; color: var(--color-text-secondary, #94a3b8); }
	.markdown-guide :global(p), .markdown-guide :global(li) { font-size: 0.8rem; line-height: 1.5; }
	.markdown-guide :global(ol), .markdown-guide :global(ul) { padding-left: 1.2rem; margin: 0.3rem 0; }
	.markdown-guide :global(ol) { list-style: decimal; }
	.markdown-guide :global(ul) { list-style: disc; }
	.markdown-guide :global(code) { background: var(--color-surface, #1e293b); padding: 0 0.3em; border-radius: 3px; font-size: 0.75rem; }
	.markdown-guide :global(a) { color: var(--color-primary, #3b82f6); text-decoration: underline; }
	.markdown-guide :global(blockquote) { border-left: 3px solid var(--color-border, #334155); padding-left: 0.75rem; margin: 0.5rem 0; color: var(--color-text-secondary, #94a3b8); }
	.markdown-guide :global(strong) { color: var(--color-text-primary, #e2e8f0); }
</style>

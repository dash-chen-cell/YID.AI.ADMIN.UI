<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import {
		Maximize2, Minimize2, RefreshCw, Cpu, HardDrive, Thermometer,
		Zap, Activity, TrendingUp, Wifi, Plus, Trash2, Server, X,
		LayoutGrid, Container, CheckCircle, XCircle, AlertCircle
	} from '@lucide/svelte';
	import uPlot from 'uplot/dist/uPlot.esm.js';
	import 'uplot/dist/uPlot.min.css';
	import { tick } from 'svelte';

	// ── Types ──────────────────────────────────────────────────────────────────
	interface FleetServer {
		id: string;
		name: string;
		prometheus_url: string;
		labels: Record<string, string>;
		enabled: boolean;
		note: string | null;
	}

	interface WarroomData {
		cpu_percent: number | null;
		mem_used_gb: number | null;
		mem_total_gb: number | null;
		mem_percent: number | null;
		disk_used_gb: number | null;
		disk_total_gb: number | null;
		disk_percent: number | null;
		gpu_util_pct: number | null;
		gpu_mem_used_gb: number | null;
		gpu_mem_total_gb: number | null;
		gpu_mem_percent: number | null;
		gpu_temp_c: number | null;
		gpu_power_w: number | null;
		net_rx_mbps: number;
		net_tx_mbps: number;
		req_per_min: number | null;
		tokens_24h: number | null;
		requests_24h: number | null;
		updated_at: string;
	}

	interface ServerOverview {
		id: string;
		name: string;
		labels: Record<string, string>;
		online: boolean;
		cpu_percent: number | null;
		mem_percent: number | null;
		mem_used_gb: number | null;
		mem_total_gb: number | null;
		gpu_util_pct: number | null;
		gpu_mem_percent: number | null;
		gpu_temp_c: number | null;
		gpu_power_w: number | null;
	}

	interface ContainerStatus {
		id: string;
		name: string;
		container: string;
		status: 'active' | 'inactive' | 'failed' | 'activating' | 'unknown';
	}

	// ── State ──────────────────────────────────────────────────────────────────
	let fleet = $state<FleetServer[]>([]);
	let selectedServerId = $state('local');
	let data = $state<WarroomData | null>(null);
	let loading = $state(true);
	let activeTab = $state<'detail' | 'overview' | 'containers'>('detail');
	let overview = $state<ServerOverview[]>([]);
	let containers = $state<ContainerStatus[]>([]);
	let overviewLoading = $state(false);
	let containersLoading = $state(false);
	let isFullscreen = $state(false);
	let refreshInterval = $state(15);
	let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let lastUpdated = $state('');

	// Time range
	const TIME_RANGES = [
		{ label: '15m', seconds: 900 },
		{ label: '1h',  seconds: 3600 },
		{ label: '6h',  seconds: 21600 },
		{ label: '24h', seconds: 86400 },
		{ label: '7d',  seconds: 604800 },
	];
	let selectedRange = $state(3600); // 1h default

	// Charts state
	let chartInstances: Record<string, uPlot> = {};
	let chartData: Record<string, { times: number[], values: number[] }> = {};
	let chartsLoading = $state(false);
	let chartsReady = $state(false); // DOM mounted

	// Add server dialog
	let showAddServer = $state(false);
	let addName = $state('');
	let addUrl = $state('http://');
	let addNote = $state('');
	let addLoading = $state(false);

	// ── Queries for charts ────────────────────────────────────────────────────
	const CHART_QUERIES = [
		{ id: 'cpu',      label: 'CPU %',        query: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)', unit: '%',   color: '#818cf8', warn: 70, crit: 90 },
		{ id: 'mem',      label: '記憶體 %',     query: '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100', unit: '%', color: '#60a5fa', warn: 70, crit: 90 },
		{ id: 'gpu_util', label: 'GPU 使用率 %', query: 'DCGM_FI_DEV_GPU_UTIL or nvidia_smi_utilization_gpu_ratio * 100', unit: '%', color: '#a78bfa', warn: 70, crit: 90 },
		{ id: 'gpu_mem',  label: 'GPU VRAM %',   query: 'DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_FREE + DCGM_FI_DEV_FB_USED) * 100 or nvidia_smi_memory_used_bytes / nvidia_smi_memory_total_bytes * 100', unit: '%', color: '#f472b6', warn: 70, crit: 90 },
		{ id: 'net_rx',   label: '網路 RX',       query: 'sum(rate(node_network_receive_bytes_total{device!="lo"}[1m])) / 1024 / 1024', unit: ' MB/s', color: '#34d399', warn: -1, crit: -1 },
		{ id: 'gpu_temp', label: 'GPU 溫度',      query: 'DCGM_FI_DEV_GPU_TEMP or nvidia_smi_temperature_gpu', unit: '°C', color: '#fbbf24', warn: 70, crit: 85 },
	];

	// ── Load ──────────────────────────────────────────────────────────────────
	async function loadFleet() {
		const result = await apiGet<FleetServer[]>('/fleet');
		result.match((d) => { fleet = d; }, () => {});
	}

	async function loadOverview() {
		overviewLoading = true;
		const result = await apiGet<ServerOverview[]>('/warroom/overview');
		result.match((d) => { overview = d; }, () => {});
		overviewLoading = false;
	}

	async function loadContainers() {
		containersLoading = true;
		const result = await apiGet<ContainerStatus[]>('/warroom/containers');
		result.match((d) => { containers = d; }, () => {});
		containersLoading = false;
	}

	async function loadMetrics() {
		loading = true;
		const result = await apiGet<WarroomData>(`/warroom?server_id=${selectedServerId}`);
		result.match(
			(d) => {
				data = d;
				lastUpdated = new Date().toLocaleTimeString('zh-TW', { hour12: false });
			},
			() => {}
		);
		loading = false;
	}

	async function loadCharts() {
		chartsLoading = true;
		await tick(); // ensure DOM is rendered before building charts
		const now = Math.floor(Date.now() / 1000);
		const start = now - selectedRange;
		const step = selectedRange <= 900 ? '15s' : selectedRange <= 3600 ? '30s' : selectedRange <= 21600 ? '120s' : selectedRange <= 86400 ? '300s' : '1800s';

		await Promise.all(
			CHART_QUERIES.map(async (q) => {
				const result = await apiGet<{ results: Array<{ values: [number, string][] }> }>(
					`/fleet/${selectedServerId}/query_range?query=${encodeURIComponent(q.query)}&start=${start}&end=${now}&step=${step}`
				);
				result.match(
					(d) => {
						const series = d.results[0]?.values ?? [];
						chartData[q.id] = {
							times: series.map(([t]) => t),
							values: series.map(([, v]) => parseFloat(v) || 0),
						};
					},
					() => {}
				);
			})
		);

		buildCharts();
		chartsLoading = false;
	}

	function buildCharts() {
		if (!chartsReady) return;
		const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
		const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
		const textColor = isDark ? '#94a3b8' : '#64748b';

		for (const q of CHART_QUERIES) {
			const container = document.getElementById(`chart-${q.id}`) as HTMLDivElement | null;
			if (!container) continue;
			const cd = chartData[q.id];
			if (!cd || cd.times.length === 0) continue;

			if (chartInstances[q.id]) {
				chartInstances[q.id].destroy();
				delete chartInstances[q.id];
			}
			container.innerHTML = '';

			const opts: uPlot.Options = {
				width: container.clientWidth || 320,
				height: 110,
				cursor: { sync: { key: 'warroom' } },
				legend: { show: false },
				axes: [
					{
						stroke: textColor,
						grid: { stroke: gridColor, width: 1 },
						ticks: { show: false },
						values: (_u: uPlot, vals: number[]) => vals.map((v: number) => {
							if (!v) return '';
							const d = new Date(v * 1000);
							return selectedRange <= 3600
								? d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
								: d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
						}),
					},
					{
						stroke: textColor,
						grid: { stroke: gridColor, width: 1 },
						size: 50,
						values: (_u: uPlot, vals: (number | null)[]) => vals.map((v: number | null) =>
							v !== null && v !== undefined ? `${v.toFixed(1)}${q.unit}` : ''
						),
					},
				],
				series: [
					{},
					{
						stroke: q.color,
						fill: q.color + '20',
						width: 1.5,
						label: q.label,
					},
				],
			};

			try {
				chartInstances[q.id] = new uPlot(opts, [cd.times, cd.values], container);
			} catch (e) {
				console.warn('uPlot error for', q.id, e);
			}
		}
	}

	function resizeCharts() {
		for (const q of CHART_QUERIES) {
			const container = document.getElementById(`chart-${q.id}`);
			if (container && chartInstances[q.id]) {
				chartInstances[q.id].setSize({ width: container.clientWidth, height: 110 });
			}
		}
	}

	function startAutoRefresh() {
		if (autoRefreshTimer) clearInterval(autoRefreshTimer);
		autoRefreshTimer = setInterval(() => {
			loadMetrics();
			loadCharts();
			if (activeTab === 'overview') loadOverview();
			if (activeTab === 'containers') loadContainers();
		}, refreshInterval * 1000);
	}

	onMount(() => {
		chartsReady = true;
		(async () => {
			await loadFleet();
			await Promise.all([loadMetrics(), loadCharts(), loadOverview(), loadContainers()]);
			startAutoRefresh();
		})();

		document.addEventListener('fullscreenchange', onFullscreenChange);
		window.addEventListener('resize', resizeCharts);
		return () => {
			if (autoRefreshTimer) clearInterval(autoRefreshTimer);
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			window.removeEventListener('resize', resizeCharts);
			Object.values(chartInstances).forEach(c => c.destroy());
		};
	});

	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	async function toggleFullscreen() {
		const el = document.getElementById('warroom-container') ?? document.documentElement;
		if (!document.fullscreenElement) {
			await el.requestFullscreen();
		} else {
			await document.exitFullscreen();
		}
	}

	async function switchServer(id: string) {
		selectedServerId = id;
		data = null;
		loading = true;
		await Promise.all([loadMetrics(), loadCharts()]);
	}

	async function switchTimeRange(seconds: number) {
		selectedRange = seconds;
		await loadCharts();
	}

	async function addServer() {
		if (!addName.trim() || !addUrl.trim()) return;
		addLoading = true;
		const result = await apiPost('/fleet', {
			name: addName.trim(),
			prometheus_url: addUrl.trim(),
			note: addNote.trim() || null,
		});
		result.match(
			() => {
				toast.success(`伺服器 "${addName}" 已加入`);
				showAddServer = false;
				addName = ''; addUrl = 'http://'; addNote = '';
				loadFleet();
			},
			() => toast.error('加入失敗')
		);
		addLoading = false;
	}

	async function removeServer(id: string, name: string) {
		if (!confirm(`移除伺服器 "${name}"？`)) return;
		const result = await apiDelete(`/fleet/${id}`);
		result.match(
			() => {
				toast.success('已移除');
				if (selectedServerId === id) switchServer('local');
				loadFleet();
			},
			() => toast.error('移除失敗')
		);
	}

	// ── Helpers ────────────────────────────────────────────────────────────────
	function pct(v: number | null) { return v ?? 0; }

	function statusColor(v: number | null, warn = 70, crit = 90) {
		if (v === null) return 'text-text-disabled';
		if (v >= crit) return 'text-danger';
		if (v >= warn) return 'text-warning';
		return 'text-success';
	}

	function barColor(v: number | null, warn = 70, crit = 90) {
		if (v === null) return 'bg-border';
		if (v >= crit) return 'bg-danger';
		if (v >= warn) return 'bg-warning';
		return 'bg-success';
	}

	function fmt(v: number | null, unit = '', dec = 1) {
		return v === null ? '—' : v.toFixed(dec) + unit;
	}

	function fmtK(v: number) {
		if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
		if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
		return String(v);
	}

	const selectedServer = $derived(fleet.find(s => s.id === selectedServerId));

	$effect(() => {
		if (activeTab === 'overview' && overview.length === 0) loadOverview();
		if (activeTab === 'containers' && containers.length === 0) loadContainers();
	});
</script>

<svelte:head><title>戰情室 — YID AI</title></svelte:head>

<style>
	#warroom-container:fullscreen {
		background: var(--color-background);
		padding: 1.5rem;
		overflow-y: auto;
	}
</style>

<div id="warroom-container" class="space-y-4">
	<!-- Header -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-xl font-bold text-text-primary">戰情室</h1>
			<p class="text-xs text-text-disabled mt-0.5">
				{selectedServer?.name ?? 'Local Server'}
				{#if lastUpdated}・{lastUpdated}{/if}
			</p>
		</div>
		<div class="flex items-center gap-2 flex-wrap">
			<!-- Server selector -->
			<div class="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
				{#each fleet as s}
				<button
					onclick={() => switchServer(s.id)}
					class={cn(
						'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
						selectedServerId === s.id
							? 'bg-primary text-primary-foreground'
							: 'text-text-secondary hover:bg-surface-raised'
					)}>
					<Server size={11} />
					{s.name}
				</button>
				{/each}
				<button onclick={() => showAddServer = true}
					class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-disabled hover:text-primary hover:bg-surface-raised transition-colors">
					<Plus size={11} />
				</button>
			</div>

			<!-- Time range -->
			<div class="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
				{#each TIME_RANGES as tr}
				<button onclick={() => switchTimeRange(tr.seconds)}
					class={cn(
						'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
						selectedRange === tr.seconds
							? 'bg-primary text-primary-foreground'
							: 'text-text-secondary hover:bg-surface-raised'
					)}>
					{tr.label}
				</button>
				{/each}
			</div>

			<!-- Auto refresh -->
			<select bind:value={refreshInterval} onchange={() => startAutoRefresh()}
				class="rounded-md border border-border bg-background px-2 py-1 text-xs text-text-secondary outline-none">
				<option value={5}>5s</option>
				<option value={15}>15s</option>
				<option value={30}>30s</option>
				<option value={60}>1m</option>
			</select>

			<button onclick={() => { loadMetrics(); loadCharts(); }} disabled={loading || chartsLoading}
				class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-50">
				<RefreshCw size={12} class={(loading || chartsLoading) ? 'animate-spin' : ''} />
			</button>

			<button onclick={toggleFullscreen}
				class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-raised">
				{#if isFullscreen}<Minimize2 size={12} />{:else}<Maximize2 size={12} />{/if}
			</button>
		</div>
	</div>

	<!-- Tab bar -->
	<div class="flex gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
		<button onclick={() => activeTab = 'detail'}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'detail' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			<Activity size={12} /> 詳細
		</button>
		<button onclick={() => activeTab = 'overview'}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'overview' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			<LayoutGrid size={12} /> 多台總覽
		</button>
		<button onclick={() => activeTab = 'containers'}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'containers' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			<Container size={12} /> 容器狀態
		</button>
	</div>

	{#if !data && loading && activeTab === 'detail'}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each [1,2,3,4] as _}
				<div class="h-24 animate-pulse rounded-xl border border-border bg-surface"></div>
			{/each}
		</div>
	{:else if data && activeTab === 'detail'}
		<!-- Instant metrics row -->
		<div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs text-text-secondary uppercase tracking-wide">請求速率</span>
					<Activity size={13} class="text-primary" />
				</div>
				{#if data.req_per_min === null}
				<div class="flex items-center gap-2 text-text-disabled">
					<RefreshCw size={14} class="animate-spin" />
					<span class="text-sm">讀取中</span>
				</div>
				{:else}
				<div class="text-2xl font-bold text-text-primary">{fmt(data.req_per_min, '', 1)}</div>
				<div class="text-xs text-text-disabled mt-0.5">req / min</div>
				{/if}
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs text-text-secondary uppercase tracking-wide">Token（24h）</span>
					<TrendingUp size={13} class="text-info" />
				</div>
				{#if data.tokens_24h === null}
				<div class="flex items-center gap-2 text-text-disabled">
					<RefreshCw size={14} class="animate-spin" />
					<span class="text-sm">讀取中</span>
				</div>
				{:else}
				<div class="text-2xl font-bold text-text-primary">{fmtK(data.tokens_24h)}</div>
				<div class="text-xs text-text-disabled mt-0.5">{fmtK(data.requests_24h ?? 0)} 請求</div>
				{/if}
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs text-text-secondary uppercase tracking-wide">GPU 功耗／溫度</span>
					<Zap size={13} class={statusColor(data.gpu_power_w, 200, 350)} />
				</div>
				<div class={cn('text-2xl font-bold', statusColor(data.gpu_power_w, 200, 350))}>{fmt(data.gpu_power_w, ' W', 0)}</div>
				<div class="text-xs text-text-disabled mt-0.5">{fmt(data.gpu_temp_c, ' °C', 0)}</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs text-text-secondary uppercase tracking-wide">網路 RX / TX</span>
					<Wifi size={13} class="text-success" />
				</div>
				<div class="text-2xl font-bold text-text-primary">{fmt(data.net_rx_mbps, '', 2)}</div>
				<div class="text-xs text-text-disabled mt-0.5">↓ MB/s　↑ {fmt(data.net_tx_mbps, ' MB/s', 2)}</div>
			</div>
		</div>

		<!-- Progress bars row -->
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each [
				{ label: 'CPU', icon: Cpu, pctVal: data.cpu_percent, sub: '', warn: 70, crit: 90 },
				{ label: '記憶體', icon: HardDrive, pctVal: data.mem_percent, sub: `${fmt(data.mem_used_gb,' GB',1)} / ${fmt(data.mem_total_gb,' GB',1)}`, warn: 70, crit: 90 },
				{ label: '磁碟', icon: HardDrive, pctVal: data.disk_percent, sub: `${fmt(data.disk_used_gb,' GB',1)} / ${fmt(data.disk_total_gb,' GB',1)}`, warn: 80, crit: 95 },
				{ label: 'GPU 使用率', icon: Cpu, pctVal: data.gpu_util_pct, sub: '', warn: 70, crit: 90 },
				{ label: 'GPU VRAM', icon: Cpu, pctVal: data.gpu_mem_percent, sub: `${fmt(data.gpu_mem_used_gb,' GB',1)} / ${fmt(data.gpu_mem_total_gb,' GB',1)}`, warn: 70, crit: 90 },
				{ label: 'GPU 溫度', icon: Thermometer, pctVal: data.gpu_temp_c ? data.gpu_temp_c : null, sub: `${fmt(data.gpu_temp_c,' °C',0)}`, warn: 70, crit: 85 },
			] as m}
			<div class="rounded-xl border border-border bg-surface p-4 space-y-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<m.icon size={13} class="text-text-secondary" />
						<span class="text-sm font-medium text-text-primary">{m.label}</span>
					</div>
					<span class={cn('text-base font-bold', statusColor(m.pctVal, m.warn, m.crit))}>
						{m.label === 'GPU 溫度' ? fmt(m.pctVal, ' °C', 0) : fmt(m.pctVal, '%', 1)}
					</span>
				</div>
				<div class="h-1.5 rounded-full bg-border overflow-hidden">
					<div class={cn('h-full rounded-full transition-all duration-500', barColor(m.pctVal, m.warn, m.crit))}
						style="width: {m.label === 'GPU 溫度' ? Math.min(100, (m.pctVal ?? 0)) : pct(m.pctVal)}%"></div>
				</div>
				{#if m.sub}
				<div class="text-xs text-text-disabled">{m.sub}</div>
				{/if}
			</div>
			{/each}
		</div>

		<!-- Time series charts (connected cursor) -->
		<div class="space-y-2">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-text-secondary flex items-center gap-2">
				時間序列
				{#if chartsLoading}<RefreshCw size={11} class="animate-spin" />{/if}
			</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each CHART_QUERIES as q}
				<div class="rounded-xl border border-border bg-surface p-3">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-medium text-text-secondary">{q.label}</span>
						<span class="text-xs font-mono text-text-disabled">{q.unit}</span>
					</div>
					<div id="chart-{q.id}" class="w-full overflow-hidden"></div>
				</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Overview Tab -->
	{#if activeTab === 'overview'}
	<div class="space-y-3">
		{#if overviewLoading && overview.length === 0}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each [1,2,3] as _}
				<div class="h-40 animate-pulse rounded-xl border border-border bg-surface"></div>
				{/each}
			</div>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each overview as s}
				<button onclick={() => { activeTab = 'detail'; switchServer(s.id); }}
					class="rounded-xl border text-left p-4 space-y-3 transition-colors hover:bg-surface-raised {s.online ? 'border-border bg-surface' : 'border-danger/30 bg-danger-bg/20'}">
					<!-- Server header -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class={cn('h-2 w-2 rounded-full', s.online ? 'bg-success' : 'bg-danger')}></div>
							<span class="text-sm font-semibold text-text-primary">{s.name}</span>
						</div>
						{#if s.gpu_power_w !== null}
						<span class="text-xs text-text-disabled">{s.gpu_power_w}W</span>
						{/if}
					</div>
					{#if s.online}
					<!-- Metrics mini bars -->
					<div class="space-y-2">
						{#each [
							{ label: 'CPU', val: s.cpu_percent, warn: 70, crit: 90 },
							{ label: 'RAM', val: s.mem_percent, warn: 70, crit: 90 },
							{ label: 'GPU', val: s.gpu_util_pct, warn: 70, crit: 90 },
							{ label: 'VRAM', val: s.gpu_mem_percent, warn: 70, crit: 90 },
						] as m}
						{#if m.val !== null}
						<div class="flex items-center gap-2">
							<span class="text-xs text-text-disabled w-8 shrink-0">{m.label}</span>
							<div class="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
								<div class={cn('h-full rounded-full transition-all',
									(m.val ?? 0) >= m.crit ? 'bg-danger' :
									(m.val ?? 0) >= m.warn ? 'bg-warning' : 'bg-success'
								)} style="width: {m.val}%"></div>
							</div>
							<span class={cn('text-xs w-10 text-right',
								(m.val ?? 0) >= m.crit ? 'text-danger' :
								(m.val ?? 0) >= m.warn ? 'text-warning' : 'text-success'
							)}>{m.val?.toFixed(1)}%</span>
						</div>
						{/if}
						{/each}
					</div>
					{#if s.gpu_temp_c !== null}
					<div class="flex items-center gap-1 text-xs text-text-disabled">
						<Thermometer size={11} />
						{s.gpu_temp_c}°C
						{#if s.mem_used_gb && s.mem_total_gb}
						<span class="ml-auto">{s.mem_used_gb}G / {s.mem_total_gb}G RAM</span>
						{/if}
					</div>
					{/if}
					{:else}
					<div class="text-xs text-danger py-2">離線 / 連線失敗</div>
					{/if}
				</button>
				{/each}
			</div>
		{/if}
	</div>
	{/if}

	<!-- Containers Tab -->
	{#if activeTab === 'containers'}
	<div class="space-y-3">
		{#if containersLoading && containers.length === 0}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each [1,2,3,4,5,6] as _}
				<div class="h-14 animate-pulse rounded-xl border border-border bg-surface"></div>
				{/each}
			</div>
		{:else}
			{@const running = containers.filter(c => c.status === 'active')}
			{@const stopped = containers.filter(c => c.status !== 'active')}
			<div class="text-xs text-text-secondary">
				<span class="text-success font-medium">{running.length}</span> 運行中 ·
				{#if stopped.length > 0}<span class="text-danger font-medium">{stopped.length}</span> 停止{/if}
			</div>
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each [...containers].sort((a,b) => a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) as c}
				<div class={cn(
					'flex items-center gap-3 rounded-xl border px-4 py-3',
					c.status === 'active' ? 'border-border bg-surface' :
					c.status === 'activating' ? 'border-warning/30 bg-warning-bg/10' :
					'border-danger/30 bg-danger-bg/10'
				)}>
					{#if c.status === 'active'}
						<CheckCircle size={14} class="text-success shrink-0" />
					{:else if c.status === 'activating'}
						<RefreshCw size={14} class="text-warning animate-spin shrink-0" />
					{:else}
						<XCircle size={14} class="text-danger shrink-0" />
					{/if}
					<div class="min-w-0">
						<div class="text-sm font-medium text-text-primary truncate">{c.name}</div>
						<div class="text-xs font-mono text-text-disabled truncate">{c.container}</div>
					</div>
				</div>
				{/each}
			</div>
		{/if}
	</div>
	{/if}
</div>

<!-- Add Server Dialog -->
{#if showAddServer}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => showAddServer = false}
	onkeydown={e => e.key === 'Escape' && (showAddServer = false)}>
	<div class="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary">加入伺服器</h2>
			<button onclick={() => showAddServer = false} class="rounded p-1 text-text-disabled hover:text-text-primary">
				<X size={16} />
			</button>
		</div>
		<div class="p-5 space-y-4">
			<div>
				<label for="fleet-name" class="mb-1 block text-xs font-medium text-text-secondary">名稱</label>
				<input id="fleet-name" bind:value={addName} placeholder="Production Server 01"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
			</div>
			<div>
				<label for="fleet-url" class="mb-1 block text-xs font-medium text-text-secondary">Prometheus URL</label>
				<input id="fleet-url" bind:value={addUrl} placeholder="http://192.168.1.10:9090"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
				<p class="mt-1 text-xs text-text-disabled">支援 VPN 遠端或雲端伺服器</p>
			</div>
			<div>
				<label for="fleet-note" class="mb-1 block text-xs font-medium text-text-secondary">備註（選填）</label>
				<input id="fleet-note" bind:value={addNote} placeholder="台北機房 / GPU: GB202"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
			</div>

			<!-- Existing servers (with remove) -->
			{#if fleet.filter(s => s.id !== 'local').length > 0}
			<div class="border-t border-border pt-3">
				<p class="text-xs text-text-secondary mb-2">已加入的伺服器</p>
				{#each fleet.filter(s => s.id !== 'local') as s}
				<div class="flex items-center justify-between py-1">
					<div>
						<span class="text-xs font-medium text-text-primary">{s.name}</span>
						<span class="ml-2 text-xs font-mono text-text-disabled">{s.prometheus_url}</span>
					</div>
					<button onclick={() => removeServer(s.id, s.name)}
						class="p-1 text-text-disabled hover:text-danger transition-colors">
						<Trash2 size={12} />
					</button>
				</div>
				{/each}
			</div>
			{/if}
		</div>
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={() => showAddServer = false}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				取消
			</button>
			<button onclick={addServer} disabled={!addName.trim() || !addUrl.trim() || addLoading}
				class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if addLoading}<RefreshCw size={13} class="animate-spin" />{:else}<Plus size={13} />{/if}
				加入
			</button>
		</div>
	</div>
</div>
{/if}

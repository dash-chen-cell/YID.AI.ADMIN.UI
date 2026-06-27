<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import { cn } from '$lib/utils/cn';
	import { t } from '$lib/stores/i18n';
	import { RefreshCw, Cpu, Thermometer, Zap, HardDrive } from '@lucide/svelte';

	let { serverId = 'local' }: { serverId?: string } = $props();

	interface Gpu {
		gpu: string;
		util_pct: number;
		mem_used_gb?: number;
		mem_total_gb?: number;
		temp_c?: number;
		power_w?: number;
	}

	let gpus = $state<Gpu[]>([]);
	let loading = $state(true);

	onMount(load);

	async function load() {
		loading = true;
		const result = await apiGet<{ gpus: Gpu[] }>(`/fleet/${serverId}/gpu`);
		result.match((d) => { gpus = d.gpus; }, () => { gpus = []; });
		loading = false;
	}

	function barColor(pct: number) {
		return pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-warning' : 'bg-success';
	}
</script>

<div class="space-y-4">
	<div class="flex justify-end">
		<button onclick={load} class="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{$t('common.refresh', 'Refresh')}
		</button>
	</div>

	{#if loading}
		<div class="h-40 animate-pulse rounded-xl border border-border bg-surface"></div>
	{:else if gpus.length === 0}
		<div class="rounded-xl border border-border bg-surface py-16 text-center text-text-secondary">
			<Cpu size={32} class="mx-auto mb-2" />
			<p class="text-sm">{$t('fleet.no_gpu', '此裝置無 GPU 指標（需 nvidia_gpu_exporter）')}</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2">
			{#each gpus as g}
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<div class="flex items-center gap-2">
					<Cpu size={16} class="text-primary" />
					<span class="text-sm font-semibold text-text-primary">GPU {g.gpu}</span>
				</div>
				<!-- Utilization -->
				<div>
					<div class="flex justify-between text-xs mb-1">
						<span class="text-text-secondary">{$t('fleet.gpu_util', '使用率')}</span>
						<span class="font-medium text-text-primary">{g.util_pct}%</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-border">
						<div class={cn('h-full rounded-full transition-all', barColor(g.util_pct))} style="width:{g.util_pct}%"></div>
					</div>
				</div>
				<!-- VRAM -->
				{#if g.mem_total_gb}
				<div>
					<div class="flex justify-between text-xs mb-1">
						<span class="text-text-secondary flex items-center gap-1"><HardDrive size={11} /> VRAM</span>
						<span class="font-medium text-text-primary">{g.mem_used_gb} / {g.mem_total_gb} GB</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-border">
						<div class={cn('h-full rounded-full transition-all', barColor((g.mem_used_gb! / g.mem_total_gb) * 100))}
							style="width:{(g.mem_used_gb! / g.mem_total_gb) * 100}%"></div>
					</div>
				</div>
				{/if}
				<!-- Temp + Power -->
				<div class="flex gap-4 text-xs">
					{#if g.temp_c != null}
					<span class="flex items-center gap-1 text-text-secondary">
						<Thermometer size={12} class={g.temp_c > 85 ? 'text-danger' : g.temp_c > 70 ? 'text-warning' : 'text-text-secondary'} />
						{g.temp_c}°C
					</span>
					{/if}
					{#if g.power_w != null}
					<span class="flex items-center gap-1 text-text-secondary"><Zap size={12} /> {g.power_w} W</span>
					{/if}
				</div>
			</div>
			{/each}
		</div>
	{/if}
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { BookOpen, Download, Package, ExternalLink, Filter } from '@lucide/svelte';

	interface Skill {
		name: string;
		description: string;
		version: string;
		source: string;
		compatible_tools: string[];
		references_count: number;
		enabled: boolean;
	}

	interface SkillsIndex {
		project_types?: Record<string, { description: string; skills: string[] }>;
		skills?: Record<string, { description: string; compatible_tools?: string[] }>;
	}

	let skills = $state<Skill[]>([]);
	let index = $state<SkillsIndex>({});
	let loading = $state(true);
	let selectedProjectType = $state('all');
	let selectedSkills = $state<Set<string>>(new Set());

	onMount(async () => {
		const [skillsResult, indexResult] = await Promise.all([
			apiGet<Skill[]>('/skills'),
			apiGet<SkillsIndex>('/skills/index'),
		]);
		skillsResult.match(
			(data) => { skills = data.filter(s => s.enabled); },
			(e) => toast.error(errorMessage(e))
		);
		indexResult.match(
			(data) => { index = data; },
			() => {}
		);
		loading = false;
	});

	const projectTypes = $derived(Object.entries(index.project_types ?? {}));

	const filteredSkills = $derived(() => {
		if (selectedProjectType === 'all') return skills;
		const typeSkills = index.project_types?.[selectedProjectType]?.skills ?? [];
		return skills.filter(s => typeSkills.includes(s.name));
	});

	function toggleSkill(name: string) {
		const next = new Set(selectedSkills);
		if (next.has(name)) next.delete(name);
		else next.add(name);
		selectedSkills = next;
	}

	function selectProjectType(type: string) {
		selectedProjectType = type;
		if (type === 'all') {
			selectedSkills = new Set();
		} else {
			const typeSkills = index.project_types?.[type]?.skills ?? [];
			selectedSkills = new Set(typeSkills.filter(s => skills.some(sk => sk.name === s && sk.enabled)));
		}
	}

	function downloadSelected() {
		if (selectedSkills.size === 0) {
			toast.error('請至少選擇一個 Skill');
			return;
		}
		const names = Array.from(selectedSkills).join(',');
		window.location.href = `/api/skills/download-bundle?names=${encodeURIComponent(names)}`;
	}

	function downloadAll() {
		window.location.href = '/api/skills/download-bundle';
	}

	function downloadSingle(name: string) {
		window.location.href = `/api/skills/${name}/download`;
	}

	const selectedCount = $derived(selectedSkills.size);
</script>

<svelte:head><title>Skills 下載 — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-xl font-bold text-text-primary">Skills 下載</h1>
			<p class="mt-1 text-sm text-text-secondary">
				選擇適合你專案的 Skills，下載後放入 <code class="text-xs bg-background px-1.5 py-0.5 rounded">.claude/skills/</code> 即可使用。
			</p>
		</div>
		<div class="flex gap-2">
			{#if selectedCount > 0}
			<button onclick={downloadSelected}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Download size={14} />
				下載已選 ({selectedCount})
			</button>
			{/if}
			<button onclick={downloadAll}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<Package size={14} />
				下載全部
			</button>
		</div>
	</div>

	<!-- Project type filter -->
	{#if projectTypes.length > 0}
	<div class="space-y-2">
		<p class="text-xs font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
			<Filter size={12} /> 依專案類型篩選
		</p>
		<div class="flex flex-wrap gap-2">
			<button
				onclick={() => selectProjectType('all')}
				class={cn(
					'rounded-full px-3 py-1 text-xs font-medium transition-colors',
					selectedProjectType === 'all'
						? 'bg-primary text-primary-foreground'
						: 'border border-border text-text-secondary hover:bg-surface-raised'
				)}
			>
				全部
			</button>
			{#each projectTypes as [type, meta]}
			<button
				onclick={() => selectProjectType(type)}
				class={cn(
					'rounded-full px-3 py-1 text-xs font-medium transition-colors',
					selectedProjectType === type
						? 'bg-primary text-primary-foreground'
						: 'border border-border text-text-secondary hover:bg-surface-raised'
				)}
				title={meta.description}
			>
				{type}
			</button>
			{/each}
		</div>
		{#if selectedProjectType !== 'all'}
		<p class="text-xs text-text-secondary">
			{index.project_types?.[selectedProjectType]?.description ?? ''}
		</p>
		{/if}
	</div>
	{/if}

	<!-- Skills grid -->
	{#if loading}
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each [1,2,3,4,5,6] as _}
				<div class="h-28 animate-pulse rounded-xl border border-border bg-surface"></div>
			{/each}
		</div>
	{:else if filteredSkills().length === 0}
		<div class="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<BookOpen size={32} />
			<p class="text-sm">此類型沒有可用的 Skills</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredSkills() as skill}
			{@const isSelected = selectedSkills.has(skill.name)}
			<div
				class={cn(
					'rounded-xl border p-4 cursor-pointer transition-all',
					isSelected
						? 'border-primary bg-primary-subtle'
						: 'border-border bg-surface hover:border-border-strong'
				)}
				onclick={() => toggleSkill(skill.name)}
				role="checkbox"
				aria-checked={isSelected}
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && toggleSkill(skill.name)}
			>
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-center gap-2 min-w-0">
						<!-- Checkbox indicator -->
						<div class={cn(
							'h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center',
							isSelected ? 'bg-primary border-primary' : 'border-border'
						)}>
							{#if isSelected}
							<svg class="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
								<path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							{/if}
						</div>
						<span class="font-mono text-sm font-semibold text-text-primary truncate">{skill.name}</span>
					</div>
					<!-- Individual download -->
					<button
						onclick={(e) => { e.stopPropagation(); downloadSingle(skill.name); }}
						class="shrink-0 p-1 rounded text-text-disabled hover:text-text-link transition-colors"
						title="單獨下載"
					>
						<Download size={13} />
					</button>
				</div>

				<p class="mt-2 text-xs text-text-secondary line-clamp-2 leading-relaxed">
					{skill.description || '無說明'}
				</p>

				<div class="mt-3 flex items-center justify-between">
					<div class="flex flex-wrap gap-1">
						{#each (skill.compatible_tools ?? []) as tool}
						<span class="rounded bg-background px-1.5 py-0.5 text-xs text-text-disabled">{tool}</span>
						{/each}
					</div>
					{#if skill.references_count > 0}
					<span class="text-xs text-text-disabled">{skill.references_count} refs</span>
					{/if}
				</div>
			</div>
			{/each}
		</div>
	{/if}

	<!-- Install guide -->
	<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
		<h3 class="text-sm font-semibold text-text-primary">安裝說明</h3>
		<div class="text-xs text-text-secondary space-y-2">
			<p><strong class="text-text-primary">方法 A</strong> — 使用安裝腳本（推薦）：</p>
			<code class="block bg-background rounded px-3 py-2 font-mono leading-relaxed">
				curl -s https://ai.yid.office.tw/skills/init-project-skills.sh | bash
			</code>
			<p class="mt-2"><strong class="text-text-primary">方法 B</strong> — 手動安裝：</p>
			<code class="block bg-background rounded px-3 py-2 font-mono leading-relaxed">
				# 下載 ZIP 後解壓到專案根目錄<br>
				mkdir -p .claude/skills && mkdir -p .agents/skills<br>
				unzip yid-ai-skills.zip -d .claude/skills/
			</code>
		</div>
	</div>
</div>

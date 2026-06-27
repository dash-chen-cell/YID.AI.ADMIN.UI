<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { BookOpen, Upload, Trash2, ToggleLeft, ToggleRight, ExternalLink, RefreshCw, Filter, X, FolderPlus, Server, Send } from '@lucide/svelte';
	import { t } from '$lib/stores/i18n';
	import { apiPost } from '$lib/api/client';

	interface Skill {
		name: string;
		description: string;
		version: string;
		source: string;
		synced: string;
		compatible_tools: string[];
		references_count: number;
		enabled: boolean;
	}

	interface ProjectTypeMap {
		skill_to_types: Record<string, string[]>;
		project_types: { id: string; description: string }[];
	}

	let skills = $state<Skill[]>([]);
	let typeMap = $state<ProjectTypeMap | null>(null);
	let loading = $state(true);
	let selectedType = $state<string>('');

	// Upload dialog state
	let showUploadDialog = $state(false);

	// Fleet push
	interface FleetServer { id: string; name: string; ssh_host: string; enabled: boolean; }
	let fleet = $state<FleetServer[]>([]);
	let showPushDialog = $state(false);
	let pushSelectedServers = $state<Set<string>>(new Set());
	let pushSelectedSkills = $state<Set<string>>(new Set());
	let pushLoading = $state(false);

	async function openPushDialog() {
		if (fleet.length === 0) {
			const r = await apiGet<FleetServer[]>('/fleet');
			r.match((d) => { fleet = d.filter(s => s.enabled && s.ssh_host); }, () => {});
		}
		pushSelectedServers = new Set();
		pushSelectedSkills = new Set(filteredSkills.filter(s => s.enabled).map(s => s.name));
		showPushDialog = true;
	}

	async function pushToFleet() {
		if (pushLoading || pushSelectedServers.size === 0 || pushSelectedSkills.size === 0) return;
		pushLoading = true;
		const result = await apiPost<{ results?: Array<{ server: string; skills: string[]; errors: string[] }> }>('/skills/push-to-fleet', {
			skills: [...pushSelectedSkills],
			server_ids: [...pushSelectedServers],
		});
		result.match(
			(d) => {
				const r = d.results ?? [];
				const ok = r.filter(x => x.skills.length > 0);
				const err = r.filter(x => x.errors.length > 0);
				if (ok.length) toast.success(`已推送到 ${ok.map(x => x.server).join(', ')}`);
				if (err.length) toast.error(`${err.map(x => `${x.server}: ${x.errors[0]}`).join('; ')}`);
				showPushDialog = false;
			},
			() => toast.error('推送失敗')
		);
		pushLoading = false;
	}
	let uploadFile = $state<File | null>(null);
	let uploadTypeMode = $state<'select' | 'new'>('select');
	let uploadSelectedType = $state<string>('');
	let uploadNewTypeId = $state('');
	let uploadNewTypeDesc = $state('');
	let uploadLoading = $state(false);
	let isDragging = $state(false);

	function openUploadDialog() {
		uploadFile = null;
		uploadTypeMode = 'select';
		uploadSelectedType = typeMap?.project_types[0]?.id ?? '';
		uploadNewTypeId = '';
		uploadNewTypeDesc = '';
		showUploadDialog = true;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) setUploadFile(file);
	}

	function setUploadFile(file: File) {
		if (!file.name.endsWith('.zip')) {
			toast.error('ZIP format only');
			return;
		}
		uploadFile = file;
	}

	function onFileInput(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) setUploadFile(f);
	}
	let searchQ = $state('');

	onMount(load);

	async function load() {
		loading = true;
		const [skillsResult, mapResult] = await Promise.all([
			apiGet<Skill[]>('/skills'),
			apiGet<ProjectTypeMap>('/skills/project-type-map'),
		]);
		skillsResult.match((data) => { skills = data; }, (e) => toast.error(errorMessage(e)));
		mapResult.match((data) => { typeMap = data; }, () => {});
		loading = false;
	}

	async function submitUpload() {
		if (!uploadFile) return;
		uploadLoading = true;

		// If creating new project type, register it first (via index.yaml update)
		if (uploadTypeMode === 'new' && uploadNewTypeId.trim()) {
			// New type will be created when skill is associated in index.yaml
			// For now, we pass it as metadata in the upload request
		}

		const form = new FormData();
		form.append('file', uploadFile);
		if (uploadTypeMode === 'select' && uploadSelectedType) {
			form.append('project_type', uploadSelectedType);
		} else if (uploadTypeMode === 'new' && uploadNewTypeId.trim()) {
			form.append('project_type', uploadNewTypeId.trim());
			form.append('project_type_desc', uploadNewTypeDesc.trim());
		}

		try {
			const res = await fetch('/api/skills/upload', { method: 'POST', credentials: 'same-origin', body: form });
			const data = await res.json();
			if (res.ok) {
				toast.success(`Skill "${data.skill}" 上傳成功`);
				showUploadDialog = false;
				load();
			} else {
				toast.error(data.detail || 'Upload failed');
			}
		} catch {
			toast.error('Upload failed');
		}
		uploadLoading = false;
	}

	async function toggleSkill(skill: Skill) {
		try {
			const res = await fetch(`/api/skills/${skill.name}/toggle`, { method: 'PATCH', credentials: 'same-origin' });
			const data = await res.json();
			if (res.ok) {
				skill.enabled = data.enabled;
				toast.success(`${skill.name} ${data.enabled ? '已啟用' : '已停用'}`);
				skills = [...skills];
			} else toast.error(data.detail || '操作失敗');
		} catch { toast.error('操作失敗'); }
	}

	async function deleteSkill(skill: Skill) {
		if (!confirm(`刪除 Skill "${skill.name}"？此操作不可復原。`)) return;
		const result = await apiDelete(`/skills/${skill.name}`);
		result.match(
			() => { toast.success(`Skill "${skill.name}" 已刪除`); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	const filteredSkills = $derived(skills.filter(skill => {
		if (searchQ && !skill.name.includes(searchQ.toLowerCase()) && !skill.description?.toLowerCase().includes(searchQ.toLowerCase())) return false;
		if (selectedType && typeMap) {
			const types = typeMap.skill_to_types[skill.name] ?? [];
			if (!types.includes(selectedType)) return false;
		}
		return true;
	}));

	const enabledCount = $derived(skills.filter(s => s.enabled).length);
</script>

<svelte:head><title>Skills — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-xl font-bold text-text-primary">Skills 管理</h1>
			<p class="mt-1 text-sm text-text-secondary">
				已啟用 {enabledCount} / {skills.length} 個 Skill
				{#if selectedType}・篩選：{selectedType}{/if}
			</p>
		</div>
		<div class="flex gap-2 flex-wrap">
			<button onclick={load} class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				重新整理
			</button>
			<button onclick={openPushDialog}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<Send size={14} />
				推送到 Fleet
			</button>
			<button onclick={openUploadDialog}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Upload size={14} />
				{$t('skills.upload_button', 'Upload Skill (ZIP)')}
			</button>
		</div>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-2">
		<!-- Search -->
		<div class="relative">
			<input
				bind:value={searchQ}
				placeholder="搜尋 Skill..."
				class="w-48 rounded-md border border-border bg-background py-1.5 pl-3 pr-3 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
			/>
		</div>

		<!-- Project type filter -->
		{#if typeMap && typeMap.project_types.length > 0}
		<div class="flex items-center gap-1.5">
			<Filter size={13} class="text-text-disabled" />
			<select
				bind:value={selectedType}
				class="rounded-md border border-border bg-background py-1.5 pl-2 pr-6 text-sm text-text-primary outline-none focus:border-primary appearance-none"
			>
				<option value="">全部專案類型</option>
				{#each typeMap.project_types as pt}
				<option value={pt.id}>{pt.id}</option>
				{/each}
			</select>
			{#if selectedType}
			<button onclick={() => selectedType = ''} class="rounded p-0.5 text-text-disabled hover:text-text-primary">
				<X size={13} />
			</button>
			{/if}
		</div>
		{/if}

		<span class="flex items-center text-xs text-text-disabled">{filteredSkills.length} 個</span>
	</div>

	<!-- Skills cards -->
	{#if loading}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each [1,2,3,4,5,6] as _}
				<div class="h-28 animate-pulse rounded-xl border border-border bg-surface"></div>
			{/each}
		</div>
	{:else if filteredSkills.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<BookOpen size={36} />
			<p class="text-sm">{skills.length === 0 ? '尚未上傳任何 Skill' : '找不到符合條件的 Skill'}</p>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredSkills as skill}
			<div class={cn(
				'rounded-xl border border-border bg-surface p-4 space-y-2.5 transition-opacity',
				!skill.enabled && 'opacity-50'
			)}>
				<!-- Name + toggle -->
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-center gap-2 min-w-0">
						<BookOpen size={13} class="text-primary shrink-0 mt-0.5" />
						<span class="font-mono text-sm font-semibold text-text-primary truncate">{skill.name}</span>
					</div>
					<button onclick={() => toggleSkill(skill)} class={cn('shrink-0', skill.enabled ? 'text-success' : 'text-text-disabled')}>
						{#if skill.enabled}<ToggleRight size={18} />{:else}<ToggleLeft size={18} />{/if}
					</button>
				</div>

				<!-- Description -->
				{#if skill.description}
				<p class="text-xs text-text-secondary line-clamp-2 leading-relaxed">{skill.description}</p>
				{/if}

				<!-- Tags -->
				<div class="flex flex-wrap gap-1">
					{#if skill.version}
					<span class="rounded bg-surface-raised px-1.5 py-0.5 text-xs font-mono text-text-disabled">{skill.version}</span>
					{/if}
					{#if skill.references_count > 0}
					<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">{skill.references_count} ref</span>
					{/if}
					{#if typeMap}
					{#each (typeMap.skill_to_types[skill.name] ?? []).slice(0, 2) as type}
					<span class="rounded-full bg-info-bg px-2 py-0.5 text-xs text-info">{type}</span>
					{/each}
					{/if}
				</div>

				<!-- Compatible tools + actions -->
				<div class="flex items-center justify-between gap-2 pt-1 border-t border-border">
					<div class="flex flex-wrap gap-1">
						{#each (skill.compatible_tools || []).slice(0, 3) as tool}
						<span class="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">{tool}</span>
						{/each}
					</div>
					<div class="flex gap-1 shrink-0">
						<a href="/skills/{skill.name}/SKILL.md" target="_blank"
							class="p-1 rounded text-text-disabled hover:text-text-link transition-colors" title="開啟 SKILL.md">
							<ExternalLink size={13} />
						</a>
						<button onclick={() => deleteSkill(skill)}
							class="p-1 rounded text-text-disabled hover:text-danger transition-colors" title="刪除">
							<Trash2 size={13} />
						</button>
					</div>
				</div>
			</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Push to Fleet Dialog -->
{#if showPushDialog}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => showPushDialog = false}
	onkeydown={e => e.key === 'Escape' && (showPushDialog = false)}>
	<div class="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
				<Send size={15} class="text-primary" /> 推送 Skills 到 Fleet
			</h2>
			<button onclick={() => showPushDialog = false} class="rounded p-1 text-text-disabled hover:text-text-primary">
				<X size={16} />
			</button>
		</div>
		<div class="p-5 space-y-5">
			<!-- Target servers -->
			<div>
				<p class="text-xs font-medium text-text-secondary mb-2">目標伺服器（需設定 SSH Host）</p>
				{#if fleet.length === 0}
				<p class="text-xs text-text-disabled">沒有可用的 Fleet 機器（請先在 Fleet 管理頁設定 SSH Host）</p>
				{:else}
				<div class="space-y-1">
					{#each fleet as s}
					<label class="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-surface-raised cursor-pointer">
						<input type="checkbox"
							checked={pushSelectedServers.has(s.id)}
							onchange={() => {
								const next = new Set(pushSelectedServers);
								next.has(s.id) ? next.delete(s.id) : next.add(s.id);
								pushSelectedServers = next;
							}}
							class="accent-primary" />
						<Server size={13} class="text-text-secondary" />
						<span class="text-sm text-text-primary">{s.name}</span>
						<code class="ml-auto text-xs text-text-disabled">{s.ssh_host}</code>
					</label>
					{/each}
				</div>
				{/if}
			</div>
			<!-- Skills to push -->
			<div>
				<div class="flex items-center justify-between mb-2">
					<p class="text-xs font-medium text-text-secondary">要推送的 Skills</p>
					<div class="flex gap-1">
						<button onclick={() => pushSelectedSkills = new Set(filteredSkills.map(s => s.name))}
							class="text-xs text-text-link hover:underline">全選</button>
						<span class="text-text-disabled">·</span>
						<button onclick={() => pushSelectedSkills = new Set()}
							class="text-xs text-text-link hover:underline">清除</button>
					</div>
				</div>
				<div class="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
					{#each filteredSkills as s}
					<label class="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-raised cursor-pointer">
						<input type="checkbox"
							checked={pushSelectedSkills.has(s.name)}
							onchange={() => {
								const next = new Set(pushSelectedSkills);
								next.has(s.name) ? next.delete(s.name) : next.add(s.name);
								pushSelectedSkills = next;
							}}
							class="accent-primary" />
						<span class="font-mono text-xs text-text-primary">{s.name}</span>
					</label>
					{/each}
				</div>
				<p class="text-xs text-text-disabled mt-1">{pushSelectedSkills.size} 個已選</p>
			</div>
		</div>
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={() => showPushDialog = false}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				取消
			</button>
			<button onclick={pushToFleet}
				disabled={pushLoading || pushSelectedServers.size === 0 || pushSelectedSkills.size === 0}
				class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if pushLoading}<RefreshCw size={13} class="animate-spin" />{:else}<Send size={13} />{/if}
				推送 {pushSelectedSkills.size} 個 Skills 到 {pushSelectedServers.size} 台
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Upload Dialog -->
{#if showUploadDialog}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => showUploadDialog = false}
	onkeydown={e => e.key === 'Escape' && (showUploadDialog = false)}>
	<div class="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary">{$t('skills.upload_dialog_title', 'Upload Skill')}</h2>
			<button onclick={() => showUploadDialog = false} class="rounded p-1 text-text-disabled hover:text-text-primary">
				<X size={16} />
			</button>
		</div>

		<div class="p-5 space-y-5">
			<!-- Drop zone -->
			<div
				role="button" tabindex="0"
				class={cn(
					'rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
					isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
					uploadFile ? 'border-success bg-success-bg/10' : ''
				)}
				ondragover={e => { e.preventDefault(); isDragging = true; }}
				ondragleave={() => isDragging = false}
				ondrop={onDrop}
				onclick={() => document.getElementById('skill-file-input')?.click()}
				onkeydown={e => e.key === 'Enter' && document.getElementById('skill-file-input')?.click()}
			>
				{#if uploadFile}
					<div class="flex items-center justify-center gap-2 text-success">
						<BookOpen size={20} />
						<span class="text-sm font-medium">{uploadFile.name}</span>
					</div>
					<p class="text-xs text-text-disabled mt-1">{(uploadFile.size / 1024).toFixed(1)} KB</p>
				{:else}
					<Upload size={24} class="mx-auto mb-2 text-text-disabled" />
					<p class="text-sm text-text-secondary">{$t('skills.drop_here', 'Drop ZIP file here, or click to select')}</p>
				{/if}
				<input id="skill-file-input" type="file" accept=".zip" class="hidden" onchange={onFileInput} />
			</div>

			<!-- Project type selection -->
			<div class="space-y-3">
				<p class="text-xs font-medium text-text-secondary uppercase tracking-wide">{$t('skills.select_type', 'Project Type')}</p>
				<div class="flex gap-2">
					<button onclick={() => uploadTypeMode = 'select'}
						class={cn('flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
							uploadTypeMode === 'select' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-secondary hover:bg-surface-raised')}>
						{$t('skills.select_type', 'Select existing')}
					</button>
					<button onclick={() => uploadTypeMode = 'new'}
						class={cn('flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
							uploadTypeMode === 'new' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-secondary hover:bg-surface-raised')}>
						<FolderPlus size={13} />
						{$t('skills.new_type', 'Create new')}
					</button>
				</div>

				{#if uploadTypeMode === 'select' && typeMap}
				<select bind:value={uploadSelectedType}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary">
					<option value="">— {$t('skills.all_types', 'No type')} —</option>
					{#each typeMap.project_types as pt}
					<option value={pt.id}>{pt.id} — {pt.description}</option>
					{/each}
				</select>
				{:else if uploadTypeMode === 'new'}
				<div class="space-y-2">
					<input bind:value={uploadNewTypeId} placeholder={$t('skills.type_id_placeholder', 'type-id')}
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-primary" />
					<input bind:value={uploadNewTypeDesc} placeholder={$t('skills.type_desc_placeholder', 'Description')}
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary" />
				</div>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={() => showUploadDialog = false}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				{$t('common.cancel', 'Cancel')}
			</button>
			<button onclick={submitUpload} disabled={!uploadFile || uploadLoading}
				class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if uploadLoading}<RefreshCw size={13} class="animate-spin" />{:else}<Upload size={13} />{/if}
				{uploadLoading ? $t('common.loading', 'Uploading...') : $t('common.confirm', 'Upload')}
			</button>
		</div>
	</div>
</div>
{/if}

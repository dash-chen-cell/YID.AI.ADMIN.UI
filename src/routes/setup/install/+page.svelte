<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setupState } from '$lib/stores/setup';
	import { browser } from '$app/environment';

	type StepStatus = 'pending' | 'running' | 'done' | 'error';

	interface InstallStep {
		id: string;
		label: string;
		reboot_after?: boolean;
		risk?: 'high';
		risk_note?: string;
		status: StepStatus;
		logs: string[];
		expanded: boolean;
	}

	const INSTALL_STEPS_DEF: Array<{
		id: string;
		label: string;
		reboot_after?: boolean;
		risk?: 'high';
		risk_note?: string;
	}> = [
		{ id: 'firewall',    label: 'Firewall & fail2ban' },
		{ id: 'base',        label: 'Base packages' },
		{ id: 'docker',      label: 'Docker Engine' },
		{ id: 'nvidia',      label: 'NVIDIA Driver', reboot_after: true },
		{ id: 'nvidia-post', label: 'NVIDIA Container Toolkit' },
		{ id: 'llama',       label: 'llama.cpp (CUDA build)' },
		{ id: 'tls',         label: 'TLS Certificates',
		  risk: 'high', risk_note: '重新產生 TLS cert，會短暫中斷所有 HTTPS 服務' },
		{ id: 'nginx',       label: 'nginx (container)' },
		{ id: 'platform',    label: 'Platform containers (Token Service + Admin UI + Portal)' },
		{ id: 'monitoring',  label: 'Prometheus + Grafana' },
		{ id: 'alerting',    label: 'ntfy Alerts' },
		{ id: 'authentik',   label: 'Authentik SSO',
		  risk: 'high', risk_note: '重跑會重設所有 OIDC client secrets，破壞現有 SSO 登入' },
	];

	const STORAGE_KEY = 'yid_install_progress';

	let steps = $state<InstallStep[]>(
		INSTALL_STEPS_DEF.map((s) => ({ ...s, status: 'pending', logs: [], expanded: false }))
	);

	let installing = $state(false);
	let rebootRequired = $state(false);
	let forceRerunIds = $state<Set<string>>(new Set());
	let rebootAfterStepId = $state<string | null>(null);
	let currentStepIndex = $state(-1);
	let allDone = $state(false);

	interface StepDetection {
		id: string;
		detected: boolean;
		skip_recommended: boolean;
		note: string;
	}

	// Load real environment detection + localStorage progress
	onMount(async () => {
		if (!browser) return;

		// 1. Detect actual state from server
		let detectedMap: Record<string, StepDetection> = {};
		try {
			const res = await fetch('/api/setup/steps-status');
			if (res.ok) {
				const data = await res.json() as { steps: StepDetection[] };
				for (const s of data.steps) detectedMap[s.id] = s;
			}
		} catch { /* ignore */ }

		// 2. Merge: detected=true → done; also restore localStorage
		let localDoneIds: string[] = [];
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const progress = JSON.parse(saved) as { doneIds: string[] };
				localDoneIds = progress.doneIds ?? [];
			}
		} catch { /* ignore */ }

		steps = steps.map((s) => {
			const det = detectedMap[s.id];
			const isDone = (det?.detected ?? false) || localDoneIds.includes(s.id);
			return {
				...s,
				status: isDone ? 'done' : 'pending',
				// Carry risk_note from server detection if available
				risk_note: det?.note || s.risk_note,
			};
		});

		// 3. Check reboot-required state from localStorage
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const progress = JSON.parse(saved) as { doneIds: string[] };
				const rebootStep = INSTALL_STEPS_DEF.find(
					(s) => s.reboot_after && progress.doneIds.includes(s.id)
				);
				if (rebootStep) {
					const nextIdx = INSTALL_STEPS_DEF.findIndex((s) => s.id === rebootStep.id) + 1;
					if (nextIdx < INSTALL_STEPS_DEF.length && !progress.doneIds.includes(INSTALL_STEPS_DEF[nextIdx].id)) {
						rebootRequired = false;
					}
				}
			}
		} catch { /* ignore */ }
	});

	function saveProgress(doneIds: string[]) {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ doneIds }));
		} catch {
			// ignore
		}
	}

	function clearProgress() {
		if (!browser) return;
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}

	async function runStep(stepIdx: number): Promise<'done' | 'error' | 'reboot'> {
		const step = steps[stepIdx];
		steps[stepIdx] = { ...steps[stepIdx], status: 'running', expanded: true };

		return new Promise((resolve) => {
			const es = new EventSource(`/api/setup/run/${step.id}`);

			es.onmessage = (event: MessageEvent) => {
				try {
					const data = JSON.parse(event.data as string) as {
						type: 'log' | 'exit' | 'reboot_required';
						line?: string;
						code?: number;
					};

					if (data.type === 'log' && data.line) {
						steps[stepIdx] = {
							...steps[stepIdx],
							logs: [...steps[stepIdx].logs, data.line],
						};
					} else if (data.type === 'reboot_required') {
						es.close();
						steps[stepIdx] = { ...steps[stepIdx], status: 'done' };
						resolve('reboot');
					} else if (data.type === 'exit') {
						es.close();
						if (data.code === 0) {
							steps[stepIdx] = { ...steps[stepIdx], status: 'done' };
							resolve('done');
						} else {
							steps[stepIdx] = {
								...steps[stepIdx],
								status: 'error',
								logs: [
									...steps[stepIdx].logs,
									`Process exited with code ${data.code ?? 'unknown'}`,
								],
							};
							resolve('error');
						}
					}
				} catch {
					// malformed JSON — skip
				}
			};

			es.onerror = () => {
				es.close();
				steps[stepIdx] = {
					...steps[stepIdx],
					status: 'error',
					logs: [...steps[stepIdx].logs, 'Connection to server lost'],
				};
				resolve('error');
			};
		});
	}

	async function startInstallation() {
		installing = true;
		rebootRequired = false;
		rebootAfterStepId = null;

		// Find first non-done step
		const startFrom = steps.findIndex((s) => s.status !== 'done');
		if (startFrom === -1) {
			installing = false;
			allDone = true;
			return;
		}

		for (let i = startFrom; i < steps.length; i++) {
			const step = steps[i];
			// Skip done + skip_recommended steps unless user explicitly forced re-run
			if (step.status === 'done' && step.risk === 'high' && !forceRerunIds.has(step.id)) {
				continue;
			}
			currentStepIndex = i;
			const result = await runStep(i);
			const doneIds = steps.filter((s) => s.status === 'done').map((s) => s.id);
			saveProgress(doneIds);

			if (result === 'error') {
				installing = false;
				return;
			}

			if (result === 'reboot') {
				rebootRequired = true;
				rebootAfterStepId = steps[i].id;
				installing = false;
				return;
			}
		}

		// All done
		setupState.markStepDone('install');
		clearProgress();
		allDone = true;
		installing = false;
	}

	async function retryFromError() {
		installing = true;
		rebootRequired = false;
		const errIdx = steps.findIndex((s) => s.status === 'error');
		if (errIdx === -1) { installing = false; return; }
		// Reset error step
		steps[errIdx] = { ...steps[errIdx], status: 'pending', logs: [] };

		for (let i = errIdx; i < steps.length; i++) {
			currentStepIndex = i;
			const result = await runStep(i);
			const doneIds = steps.filter((s) => s.status === 'done').map((s) => s.id);
			saveProgress(doneIds);
			if (result === 'error') { installing = false; return; }
			if (result === 'reboot') {
				rebootRequired = true;
				rebootAfterStepId = steps[i].id;
				installing = false;
				return;
			}
		}

		setupState.markStepDone('install');
		clearProgress();
		allDone = true;
		installing = false;
	}

	const hasError = $derived(steps.some((s) => s.status === 'error'));
	const doneCount = $derived(steps.filter((s) => s.status === 'done').length);
	const hasDoneSteps = $derived(doneCount > 0);
	// All steps detected as done (by server detection, not just wizard run)
	const allDetectedDone = $derived(doneCount === steps.length);
	// Has any high-risk steps force-checked
	const hasForceRerun = $derived(forceRerunIds.size > 0);
	// Steps that still need to run (pending + force-rerun)
	const pendingCount = $derived(
		steps.filter(s => s.status !== 'done').length + forceRerunIds.size
	);

	const statusIcon: Record<StepStatus, string> = {
		pending: '○',
		running: '⟳',
		done: '✓',
		error: '✗',
	};
</script>

<svelte:head><title>Install — YID AI Setup</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold text-text-primary">Platform Installation</h1>
		<p class="mt-1 text-sm text-text-secondary">
			Installing YID AI Platform components. This may take 15–30 minutes.
		</p>
	</div>

	<!-- Re-run notice -->
	{#if hasDoneSteps}
	<div class="rounded-xl border border-warning bg-warning-bg px-5 py-4 flex gap-3">
		<span class="text-base shrink-0">⚠️</span>
		<div class="text-sm space-y-1">
			<p class="font-medium text-text-primary">此系統已完成部分安裝步驟</p>
			<p class="text-text-secondary">
				多數步驟可安全重跑（apt install、docker compose up 是冪等的）。
				但標示 <span class="text-warning font-medium">高風險</span> 的步驟重跑可能影響運作中的服務，請確認後再執行。
			</p>
		</div>
	</div>
	{:else}
	<div class="rounded-xl border border-info bg-info-bg px-5 py-4 flex gap-3">
		<span class="text-base shrink-0">ℹ️</span>
		<div class="text-sm space-y-1">
			<p class="font-medium text-text-primary">全容器化架構</p>
			<p class="text-text-secondary">
				所有服務均以 Docker container 運作。安裝完成後可透過
				<code class="bg-background px-1 rounded">sudo ./setup.sh platform</code> 管理服務。
			</p>
		</div>
	</div>
	{/if}

	<!-- Reboot required banner -->
	{#if rebootRequired}
		<div class="rounded-xl border-2 border-warning bg-warning-bg p-6 space-y-3">
			<div class="flex items-center gap-2">
				<span class="text-xl">⚠️</span>
				<h2 class="text-base font-bold text-warning">Reboot Required</h2>
			</div>
			<p class="text-sm text-text-primary">
				The NVIDIA driver has been installed and requires a system reboot to activate.
			</p>
			<div class="rounded-md border border-border bg-background px-4 py-3">
				<p class="mb-1 text-xs text-text-secondary">Run on your server:</p>
				<code class="font-mono text-sm text-text-primary">sudo reboot</code>
			</div>
			<p class="text-xs text-text-secondary">
				After rebooting, return to this page — installation will resume automatically from where it left off.
			</p>
		</div>
	{/if}

	<!-- Steps list -->
	<div class="overflow-hidden rounded-xl border border-border bg-surface">
		{#each steps as step, i}
			<div class="border-b border-border last:border-0">
				<!-- Step header -->
				<button
					type="button"
					onclick={() => {
						steps[i] = { ...steps[i], expanded: !steps[i].expanded };
					}}
					class="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-raised transition-colors"
					aria-expanded={steps[i].expanded}
				>
					<!-- Status icon -->
					<span
						class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors"
						class:bg-surface-raised={step.status === 'pending'}
						class:text-text-disabled={step.status === 'pending'}
						class:bg-primary={step.status === 'running'}
						class:text-primary-foreground={step.status === 'running'}
						class:animate-spin={step.status === 'running'}
						class:bg-success={step.status === 'done'}
						class:text-white={step.status === 'done'}
						class:bg-danger={step.status === 'error'}
					>
						{statusIcon[step.status]}
					</span>

					<!-- Label -->
					<span class="flex-1 min-w-0">
						<span
							class="text-sm font-medium"
							class:text-text-primary={step.status === 'running' || step.status === 'done'}
							class:text-text-disabled={step.status === 'pending'}
							class:text-danger={step.status === 'error'}
						>
							{step.label}
						</span>
						{#if step.risk === 'high' && step.status !== 'done'}
						<span class="ml-2 rounded px-1.5 py-0.5 text-xs font-medium bg-warning-bg text-warning">
							高風險
						</span>
						{/if}
						{#if step.risk === 'high' && step.risk_note && step.status === 'pending'}
						<p class="text-xs text-text-disabled mt-0.5">{step.risk_note}</p>
					{/if}
					{#if step.risk === 'high' && step.status === 'done' && !installing}
						<label class="flex items-center gap-1.5 mt-1 cursor-pointer">
							<input
								type="checkbox"
								checked={forceRerunIds.has(step.id)}
								onclick={(e) => e.stopPropagation()}
								onchange={() => {
									const s = new Set(forceRerunIds);
									s.has(step.id) ? s.delete(step.id) : s.add(step.id);
									forceRerunIds = s;
								}}
								class="accent-warning"
							/>
							<span class="text-xs text-warning">強制重跑（有風險）</span>
						</label>
					{/if}
					</span>

					<!-- Step number + expand toggle -->
					<span class="text-xs text-text-disabled">
						{i + 1}/{steps.length}
						{#if step.logs.length > 0}
							&nbsp;{step.expanded ? '▲' : '▼'}
						{/if}
					</span>
				</button>

				<!-- Log output (collapsible) -->
				{#if step.expanded && step.logs.length > 0}
					<div class="border-t border-border bg-background px-5 py-3">
						<div class="max-h-48 overflow-y-auto">
							<pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-secondary">{step.logs.join('\n')}</pre>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Action buttons -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="text-sm text-text-secondary">
			{#if installing}
				Installing step {currentStepIndex + 1} of {steps.length}...
			{:else if allDone}
				<span class="text-success font-medium">All steps completed successfully.</span>
			{:else if allDetectedDone && !hasForceRerun}
				<span class="text-success font-medium">
					✅ {steps.length}/{steps.length} 步驟已完成 — 可直接跳過
				</span>
			{:else if hasError}
				<span class="text-danger">Installation failed. Review the logs above.</span>
			{:else if hasDoneSteps && !installing}
				{doneCount}/{steps.length} steps completed — ready to resume.
			{/if}
		</div>

		<div class="flex gap-3">
			{#if hasError}
				<button
					onclick={retryFromError}
					disabled={installing}
					class="rounded-md border border-warning bg-warning-bg px-4 py-2 text-sm font-medium text-warning hover:bg-warning/20 disabled:opacity-40"
				>
					Retry Failed Step
				</button>
			{/if}

			{#if allDetectedDone && !hasForceRerun && !installing && !allDone}
				<button
					onclick={() => { setupState.markStepDone('install'); goto('/setup/complete'); }}
					class="rounded-md bg-success px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90"
				>
					跳過此步驟 →
				</button>
			{/if}

			{#if !installing && !allDone && !rebootRequired && (!allDetectedDone || hasForceRerun)}
				<button
					onclick={startInstallation}
					disabled={allDetectedDone && !hasForceRerun}
					class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"
				>
					{hasDoneSteps ? 'Resume Installation' : 'Start Installation'}
				</button>
			{/if}

			{#if allDone}
				<button
					onclick={() => goto('/setup/complete')}
					class="rounded-md bg-success px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90"
				>
					Continue to Complete
				</button>
			{/if}
		</div>
	</div>
</div>

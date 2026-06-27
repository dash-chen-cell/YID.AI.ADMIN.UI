<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const STEPS = [
		{ id: 'preflight', label: 'Preflight',  path: '/setup/preflight' },
		{ id: 'config',    label: 'Configure',  path: '/setup/config' },
		{ id: 'secrets',   label: 'Secrets',    path: '/setup/secrets' },
		{ id: 'models',    label: 'Models',     path: '/setup/models' },
		{ id: 'install',   label: 'Install',    path: '/setup/install' },
		{ id: 'complete',  label: 'Complete',   path: '/setup/complete' },
	];

	const currentStepIndex = $derived(
		STEPS.findIndex((s) => page.url.pathname.startsWith(s.path))
	);

	function stepStatus(i: number): 'done' | 'active' | 'pending' {
		if (i < currentStepIndex) return 'done';
		if (i === currentStepIndex) return 'active';
		return 'pending';
	}
</script>

<div class="flex min-h-screen flex-col bg-background">
	<!-- Top bar -->
	<header class="border-b border-border bg-surface px-6 py-4">
		<div class="mx-auto flex max-w-4xl items-center justify-between">
			<div class="text-sm font-bold uppercase tracking-widest">
				<span class="text-primary">YID</span>
				<span class="text-text-primary"> AI</span>
			</div>
			<span class="text-xs text-text-disabled">Setup Wizard</span>
		</div>
	</header>

	<!-- Step indicator -->
	<div class="border-b border-border bg-surface px-6 py-4">
		<div class="mx-auto max-w-4xl">
			<ol class="flex items-center gap-0">
				{#each STEPS as step, i}
					{@const status = stepStatus(i)}
					<!-- Step item -->
					<li class="flex flex-1 items-center">
						<div class="flex flex-col items-center gap-1.5">
							<!-- Circle -->
							<div
								class="flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors"
								class:border-primary={status === 'active'}
								class:bg-primary={status === 'active'}
								class:text-primary-foreground={status === 'active'}
								class:border-success={status === 'done'}
								class:bg-success={status === 'done'}
								class:text-white={status === 'done'}
								class:border-border={status === 'pending'}
								class:bg-background={status === 'pending'}
								class:text-text-disabled={status === 'pending'}
							>
								{#if status === 'done'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{:else}
									{i + 1}
								{/if}
							</div>
							<!-- Label -->
							<span
								class="hidden text-xs font-medium sm:block"
								class:text-primary={status === 'active'}
								class:text-success={status === 'done'}
								class:text-text-disabled={status === 'pending'}
							>
								{step.label}
							</span>
						</div>
						<!-- Connector line (between steps) -->
						{#if i < STEPS.length - 1}
							<div
								class="mx-1 h-0.5 flex-1 transition-colors sm:mx-2"
								class:bg-success={i < currentStepIndex}
								class:bg-primary={i === currentStepIndex}
								class:bg-border={i >= currentStepIndex}
							></div>
						{/if}
					</li>
				{/each}
			</ol>
		</div>
	</div>

	<!-- Page content -->
	<main class="flex-1 px-4 py-8">
		<div class="mx-auto max-w-2xl">
			{@render children()}
		</div>
	</main>

	<!-- Footer -->
	<footer class="border-t border-border px-6 py-4">
		<div class="mx-auto max-w-4xl flex items-center justify-between">
			<p class="text-xs text-text-disabled">YID AI Platform v0.1.0</p>
			<p class="text-xs text-text-disabled">&copy; {new Date().getFullYear()} YID AI. All rights reserved.</p>
		</div>
	</footer>
</div>

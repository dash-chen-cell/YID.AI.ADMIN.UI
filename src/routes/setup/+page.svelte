<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(async () => {
		try {
			const res = await fetch('/api/setup/status');
			if (res.ok) {
				const data = await res.json() as {
					completed: boolean;
					config_done: boolean;
					models_done: boolean;
					secrets_done?: boolean;
					current_step: number;
					steps_done: string[];
				};
				if (data.completed) {
					goto('/dashboard');
				} else if (data.config_done && data.models_done) {
					goto('/setup/preflight');
				} else if (data.config_done && data.secrets_done) {
					goto('/setup/models');
				} else if (data.config_done) {
					goto('/setup/secrets');
				} else {
					goto('/setup/config');
				}
			} else {
				goto('/setup/config');
			}
		} catch {
			goto('/setup/config');
		}
	});
</script>

<svelte:head><title>Setup — YID AI</title></svelte:head>

<div class="flex items-center justify-center py-20">
	<div class="flex flex-col items-center gap-3">
		<div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"></div>
		<p class="text-sm text-text-secondary">Checking setup status...</p>
	</div>
</div>

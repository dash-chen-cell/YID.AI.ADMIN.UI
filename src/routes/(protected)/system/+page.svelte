<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Service management moved into Fleet device-detail pages (/fleet/{id} → 服務 tab).
	onMount(() => {
		const server = new URLSearchParams(window.location.search).get('server') || 'local';
		goto(`/fleet/${server}`, { replaceState: true });
	});
</script>

<div class="flex items-center justify-center py-20 text-sm text-text-secondary">
	Redirecting to Fleet…
</div>

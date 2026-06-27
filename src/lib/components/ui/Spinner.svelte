<script lang="ts">
	import { RefreshCw } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	// Element/action-level spinner. Use inside buttons or small loading areas.
	let { size = 14, class: klass = '' }: { size?: number; class?: string } = $props();
</script>

<RefreshCw {size} class={cn('animate-spin', klass)} />

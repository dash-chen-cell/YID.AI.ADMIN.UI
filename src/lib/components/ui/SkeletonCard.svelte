<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	// A card-shaped skeleton: title line + a few body lines.
	let { lines = 3 }: { lines?: number } = $props();
</script>

<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
	<Skeleton class="h-4 w-1/3" />
	{#each Array(lines) as _, i}
		<Skeleton class={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
	{/each}
</div>

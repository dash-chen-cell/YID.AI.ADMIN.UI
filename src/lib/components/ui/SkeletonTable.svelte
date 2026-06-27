<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	// A table-shaped skeleton: header row + N body rows of C columns.
	let { rows = 6, cols = 4 }: { rows?: number; cols?: number } = $props();
</script>

<div class="overflow-hidden rounded-xl border border-border bg-surface">
	<!-- Header -->
	<div class="flex gap-4 border-b border-border bg-surface-raised px-5 py-3">
		{#each Array(cols) as _}
			<Skeleton class="h-3 flex-1" />
		{/each}
	</div>
	<!-- Rows -->
	{#each Array(rows) as _}
		<div class="flex gap-4 border-b border-border px-5 py-3.5 last:border-0">
			{#each Array(cols) as _, c}
				<Skeleton class={`h-3 flex-1 ${c === 0 ? 'max-w-[40%]' : ''}`} />
			{/each}
		</div>
	{/each}
</div>

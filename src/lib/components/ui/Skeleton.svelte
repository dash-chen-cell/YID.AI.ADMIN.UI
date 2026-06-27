<script lang="ts">
	import { cn } from '$lib/utils/cn';

	// Base skeleton block. Compose these to mirror the real layout.
	// width/height accept any Tailwind size class via `class`.
	let { class: klass = '', rounded = 'rounded-md' }: { class?: string; rounded?: string } = $props();
</script>

<div class={cn('animate-pulse bg-border/60', rounded, klass)}></div>

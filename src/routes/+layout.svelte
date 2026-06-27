<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Toaster } from 'svelte-sonner';
	import { checkAuth } from '$lib/stores/auth';
	import { loadLang } from '$lib/stores/i18n';
	import '$lib/stores/theme'; // init theme on load

	let { children } = $props();

	onMount(() => {
		checkAuth();
		loadLang();
	});
</script>

{@render children()}
<Toaster position="top-center" richColors closeButton theme="dark" />

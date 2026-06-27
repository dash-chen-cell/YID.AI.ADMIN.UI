<script lang="ts">
	import { goto } from '$app/navigation';
	import { isAuthenticated, isCheckingAuth } from '$lib/stores/auth';

	$effect(() => {
		if (!$isCheckingAuth) {
			// Check setup status before auth redirect
			fetch('/api/setup/status')
				.then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
				.then((data: { completed: boolean }) => {
					if (!data.completed) {
						goto('/setup');
					} else {
						goto($isAuthenticated ? '/dashboard' : '/login');
					}
				})
				.catch(() => {
					// If setup endpoint unavailable, proceed with normal auth flow
					goto($isAuthenticated ? '/dashboard' : '/login');
				});
		}
	});
</script>

<div class="flex h-screen items-center justify-center bg-background">
	<div class="text-text-secondary text-sm">Loading...</div>
</div>

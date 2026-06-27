<script lang="ts">
	import type { Component } from 'svelte';
	import { goto, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { isAuthenticated, isCheckingAuth, logout, currentUser, currentRole, authConfig, hasRole, type AdminRole } from '$lib/stores/auth';
	import { t, lang, setLang, SUPPORTED_LANGS } from '$lib/stores/i18n';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import { globalLoading } from '$lib/stores/loading';
	import { cn } from '$lib/utils/cn';

	const currentLang = lang;
	import {
		LayoutDashboard,
		Cpu,
		Users,
		Building2,
		Shield,
		BadgeCheck,
		TrendingUp,
		Monitor,
		Key,
		ScrollText,
		Bell,
		BookOpen,
		Server,
		ServerCog,
		AlertTriangle,
		MessageSquare,
		LogOut,
		Menu,
		X,
		Sun,
		Moon,
		MonitorPlay
	} from '@lucide/svelte';

	import { onMount, onDestroy } from 'svelte';

	let { children } = $props();
	let sidebarOpen = $state(false);

	// ── Idle timeout (30 min) ─────────────────────────────────────────────
	const IDLE_MS     = 30 * 60 * 1000;  // 30 minutes
	const WARNING_MS  =  2 * 60 * 1000;  //  2 minutes before logout
	let showIdleWarning = $state(false);
	let idleSecondsLeft = $state(120);
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let warnTimer: ReturnType<typeof setTimeout> | null = null;
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	function resetIdleTimer() {
		if (idleTimer) clearTimeout(idleTimer);
		if (warnTimer) clearTimeout(warnTimer);
		if (countdownTimer) clearInterval(countdownTimer);
		showIdleWarning = false;
		idleSecondsLeft = 120;

		warnTimer = setTimeout(() => {
			showIdleWarning = true;
			idleSecondsLeft = 120;
			countdownTimer = setInterval(() => {
				idleSecondsLeft -= 1;
				if (idleSecondsLeft <= 0) {
					if (countdownTimer) clearInterval(countdownTimer);
				}
			}, 1000);
		}, IDLE_MS - WARNING_MS);

		idleTimer = setTimeout(() => {
			handleLogout();
		}, IDLE_MS);
	}

	function stayActive() {
		resetIdleTimer();
	}

	onMount(() => {
		resetIdleTimer();
		const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
		events.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
		return () => events.forEach(e => document.removeEventListener(e, resetIdleTimer));
	});

	onDestroy(() => {
		if (idleTimer) clearTimeout(idleTimer);
		if (warnTimer) clearTimeout(warnTimer);
		if (countdownTimer) clearInterval(countdownTimer);
	});

	beforeNavigate(({ to, cancel }) => {
		if (!to) return;
		if (!get(isAuthenticated) && !get(isCheckingAuth)) {
			cancel();
			goto('/login');
		}
		sidebarOpen = false;
	});

	type NavItem = {
		href: string; label: string; icon: Component; minRole: AdminRole;
		children?: { href: string; label: string; icon: Component; minRole: AdminRole }[];
	};

	// $derived so labels re-translate when language (_messages) changes
	const allNavItems = $derived<NavItem[]>([
		{ href: '/warroom',      label: $t('nav.warroom',       '戰情室'),         icon: MonitorPlay,      minRole: 'viewer' },
		{ href: '/dashboard',    label: $t('nav.dashboard',     'Dashboard'),     icon: LayoutDashboard,  minRole: 'viewer' },
		// Fleet: device list → click a device → /fleet/{id} detail with models/services/monitor tabs
		{ href: '/fleet',        label: $t('nav.fleet',         'Fleet'),         icon: Server,            minRole: 'ops_admin' },
		{ href: '/users',        label: $t('nav.users',         'Users'),         icon: Users,             minRole: 'user_admin' },
		{ href: '/departments',  label: $t('nav.departments',   'Departments'),   icon: Building2,         minRole: 'user_admin' },
		{ href: '/authentik',    label: $t('nav.groups',        'SSO Groups'),    icon: Shield,            minRole: 'ops_admin' },
		{ href: '/model-access', label: $t('nav.model_access',  '模型權限'),       icon: Cpu,               minRole: 'ops_admin' },
		{ href: '/devices',      label: $t('nav.devices',       'Devices'),       icon: Monitor,           minRole: 'user_admin' },
		{ href: '/tokens',       label: $t('nav.tokens',        'Tokens'),        icon: Key,               minRole: 'user_admin' },
		{ href: '/skills',       label: $t('nav.skills',        'Skills'),        icon: BookOpen,          minRole: 'ops_admin' },
		{ href: '/usage',        label: $t('nav.usage',         'Usage & ROI'),   icon: TrendingUp,        minRole: 'user_admin' },
		{ href: '/secrets',      label: $t('nav.secrets',       'Secrets'),       icon: Key,               minRole: 'super_admin' },
		{ href: '/sessions',     label: $t('nav.sessions',      'Sessions'),      icon: Monitor,           minRole: 'super_admin' },
		{ href: '/license',      label: $t('nav.license',       'License'),       icon: BadgeCheck,        minRole: 'super_admin' },
		{ href: '/rbac',         label: $t('nav.rbac',          '角色管理'),       icon: Shield,            minRole: 'super_admin' },
		{ href: '/audit',        label: $t('nav.audit',         'Audit Log'),     icon: ScrollText,        minRole: 'viewer' },
		{ href: '/notifications',label: $t('nav.notifications', 'Notifications'), icon: Bell,              minRole: 'ops_admin' },
		{ href: '/alerting',     label: $t('nav.alerting',      '告警規則'),       icon: AlertTriangle,     minRole: 'ops_admin' },
		{ href: '/notification-channels', label: $t('nav.notification_channels', '通知通道'), icon: MessageSquare, minRole: 'super_admin' },
	]);

	const navItems = $derived(
		allNavItems
			.filter(item => hasRole($currentRole as AdminRole, item.minRole))
			.map(item => ({
				...item,
				children: item.children?.filter(c => hasRole($currentRole as AdminRole, c.minRole)),
			}))
	);

	const ROLE_LABELS = $derived<Record<string, string>>({
		super_admin: $t('role.super_admin', '超級管理員'),
		ops_admin:   $t('role.ops_admin',   '維運管理員'),
		user_admin:  $t('role.user_admin',  '用戶管理員'),
		viewer:      $t('role.viewer',      '觀察者'),
	});

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	async function handleLogout() {
		await logout();
		// Also end Authentik session if OIDC was used
		const cfg = $authConfig;
		if (cfg?.oidc_enabled && cfg.oidc_end_session_url) {
			const endSessionUrl = cfg.oidc_end_session_url +
				`?post_logout_redirect_uri=${encodeURIComponent(window.location.origin + '/login')}`;
			window.location.href = endSessionUrl;
		} else {
			goto('/login');
		}
	}
</script>

<!-- Mobile overlay -->
{#if sidebarOpen}
	<button
		class="fixed inset-0 z-[99] bg-black/50 lg:hidden"
		onclick={() => (sidebarOpen = false)}
		aria-label="Close menu"
	></button>
{/if}

<!-- Mobile hamburger -->
<button
	class="fixed top-3 left-3 z-[200] flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary lg:hidden hover:text-text-primary"
	onclick={() => (sidebarOpen = !sidebarOpen)}
	aria-label="Toggle menu"
>
	{#if sidebarOpen}
		<X size={18} />
	{:else}
		<Menu size={18} />
	{/if}
</button>

<div class="flex min-h-screen bg-background">
	<!-- Sidebar -->
	<aside
		class={cn(
			'fixed top-0 left-0 z-[100] flex h-screen w-56 flex-col border-r border-border bg-sidebar-bg transition-transform duration-200',
			'lg:translate-x-0',
			sidebarOpen ? 'translate-x-0' : '-translate-x-full'
		)}
	>
		<!-- User + branding -->
		<div class="border-b border-border px-4 py-3 space-y-2">
			{#if $currentUser}
			<div class="flex items-center gap-2.5">
				<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
					{$currentUser.slice(0, 1).toUpperCase()}
				</div>
				<div class="min-w-0">
					<div class="text-sm font-medium text-text-primary truncate">{$currentUser}</div>
					<div class="text-xs text-text-disabled">{ROLE_LABELS[$currentRole ?? ''] ?? 'Admin'}</div>
				</div>
			</div>
			{/if}
			<div class="text-xs font-bold uppercase tracking-widest text-text-disabled">
				<span class="text-primary">YID</span> AI
			</div>
		</div>

		<!-- Nav -->
		<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
			{#each navItems as item}
				{@const groupActive = isActive(item.href) || (item.children?.some(c => isActive(c.href)) ?? false)}
				<a
					href={item.href}
					class={cn(
						'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
						isActive(item.href)
							? 'bg-sidebar-active-bg text-sidebar-text-active border-l-2 border-primary'
							: 'text-sidebar-text hover:bg-sidebar-active-bg hover:text-sidebar-text-active'
					)}
				>
					<item.icon size={15} />
					{item.label}
				</a>
				<!-- Sub-nav: shown when this group or any of its children is active -->
				{#if item.children && item.children.length > 0 && groupActive}
					<div class="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
						{#each item.children as child}
							<a
								href={child.href}
								class={cn(
									'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors',
									isActive(child.href)
										? 'bg-sidebar-active-bg text-sidebar-text-active font-medium'
										: 'text-sidebar-text hover:bg-sidebar-active-bg hover:text-sidebar-text-active'
								)}
							>
								<child.icon size={13} />
								{child.label}
							</a>
						{/each}
					</div>
				{/if}
			{/each}
		</nav>

		<!-- Language + Theme + Logout -->
		<div class="border-t border-border p-2 space-y-1">
			<!-- Language + Theme row -->
			<div class="flex items-center gap-1 px-1">
				<select
					value={$currentLang}
					onchange={e => setLang((e.target as HTMLSelectElement).value)}
					class="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text-secondary outline-none focus:border-primary appearance-none cursor-pointer"
				>
					{#each SUPPORTED_LANGS as l}
					<option value={l.code} selected={$currentLang === l.code}>{l.label}</option>
					{/each}
				</select>
				<button
					type="button"
					onclick={toggleTheme}
					class="shrink-0 rounded-md border border-border p-1.5 text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-colors"
					title={$theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
				>
					{#if $theme === 'dark'}
						<Sun size={14} />
					{:else}
						<Moon size={14} />
					{/if}
				</button>
			</div>
			<button
				onclick={handleLogout}
				class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-danger hover:bg-danger-bg transition-colors"
			>
				<LogOut size={15} />
				{$t('nav.logout', 'Logout')}
			</button>
		</div>
	</aside>

	<!-- Main content -->
	<main class="flex-1 lg:pl-56">
		<!-- Global loading bar — shows when a request exceeds 0.5s, stays ≥1s -->
		{#if $globalLoading}
		<div class="fixed top-0 left-0 right-0 z-[60] h-0.5 overflow-hidden lg:left-56">
			<div class="h-full w-full bg-primary/30">
				<div class="h-full w-1/3 animate-[loading-slide_1s_ease-in-out_infinite] bg-primary"></div>
			</div>
		</div>
		{/if}
		<div class="min-h-screen p-6 pt-14 lg:pt-6">
			{@render children()}
		</div>
	</main>
</div>

<!-- Idle timeout warning dialog -->
{#if showIdleWarning}
<div class="fixed inset-0 z-[500] flex items-center justify-center bg-black/60">
	<div class="w-80 rounded-xl border border-warning bg-surface p-6 shadow-2xl">
		<div class="mb-3 flex items-center gap-2">
			<span class="text-lg">⏰</span>
			<h3 class="text-sm font-semibold text-text-primary">閒置逾時警告</h3>
		</div>
		<p class="mb-4 text-sm text-text-secondary">
			您已閒置一段時間，將在
			<strong class="text-warning">{idleSecondsLeft}</strong> 秒後自動登出。
		</p>
		<div class="flex gap-2">
			<button
				onclick={stayActive}
				class="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
			>
				繼續使用
			</button>
			<button
				onclick={handleLogout}
				class="rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-raised"
			>
				登出
			</button>
		</div>
	</div>
</div>
{/if}

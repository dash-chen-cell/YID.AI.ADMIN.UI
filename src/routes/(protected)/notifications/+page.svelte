<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Bell, Plus, Trash2, AlertCircle, Send } from '@lucide/svelte';
	import type { NtfyUser, NtfyTopics } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	// ── Types ──────────────────────────────────────────────────────────────────
	interface NotificationsData {
		users: NtfyUser[];
		topics: NtfyTopics;
		ntfy_available: boolean;
		ntfy_url: string;
		ntfy_admin_user: string;
		error: string;
	}

	// ── Constants ──────────────────────────────────────────────────────────────
	const SYSTEM_TOPICS = ['yid-ai-alerts', 'yid-ai-notices', 'yid-ai-deploy'];
	const PERMISSION_OPTIONS = ['—', 'read', 'rw'] as const;
	type Permission = typeof PERMISSION_OPTIONS[number];

	// ── State ──────────────────────────────────────────────────────────────────
	let data = $state<NotificationsData | null>(null);
	let loading = $state(true);
	let activeTab = $state<'send' | 'topics' | 'users' | 'history'>('send');

	// Notification history
	interface NotifLog {
		id: string;
		topic: string;
		title: string | null;
		message: string;
		priority: string;
		sender: string | null;
		recipients: string | null;
		created_at: string;
		acknowledged_by: string | null;
		acknowledged_at: string | null;
		ack_note: string | null;
	}
	let history = $state<NotifLog[]>([]);
	let historyLoading = $state(false);

	// Send alert form
	let sendTopic = $state('');
	let sendTitle = $state('');
	let sendMessage = $state('');
	let sendPriority = $state('default');
	let sendLoading = $state(false);

	// Add user dialog
	let addUserDialog = $state<HTMLDialogElement | null>(null);
	let addUsername = $state('');
	let addPassword = $state('');
	let addRole = $state<'admin' | 'user'>('user');
	let addTopics = $state<string[]>([]);
	let addUserLoading = $state(false);

	// Delete user dialog
	let deleteUserDialog = $state<HTMLDialogElement | null>(null);
	let deleteUserTarget = $state('');
	let deleteUserLoading = $state(false);

	// Manage access dialog (per-topic)
	let manageAccessDialog = $state<HTMLDialogElement | null>(null);
	let manageTopic = $state('');
	let managePermissions = $state<Record<string, Permission>>({});
	let manageLoading = $state<Record<string, boolean>>({});

	// Permission update loading: keyed by `username:topic`
	let permLoading = $state<Record<string, boolean>>({});

	// ── Derived ────────────────────────────────────────────────────────────────
	const topicNames = $derived(data ? Object.keys(data.topics) : []);

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const result = await apiGet<NotificationsData>('/notifications', { silent: true });
		result.match(
			(d) => {
				data = d;
				if (!sendTopic && Object.keys(d.topics).length > 0) {
					sendTopic = Object.keys(d.topics)[0];
				}
			},
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}

	onMount(load);

	// ── Send Alert ────────────────────────────────────────────────────────────
	async function sendAlert(e: Event) {
		e.preventDefault();
		if (sendLoading) return;
		if (!sendTopic || !sendMessage.trim()) return;
		sendLoading = true;
		const result = await apiPost('/notifications/send', {
			topic: sendTopic,
			message: sendMessage.trim(),
			title: sendTitle.trim() || undefined,
			priority: sendPriority
		});
		result.match(
			() => {
				toast.success('Notification sent');
				sendMessage = '';
				sendTitle = '';
			},
			(e) => toast.error(errorMessage(e))
		);
		sendLoading = false;
	}

	// ── Add User ──────────────────────────────────────────────────────────────
	function openAddUserDialog() {
		addUsername = '';
		addPassword = '';
		addRole = 'user';
		addTopics = [];
		addUserDialog?.showModal();
	}

	async function addUser(e: Event) {
		e.preventDefault();
		if (addUserLoading) return;
		addUserLoading = true;
		const result = await apiPost('/notifications/users', {
			username: addUsername.trim(),
			password: addPassword,
			role: addRole,
			topics: addTopics
		});
		result.match(
			() => {
				toast.success(`Notification user "${addUsername}" created`);
				addUserDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		addUserLoading = false;
	}

	function toggleAddTopic(topic: string) {
		if (addTopics.includes(topic)) {
			addTopics = addTopics.filter(t => t !== topic);
		} else {
			addTopics = [...addTopics, topic];
		}
	}

	// ── Delete User ───────────────────────────────────────────────────────────
	function openDeleteUserDialog(username: string) {
		deleteUserTarget = username;
		deleteUserDialog?.showModal();
	}

	async function deleteUser(e: Event) {
		e.preventDefault();
		if (deleteUserLoading) return;
		deleteUserLoading = true;
		const result = await apiDelete(`/notifications/users/${deleteUserTarget}`);
		result.match(
			() => {
				toast.success(`User "${deleteUserTarget}" deleted`);
				deleteUserDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		deleteUserLoading = false;
	}

	// ── Permission Updates ────────────────────────────────────────────────────
	async function updatePermission(username: string, topic: string, permission: string) {
		const key = `${username}:${topic}`;
		if (permLoading[key]) return;
		permLoading[key] = true;
		const perm = permission === '—' ? '' : permission;
		const result = await apiPost(`/notifications/users/${username}/access`, {
			topic,
			permission: perm
		});
		result.match(
			() => {
				// Update local state
				if (data) {
					const user = data.users.find(u => u.username === username);
					if (user) {
						if (perm) {
							user.topics[topic] = perm;
						} else {
							delete user.topics[topic];
						}
						data = { ...data };
					}
				}
			},
			(e) => toast.error(errorMessage(e))
		);
		permLoading[key] = false;
	}

	function getUserPermission(user: NtfyUser, topic: string): Permission {
		const p = user.topics[topic];
		if (p === 'ro' || p === 'read') return 'read';
		if (p === 'rw') return 'rw';
		return '—';
	}

	// ── Manage Access Dialog ──────────────────────────────────────────────────
	function openManageAccess(topic: string) {
		manageTopic = topic;
		managePermissions = {};
		if (data) {
			for (const u of data.users) {
				managePermissions[u.username] = getUserPermission(u, topic);
			}
		}
		manageAccessDialog?.showModal();
	}

	async function applyBatchAccess(e: Event) {
		e.preventDefault();
		if (!data) return;
		const permissions = Object.entries(managePermissions).map(([username, perm]) => ({
			username,
			permission: perm === '—' ? '' : perm
		}));
		const result = await apiPost(`/notifications/topics/${manageTopic}/batch-access`, {
			permissions
		});
		result.match(
			() => {
				toast.success('Permissions updated');
				manageAccessDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
	}

	function setAllPermissions(perm: Permission) {
		const updated: Record<string, Permission> = {};
		for (const key of Object.keys(managePermissions)) {
			updated[key] = perm;
		}
		managePermissions = updated;
	}

	// ── Topic add/delete (old form endpoints) ─────────────────────────────────
	async function deleteTopic(topicName: string) {
		const formData = new FormData();
		const res = await fetch(`/notifications/topics/${topicName}/delete`, {
			method: 'POST',
			body: formData,
			credentials: 'same-origin'
		});
		if (res.ok) {
			toast.success(`Topic "${topicName}" deleted`);
			load();
		} else {
			toast.error(`Failed to delete topic`);
		}
	}

	function subscriberCount(topicName: string): number {
		if (!data) return 0;
		return data.users.filter(u => topicName in u.topics).length;
	}

	async function loadHistory() {
		historyLoading = true;
		const result = await apiGet<NotifLog[]>('/notifications/history?limit=50');
		result.match((d) => { history = d; }, () => {});
		historyLoading = false;
	}

	$effect(() => {
		if (activeTab === 'history' && history.length === 0) {
			loadHistory();
		}
	});

	async function acknowledgeNotification(id: string) {
		const result = await apiPost(`/notifications/history/${id}/acknowledge`, { note: '' });
		result.match(
			() => { toast.success('已標記為已處理'); loadHistory(); },
			() => toast.error('操作失敗')
		);
	}

	const tabLabels: Record<string, () => string> = {
		send: () => $t('notifications.tab.send', 'Send Alert'),
		topics: () => $t('notifications.tab.topics', 'Topics'),
		users: () => $t('notifications.tab.users', 'Users & Permissions'),
		history: () => $t('notifications.tab.history', 'Send History'),
	};
</script>

<svelte:head><title>Notifications — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-xl font-bold text-text-primary">{$t('notifications.title', 'Notifications')}</h1>
		<p class="mt-1 text-sm text-text-secondary">Manage ntfy push notification channels and access</p>
	</div>

	{#if loading}
		<SkeletonTable rows={8} cols={4} />
	{:else if data}
		{#if !data.ntfy_available}
			<div class="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg p-4 text-sm text-warning">
				<AlertCircle size={16} class="mt-0.5 shrink-0" />
				<div>
					<p class="font-medium">ntfy unavailable</p>
					{#if data.error}
						<p class="mt-1 text-xs opacity-80">{data.error}</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Tabs -->
		<div>
			<div class="flex gap-1 border-b border-border">
				{#each (['send', 'topics', 'users', 'history'] as const) as tab}
					<button
						onclick={() => activeTab = tab}
						class={cn(
							'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
							activeTab === tab
								? 'border-primary text-primary'
								: 'border-transparent text-text-secondary hover:text-text-primary'
						)}
					>
						{tabLabels[tab]()}
					</button>
				{/each}
			</div>

			<!-- ── Send Alert Tab ── -->
			{#if activeTab === 'send'}
				<div class="mt-6 grid gap-6 lg:grid-cols-2">
				<div>
					<h3 class="mb-4 text-sm font-semibold text-text-primary">{$t('notifications.send_title', 'Send Push Notification')}</h3>
					<form onsubmit={sendAlert} class="space-y-4">
						<div>
							<label for="send-topic" class="mb-1 block text-xs font-medium text-text-secondary">{$t('notifications.topic', 'Topic')} <span class="text-danger">*</span></label>
							<select
								id="send-topic"
								bind:value={sendTopic}
								required
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
							>
								{#each topicNames as topic}
									<option value={topic}>{topic}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="send-title" class="mb-1 block text-xs font-medium text-text-secondary">{$t('notifications.title_field', 'Title')} (optional)</label>
							<input
								id="send-title"
								bind:value={sendTitle}
								placeholder="Notification title"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
							/>
						</div>
						<div>
							<label for="send-message" class="mb-1 block text-xs font-medium text-text-secondary">{$t('notifications.message', 'Message')} <span class="text-danger">*</span></label>
							<textarea
								id="send-message"
								bind:value={sendMessage}
								required
								rows={4}
								placeholder="Notification message…"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary resize-none"
							></textarea>
						</div>
						<div>
							<label for="send-priority" class="mb-1 block text-xs font-medium text-text-secondary">{$t('notifications.priority', 'Priority')}</label>
							<select
								id="send-priority"
								bind:value={sendPriority}
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
							>
								<option value="min">min</option>
								<option value="low">low</option>
								<option value="default">default</option>
								<option value="high">high</option>
								<option value="urgent">urgent</option>
							</select>
						</div>
						<button
							type="submit"
							disabled={sendLoading || !sendTopic || !sendMessage.trim()}
							class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
						>
							<Send size={14} />
							{sendLoading ? $t('notifications.sending', 'Sending…') : $t('notifications.send', 'Send Notification')}
						</button>
					</form>
				</div>

			<!-- right column: mobile setup -->
			{#if data}
				<div class="rounded-xl border border-border bg-surface p-5 h-fit">
					<h3 class="mb-3 text-sm font-semibold text-text-primary">{$t('notifications.mobile_setup', 'Mobile Setup')}</h3>
					<ol class="space-y-2 text-sm text-text-secondary">
						<li>
							<span class="font-medium text-text-primary">1.</span>
							Install <strong class="text-text-primary">ntfy</strong> app —
							<a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" class="text-text-link hover:underline">iOS</a>
							/
							<a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" class="text-text-link hover:underline">Android</a>
						</li>
						<li>
							<span class="font-medium text-text-primary">2.</span>
							Add server:
							<code class="ml-1 rounded bg-background px-2 py-0.5 text-xs text-text-primary">
								https://ai.yid.office.tw/ntfy
							</code>
							<span class="ml-1 text-xs text-warning">不要加 :8082</span>
						</li>
						<li><span class="font-medium text-text-primary">3.</span> Log in with your ntfy account</li>
						<li><span class="font-medium text-text-primary">4.</span> Subscribe to relevant topics</li>
					</ol>
					{#if topicNames.length > 0}
						<div class="mt-3 border-t border-border pt-3">
							<p class="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wide">{$t('notifications.available_topics', 'Available Topics')}</p>
							<div class="flex flex-wrap gap-1.5">
								{#each topicNames as topic}
									<span class="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs text-primary font-mono">{topic}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
			</div><!-- end grid -->
			{/if}<!-- end send tab -->

			<!-- ── History Tab ── -->
			{#if activeTab === 'history'}
				{#if historyLoading}
				<div class="mt-6">
					<SkeletonTable rows={8} cols={7} />
				</div>
				{:else if history.length === 0}
				<div class="mt-6 text-center py-12 text-text-secondary">
					<Bell size={32} class="mx-auto mb-2" />
					<p class="text-sm">{$t('notifications.history.no_records', 'No send history yet')}</p>
				</div>
				{:else}
				<div class="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('dashboard.time', 'Time')}</th>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('notifications.topic', 'Topic')}</th>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('notifications.title_field', 'Title')}</th>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('notifications.priority', 'Priority')}</th>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">{$t('notifications.history.sender', 'Sender')}</th>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('notifications.history.recipients', 'Recipients')}</th>
									<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">已確認</th>
								</tr>
							</thead>
							<tbody>
								{#each history as log}
								<tr class="border-t border-border hover:bg-surface-raised">
									<td class="px-5 py-3 text-xs text-text-secondary whitespace-nowrap">{new Date(log.created_at).toLocaleString('zh-TW', {hour12: false})}</td>
									<td class="px-5 py-3 text-sm font-mono text-primary">{log.topic}</td>
									<td class="px-5 py-3 text-sm text-text-primary max-w-xs truncate">{log.title ?? '—'}</td>
									<td class="px-5 py-3 text-xs">
										<span class={cn('rounded-full px-2 py-0.5 font-medium',
											log.priority === 'urgent' ? 'bg-danger-bg text-danger' :
											log.priority === 'high' ? 'bg-warning-bg text-warning' :
											'bg-surface-raised text-text-secondary'
										)}>{log.priority}</span>
									</td>
									<td class="px-5 py-3 text-sm font-mono text-text-secondary">{log.sender ?? '—'}</td>
									<td class="px-5 py-3 text-xs text-text-secondary">
										{#if log.recipients}
											{@const list = JSON.parse(log.recipients) as string[]}
											<span class="font-mono">{list.length} 人</span>
											<span class="text-text-disabled ml-1">({list.slice(0,3).join(', ')}{list.length > 3 ? '...' : ''})</span>
										{:else}
											—
										{/if}
									</td>
									<td class="px-5 py-3 text-xs whitespace-nowrap">
										{#if log.acknowledged_by}
											<span class="text-success">✓ {log.acknowledged_by}</span>
											{#if log.ack_note}<div class="text-text-disabled text-xs">{log.ack_note}</div>{/if}
										{:else if log.priority === 'urgent' || log.priority === 'high'}
											<button onclick={() => acknowledgeNotification(log.id)}
												class="rounded-md bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning hover:bg-warning/20">
												標記已處理
											</button>
										{:else}
											<span class="text-text-disabled">—</span>
										{/if}
									</td>
								</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				{/if}
			{/if}

			<!-- ── Topics Tab ── -->
			{#if activeTab === 'topics'}
				<div class="mt-6 space-y-4">
					<div class="flex items-center justify-between flex-wrap gap-3">
						<p class="text-sm text-text-secondary">{topicNames.length} topics</p>
						<div class="flex items-center gap-2">
							<p class="text-xs text-text-disabled">Add topic uses the legacy endpoint (form POST to /notifications/topics/add)</p>
						</div>
					</div>

					{#if topicNames.length === 0}
						<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-12 text-text-secondary">
							<Bell size={32} />
							<p class="text-sm">{$t('common.no_data', 'No data')}</p>
						</div>
					{:else}
						<div class="overflow-hidden rounded-xl border border-border bg-surface">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead>
										<tr>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('notifications.topic', 'Topic')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">Description</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">Subscribers</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.actions', 'Actions')}</th>
										</tr>
									</thead>
									<tbody>
										{#each topicNames as topicName}
											{@const isSystem = SYSTEM_TOPICS.includes(topicName)}
											<tr class="border-t border-border hover:bg-surface-raised transition-colors">
												<td class="px-5 py-3 text-sm font-mono text-text-primary">
													{topicName}
													{#if isSystem}
														<span class="ml-2 rounded-full bg-primary-subtle px-1.5 py-0.5 text-xs font-medium text-primary">system</span>
													{/if}
												</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{data.topics[topicName] || '—'}</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{subscriberCount(topicName)}</td>
												<td class="px-5 py-3 text-sm">
													<div class="flex gap-1.5">
														<button
															onclick={() => openManageAccess(topicName)}
															class="rounded-md px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-raised border border-border"
														>
															Manage Access
														</button>
														{#if !isSystem}
															<button
																onclick={() => deleteTopic(topicName)}
																class="flex items-center gap-1 rounded-md bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/20"
															>
																<Trash2 size={11} />
																{$t('common.delete', 'Delete')}
															</button>
														{/if}
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}

					<!-- Add topic note -->
					<div class="rounded-lg border border-border bg-surface p-4 text-xs text-text-secondary">
						<p class="font-medium text-text-primary mb-1">Adding topics</p>
						<p>Topic creation uses the legacy form-based endpoint. Submit a POST form to <code class="font-mono text-primary bg-background px-1 rounded">/notifications/topics/add</code> with fields <code class="font-mono bg-background px-1 rounded">topic_name</code> and <code class="font-mono bg-background px-1 rounded">topic_desc</code>.</p>
					</div>
				</div>
			{/if}

			<!-- ── Users & Permissions Tab ── -->
			{#if activeTab === 'users'}
				<div class="mt-6 space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-sm text-text-secondary">{data.users.length} notification users</p>
						<button
							onclick={openAddUserDialog}
							class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
						>
							<Plus size={14} />
							{$t('common.add', 'Add User')}
						</button>
					</div>

					{#if data.users.length === 0}
						<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-12 text-text-secondary">
							<Bell size={32} />
							<p class="text-sm">{$t('common.no_data', 'No data')}</p>
						</div>
					{:else}
						<div class="overflow-hidden rounded-xl border border-border bg-surface">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead>
										<tr>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary sticky left-0 bg-surface z-10">{$t('dashboard.user', 'User')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.role', 'Role')}</th>
											{#each topicNames as topic}
												<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">{topic}</th>
											{/each}
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.actions', 'Actions')}</th>
										</tr>
									</thead>
									<tbody>
										{#each data.users as ntfyUser}
											<tr class="border-t border-border hover:bg-surface-raised transition-colors">
												<td class="px-5 py-3 text-sm font-mono text-text-primary sticky left-0 bg-surface">{ntfyUser.username}</td>
												<td class="px-5 py-3 text-sm">
													{#if ntfyUser.role === 'admin'}
														<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">admin</span>
													{:else}
														<span class="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-secondary">user</span>
													{/if}
												</td>
												{#each topicNames as topic}
													{@const key = `${ntfyUser.username}:${topic}`}
													<td class="px-4 py-3 text-sm">
														<select
															value={getUserPermission(ntfyUser, topic)}
															disabled={permLoading[key]}
															onchange={(e) => updatePermission(ntfyUser.username, topic, (e.target as HTMLSelectElement).value)}
															class="rounded border border-border bg-background px-2 py-1 text-xs text-text-primary outline-none focus:border-primary disabled:opacity-50"
														>
															{#each PERMISSION_OPTIONS as opt}
																<option value={opt}>{opt}</option>
															{/each}
														</select>
													</td>
												{/each}
												<td class="px-5 py-3 text-sm">
													<button
														onclick={() => openDeleteUserDialog(ntfyUser.username)}
														class="flex items-center gap-1 rounded-md bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/20"
													>
														<Trash2 size={11} />
														{$t('common.delete', 'Delete')}
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Add Notification User Dialog -->
<dialog bind:this={addUserDialog}>
	<div class="px-6 py-5">
		<div class="mb-5 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">Add Notification User</h2>
			<button onclick={() => addUserDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<form onsubmit={addUser} class="space-y-4">
			<div>
				<label for="ntfy-username" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.username', 'Username')} <span class="text-danger">*</span></label>
				<input
					id="ntfy-username"
					bind:value={addUsername}
					required
					placeholder="ntfy username"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div>
				<label for="ntfy-password" class="mb-1 block text-xs font-medium text-text-secondary">Password <span class="text-danger">*</span></label>
				<input
					id="ntfy-password"
					type="password"
					bind:value={addPassword}
					required
					placeholder="Password"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div>
				<label for="ntfy-role" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.role', 'Role')}</label>
				<select
					id="ntfy-role"
					bind:value={addRole}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
				>
					<option value="user">user</option>
					<option value="admin">admin</option>
				</select>
			</div>
			{#if data && topicNames.length > 0}
				<div>
					<p class="mb-2 text-xs font-medium text-text-secondary">Subscribe to Topics</p>
					<div class="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2">
						{#each topicNames as topic}
							<label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-raised cursor-pointer text-sm text-text-primary">
								<input
									type="checkbox"
									checked={addTopics.includes(topic)}
									onchange={() => toggleAddTopic(topic)}
									class="rounded border-border accent-primary"
								/>
								{topic}
							</label>
						{/each}
					</div>
				</div>
			{/if}
			<div class="flex justify-end gap-2 pt-2">
				<button type="button" onclick={() => addUserDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={addUserLoading || !addUsername.trim() || !addPassword}
					class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
				>
					{addUserLoading ? $t('common.saving', 'Saving…') : $t('common.add', 'Add')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<!-- Delete Notification User Dialog -->
<dialog bind:this={deleteUserDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">Delete Notification User</h2>
			<button onclick={() => deleteUserDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<p class="mb-5 text-sm text-text-secondary">
			{$t('common.delete', 'Delete')} ntfy user <span class="font-mono font-medium text-text-primary">{deleteUserTarget}</span>?
			This will revoke their access to all topics.
		</p>
		<form onsubmit={deleteUser}>
			<div class="flex justify-end gap-2">
				<button type="button" onclick={() => deleteUserDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={deleteUserLoading}
					class="rounded-md bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
				>
					{deleteUserLoading ? $t('common.saving', 'Saving…') : $t('common.delete', 'Delete')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<!-- Manage Topic Access Dialog -->
<dialog bind:this={manageAccessDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">
				Manage Access — <span class="font-mono">{manageTopic}</span>
			</h2>
			<button onclick={() => manageAccessDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>

		<!-- Quick set all -->
		<div class="mb-4 flex items-center gap-2">
			<span class="text-xs text-text-secondary">Quick set all:</span>
			{#each PERMISSION_OPTIONS as perm}
				<button
					onclick={() => setAllPermissions(perm)}
					class="rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-raised"
				>
					{perm}
				</button>
			{/each}
		</div>

		<form onsubmit={applyBatchAccess} class="space-y-3">
			<div class="max-h-64 overflow-y-auto space-y-2">
				{#if data}
					{#each data.users as ntfyUser}
						<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
							<span class="text-sm font-mono text-text-primary">{ntfyUser.username}</span>
							<select
								bind:value={managePermissions[ntfyUser.username]}
								class="rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary outline-none focus:border-primary"
							>
								{#each PERMISSION_OPTIONS as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						</div>
					{/each}
				{/if}
			</div>
			<div class="flex justify-end gap-2 pt-2">
				<button type="button" onclick={() => manageAccessDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
				>
					{$t('common.save', 'Apply')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<style>
	dialog {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 0;
		width: 480px;
		max-width: 95vw;
		color: var(--color-text-primary);
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		box-shadow: 0 8px 32px rgba(0,0,0,.4);
	}
	dialog::backdrop {
		background: rgba(0,0,0,.55);
	}
</style>

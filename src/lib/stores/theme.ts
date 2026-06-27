import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'dark' | 'light';

function getStoredTheme(): Theme {
	if (!browser) return 'dark';
	return (localStorage.getItem('yid_theme') as Theme) ?? 'dark';
}

function applyTheme(theme: Theme) {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', theme);
	localStorage.setItem('yid_theme', theme);
}

const _theme = writable<Theme>(getStoredTheme());

export const theme = { subscribe: _theme.subscribe };

export function setTheme(t: Theme) {
	_theme.set(t);
	applyTheme(t);
}

export function toggleTheme() {
	_theme.update(current => {
		const next: Theme = current === 'dark' ? 'light' : 'dark';
		applyTheme(next);
		return next;
	});
}

// Apply theme on init
if (browser) {
	applyTheme(getStoredTheme());
}

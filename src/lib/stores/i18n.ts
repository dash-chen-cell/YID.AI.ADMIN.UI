import { writable, derived } from 'svelte/store';

type Messages = Record<string, string>;

export interface LangMeta {
	code: string;
	label: string;      // display name in the language itself
	labelEn: string;    // English label for reference
}

// Supported languages — add more by creating /static/i18n/{code}.json
export const SUPPORTED_LANGS: LangMeta[] = [
	{ code: 'zh-TW', label: '繁體中文', labelEn: 'Traditional Chinese' },
	{ code: 'en',    label: 'English',  labelEn: 'English' },
	// To add a new language: add entry here and create /static/i18n/{code}.json
	// { code: 'ja',    label: '日本語',   labelEn: 'Japanese' },
	// { code: 'ko',    label: '한국어',   labelEn: 'Korean' },
];

const SUPPORTED_CODES = SUPPORTED_LANGS.map(l => l.code);
type Lang = string;

function getCookieLang(): Lang {
	if (typeof document === 'undefined') return 'zh-TW';
	const m = document.cookie.match(/(?:^|;\s*)yid_lang=([^;]+)/);
	const v = m?.[1] ?? 'zh-TW';
	return SUPPORTED_CODES.includes(v) ? v : 'zh-TW';
}

const _lang = writable<Lang>(getCookieLang());
const _messages = writable<Messages>({});

export const lang = { subscribe: _lang.subscribe };

// t(key, fallback?) — reactive translation function
export const t = derived(_messages, ($m) => (key: string, fallback?: string): string => {
	return $m[key] ?? fallback ?? key;
});

export async function loadLang(l?: Lang): Promise<void> {
	const target = l ?? getCookieLang();
	try {
		const res = await fetch(`/i18n/${target}.json`);
		if (!res.ok) throw new Error('fetch failed');
		const messages = await res.json() as Messages;
		_messages.set(messages);
		_lang.set(target);
	} catch {
		// Fallback: try en
		if (target !== 'en') {
			try {
				const res = await fetch('/i18n/en.json');
				const messages = await res.json() as Messages;
				_messages.set(messages);
				_lang.set('en');
			} catch { /* silent */ }
		}
	}
}

export function setLang(l: Lang): void {
	document.cookie = `yid_lang=${l}; path=/; max-age=${365 * 24 * 3600}; SameSite=Strict`;
	loadLang(l);
}

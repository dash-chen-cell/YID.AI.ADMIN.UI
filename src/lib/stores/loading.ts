import { writable, derived } from 'svelte/store';

/**
 * Global request-loading indicator with debounce + minimum-visible time.
 *
 * Behavior (per the UX rule):
 * - A request that resolves in < 0.5s shows NO spinner (avoids flicker).
 * - If a request is still pending at 0.5s, the spinner appears...
 * - ...and stays visible for at least 1s once shown (avoids flash).
 *
 * The API client calls beginRequest()/endRequest() around every fetch.
 */

const SHOW_DELAY_MS = 500;   // wait this long before showing
const MIN_VISIBLE_MS = 1000; // once shown, keep visible at least this long

const _visible = writable(false);
export const globalLoading = { subscribe: _visible.subscribe };

let inFlight = 0;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let shownAt = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

let visible = false;  // mirrors the store so endRequest doesn't depend on timer state

export function beginRequest(): void {
	inFlight++;
	if (inFlight !== 1) return;
	// First in-flight request. Cancel any pending hide (a previous batch's
	// min-visible window). If already visible, keep it visible; otherwise
	// start the show-delay timer.
	if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
	if (!visible && !showTimer) {
		showTimer = setTimeout(() => {
			showTimer = null;
			visible = true;
			shownAt = performance.now();
			_visible.set(true);
		}, SHOW_DELAY_MS);
	}
}

export function endRequest(): void {
	inFlight = Math.max(0, inFlight - 1);
	if (inFlight > 0) return;

	// No more in-flight requests.
	// Cancel a pending show — nothing ever became visible, no flicker.
	if (showTimer) {
		clearTimeout(showTimer);
		showTimer = null;
	}
	// If the bar is (or was about to be) hidden, ensure it's hidden.
	if (!visible) {
		return;
	}
	// Bar is visible — keep it for the minimum visible time, then hide.
	const elapsed = performance.now() - shownAt;
	const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
	if (hideTimer) clearTimeout(hideTimer);
	hideTimer = setTimeout(() => {
		hideTimer = null;
		if (inFlight === 0) {
			visible = false;
			_visible.set(false);
		}
	}, remaining);
}

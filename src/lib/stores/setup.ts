import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface SetupState {
	currentStep: number;
	stepsDone: string[];
	domain: string;
	selectedModels: string[];
}

const STORAGE_KEY = 'yid_setup_state';

function loadFromStorage(): SetupState {
	if (!browser) {
		return { currentStep: 0, stepsDone: [], domain: '', selectedModels: [] };
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as SetupState;
	} catch {
		// ignore
	}
	return { currentStep: 0, stepsDone: [], domain: '', selectedModels: [] };
}

function createSetupStore() {
	const { subscribe, set, update } = writable<SetupState>(loadFromStorage());

	function persist(state: SetupState) {
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch {
				// ignore storage errors
			}
		}
	}

	return {
		subscribe,
		set(state: SetupState) {
			persist(state);
			set(state);
		},
		update(fn: (s: SetupState) => SetupState) {
			update((s) => {
				const next = fn(s);
				persist(next);
				return next;
			});
		},
		markStepDone(stepId: string) {
			update((s) => {
				const next = {
					...s,
					stepsDone: s.stepsDone.includes(stepId) ? s.stepsDone : [...s.stepsDone, stepId]
				};
				persist(next);
				return next;
			});
		},
		setDomain(domain: string) {
			update((s) => {
				const next = { ...s, domain };
				persist(next);
				return next;
			});
		},
		setSelectedModels(models: string[]) {
			update((s) => {
				const next = { ...s, selectedModels: models };
				persist(next);
				return next;
			});
		},
		setCurrentStep(step: number) {
			update((s) => {
				const next = { ...s, currentStep: step };
				persist(next);
				return next;
			});
		},
		reset() {
			const fresh: SetupState = { currentStep: 0, stepsDone: [], domain: '', selectedModels: [] };
			if (browser) {
				try {
					localStorage.removeItem(STORAGE_KEY);
				} catch {
					// ignore
				}
			}
			set(fresh);
		}
	};
}

export const setupState = createSetupStore();

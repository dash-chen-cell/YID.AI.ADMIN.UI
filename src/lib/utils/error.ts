import type { AppError } from '$lib/types';

export function errorMessage(e: AppError): string {
	switch (e.type) {
		case 'api': return e.message;
		case 'auth': return e.reason === 'expired' ? 'Session expired' : 'Unauthorized';
		case 'validation': return e.message;
	}
}

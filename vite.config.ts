import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5174,
		proxy: {
			// Proxy API calls to admin_ui backend during development
			'/api': {
				target: 'http://127.0.0.1:9001',
				changeOrigin: true
			},
			'/models': {
				target: 'http://127.0.0.1:9001',
				changeOrigin: true
			}
		}
	}
});

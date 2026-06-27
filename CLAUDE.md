# YID AI Admin UI — Claude Code Instructions

## Skills

Skills are in `.claude/skills/`. Always load before starting work:

- **frontend-svelte-ts-tailwind** — Load for ALL frontend tasks in this project

## Stack

- Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- SvelteKit 2 with `adapter-static` (CSR, outputs to `admin-ui-dist/`)
- TypeScript strict mode
- Tailwind CSS 4 with `@theme inline` CSS variable tokens
- neverthrow for API error handling

## Key Conventions

- **Never hardcode colors** — use semantic tokens (`text-text-primary`, `bg-surface`, etc.)
- **All API calls** use `apiGet/apiPost/apiDelete` from `$lib/api/client.ts`
- **i18n** — use `$t('key', 'fallback')` for all visible text; keys in `static/i18n/`
- **RBAC** — use `hasRole($currentRole, 'min_role')` before rendering restricted UI
- **Tables with >100 rows** — use virtual scroll pattern from skill
- **Import order** — imports at top of `<script>`, never inline

## Build & Deploy

```bash
npm run build          # outputs to admin-ui-dist/
# then rsync admin-ui-dist/ to server and restart yid-admin-ui-static container
```

## Auth Store

`$lib/stores/auth.ts` exports: `currentUser`, `currentRole`, `isAuthenticated`, `hasRole`

Roles: `super_admin` > `ops_admin` > `user_admin` > `viewer`

## Backend API

Base URL: `https://admin.yid.office.tw/api/` (in production)
Dev proxy: `http://127.0.0.1:9001` (vite.config.ts)

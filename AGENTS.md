# Repository Guidelines

## Project Structure & Module Organization
Remix + Vite + Prisma stack organizes core code under `app/`, where Remix routes live in `app/routes/*.jsx`, service logic in `app/services/*.js`, and shared UI in `app/components/`. Utilities and hooks belong in `app/utils/` to keep routes lean. Static assets reside in `public/`, database schema and migrations in `prisma/`, documentation in `docs/`, automation scripts in `scripts/`, and Shopify extension workspaces in `extensions/`. Integration or exploratory tests may live under `public/` when a standalone HTML harness is easier than a Remix route.

## Build, Test, and Development Commands
- `npm run build` — Compile Remix through Vite and output production assets to `build/`.
- `npm run start` — Serve the compiled app with `remix-serve`; keep the approved tunnel URL unchanged.
- `npm run setup` — Execute Prisma generate plus migrate deploy to sync schema changes.
- `npm run lint` — Run ESLint with cache; resolve reported issues or add focused disables.
- `shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000` — Only when explicitly authorized, starts Shopify dev with the fixed tunnel.

## Coding Style & Naming Conventions
Follow ESLint and Prettier defaults committed to the repo; prefer 2-space indentation and trailing commas where supported. Name React components in `PascalCase.jsx`, utilities or services in `camelCase.js` or `kebab-case.js`, and constants in `UPPER_SNAKE_CASE`. Group imports as third-party first, then internal modules, avoiding deep relative chains by using configured tsconfig paths.

## Testing Guidelines
Adopt `vitest` or `jest` for unit coverage; mirror application folders under `tests/**` or co-locate with routes when that improves context. Prioritize deterministic tests for `app/services/*.server.js` and `app/utils/*.js`, and add regression cases whenever fixing integration bugs. Expose a future `npm run test` script before adding automated checks to CI.

## Commit & Pull Request Guidelines
Write commits using imperative Conventional Commit syntax, e.g. `feat(app): add translation queue api` or `fix(services): handle webhook error`. Keep each commit focused and include lint or schema updates produced by your change. PRs must explain motivation, link relevant issues, list validation steps, supply screenshots or logs for UX or CLI updates, and note any follow-up tasks.

## Security & Configuration Tips
Never commit credentials; rely on environment variables or the tracked `shopify.app.toml` placeholders. Run `npm run setup` after pulling migrations to keep the local SQLite database aligned. Validate and throttle webhook or GraphQL inputs, and capture errors through `app/services/*error*.server.js` utilities for consistent observability.

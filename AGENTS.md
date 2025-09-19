# Repository Guidelines

## Project Structure & Module Organization
- Remix + Vite + Prisma. Core code lives in `app/`.
- Routes: `app/routes/*.jsx`. Services: `app/services/*.js`. Shared UI: `app/components/`. Utilities/hooks: `app/utils/`.
- Static assets: `public/`. Prisma schema/migrations: `prisma/`. Docs: `docs/`. Scripts: `scripts/`. Shopify extensions: `extensions/`.
- Tests: prefer `tests/**` mirroring app folders; co-locate with routes when helpful. Some exploratory/integration tests may live in `public/` via standalone HTML.

## Build, Test, and Development Commands
- `npm run build` — Compile Remix via Vite; outputs to `build/`.
- `npm run start` — Serve compiled app with `remix-serve` (keep the approved tunnel URL unchanged).
- `npm run setup` — Run `prisma generate` and `prisma migrate deploy` to sync schema.
- `npm run lint` — Run ESLint with cache; fix or add minimal, focused disables.
- Shopify dev (authorized only): `shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000`.
- Tests: use `vitest` or `jest`. If a `npm run test` script is present, run it; otherwise invoke the chosen runner directly.

## Coding Style & Naming Conventions
- ESLint + Prettier defaults; 2-space indentation; prefer trailing commas.
- Components: `PascalCase.jsx`. Utilities/services: `camelCase.js` or `kebab-case.js`. Constants: `UPPER_SNAKE_CASE`.
- Imports: third‑party first, then internal. Avoid deep relative chains; prefer configured path aliases.

## Testing Guidelines
- Framework: `vitest` or `jest`. Mirror app folders under `tests/**` or co-locate near routes when context helps.
- Prioritize deterministic tests for `app/services/*.server.js` and `app/utils/*.js`. Add regression tests when fixing bugs.
- Keep tests fast, isolated, and explicit about inputs/outputs.

## Commit & Pull Request Guidelines
- Conventional Commits (imperative): e.g., `feat(app): add translation queue api`, `fix(services): handle webhook error`.
- Keep commits focused; include lint fixes or Prisma artifacts caused by your change.
- PRs must include: motivation, linked issues, validation steps, and screenshots/logs for UX/CLI changes. Note any follow‑ups.

## Security & Configuration Tips
- Never commit credentials; use environment variables or `shopify.app.toml` placeholders.
- After pulling migrations, run `npm run setup` to keep the local SQLite DB aligned.
- Validate and throttle webhook/GraphQL inputs; funnel errors through `app/services/*error*.server.js` for consistent observability.


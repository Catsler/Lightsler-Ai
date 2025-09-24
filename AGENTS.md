# Repository Guidelines

## Project Structure & Module Organization
- Remix source in `app/`.
  - Routes/API: `app/routes/*.jsx`
  - Services: `app/services/*.js` (Shopify, sync, queues, errors)
  - UI: `app/components/`
  - Utilities/hooks: `app/utils/`
- Database: `prisma/` (schema + migrations).
- Static assets and demo HTML: `public/`.
- Automation scripts: `scripts/`.
- Shopify extensions: `extensions/`.
- Tests: `tests/**` mirroring business dirs; co-locate beside routes when helpful.
- Build output: `build/` (clean before commit).

## Build, Test, and Development Commands
- `npm run build` — Compile Remix via Vite for SSR/client into `build/`.
- `npm run start` — Serve compiled app with `remix-serve`; ensure `.env` matches Shopify config/tunnel.
- `npm run setup` — Run `prisma generate` then `prisma migrate deploy` to sync client/schema.
- `npm run lint` — ESLint with cache; only use `// eslint-disable-next-line` with a short reason.
- `npm run test` or `vitest` — Execute tests; add `--runInBand` when DB is involved.

## Coding Style & Naming Conventions
- 2-space indent, Prettier defaults, ESLint rules; trailing commas, single quotes.
- React components: PascalCase (e.g., `CoverageCard.jsx`).
- Services/utils: camelCase or kebab-case (e.g., `languageCoverage.server.js`, `queue-manager.js`).
- Import order: third-party → internal aliases → relative; avoid deep `../../..` by using aliases.

## Testing Guidelines
- Framework: Vitest/Jest. Focus on `app/services/*.server.js` and `app/utils/*.js`.
- Use deterministic mocks for Shopify API calls.
- File names: `*.test.js` or `*.spec.js`; shared helpers in `tests/utils/`.
- Target ≥80% coverage on key services and include rollback paths. Use `--runInBand` for DB-dependent tests.

## Commit & Pull Request Guidelines
- Conventional Commits (e.g., `feat(app): add translation queue api`, `fix(services): handle webhook error`).
- PRs include motivation, linked issues, steps to verify, logs/screenshots, and noted risks/follow-ups.
- Before push: `npm run lint && npm run test && npm run setup`; ensure Prisma artifacts are correct/ignored as intended.

## Security & Configuration Tips
- Keep secrets, shop domains, and tunnel URLs in `.env` or platform env; use placeholders in `shopify.app.toml`.
- After migrations, run `npm run setup` to sync local SQLite; when switching environments, consider `prisma migrate reset`.
- Validate external callbacks and GraphQL inputs; centralize error logging under `app/services/*error*.server.js` for observability.

## Agent Notes
- Scope: applies to the entire repo; deeper `AGENTS.md` files take precedence for their subtrees.
##永远中文回答
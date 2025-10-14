# Repository Guidelines

## Project Structure & Module Organization
- Remix source lives in `app/`; routes and API handlers are under `app/routes/*.jsx`, shared services in `app/services/*.js`, UI primitives in `app/components/`, and utilities/hooks in `app/utils/`.
- Database schema and migrations reside in `prisma/`; regenerate Prisma Client after schema changes.
- Static assets and demo HTML live in `public/`; Shopify extensions are kept in `extensions/`; automation scripts belong in `scripts/`.
- Tests sit in `tests/**` or alongside their feature. Clean `build/` artifacts before committing.

## Build, Test, and Development Commands
- `npm run dev` – bootstraps the Remix dev server via `shopify app dev`.
- `npm run build` – compiles Remix SSR and client bundles to `build/` using Vite; run before releases.
- `npm run start` – serves the compiled app with `remix-serve ./build/server/index.js`.
- `npm run setup` – runs `prisma generate` and `prisma migrate deploy` to sync the client and database schema.
- `npm run lint` – executes ESLint with caching; avoid suppressions without justification.
- `npm run test` / `npx vitest --runInBand` – executes the test suite; run serially when touching database logic.

## Coding Style & Naming Conventions
- Format with Prettier defaults: 2-space indentation, single quotes, trailing commas. ESLint enforces consistent imports; external packages precede internal aliases and relatives.
- React components use PascalCase (`CoverageCard.jsx`); services/utilities favor camelCase or kebab-case (`languageCoverage.server.js`, `queue-manager.js`).
- Keep comments concise and purposeful; explain non-obvious behavior only.

## Testing Guidelines
- Prefer Vitest for unit and integration coverage; target ≥80% coverage for `app/services/*.server.js` and `app/utils/*.js`.
- Name test files `*.test.js` or `*.spec.js`; share helpers via `tests/utils/`.
- Mock Shopify APIs deterministically and run DB-affecting tests with `--runInBand` to avoid race conditions.

## Commit & Pull Request Guidelines
- Follow Conventional Commits, e.g., `feat(app): add translation queue api` or `fix(services): handle webhook error`.
- PR descriptions should outline motivation, linked issues, verification steps (`npm run lint && npm run test && npm run setup`), relevant logs/screenshots, risks, and follow-up work.

## Security & Configuration Tips
- Store Shopify secrets, shop domains, and tunnel URLs in `.env` or deployment variables; never commit real credentials.
- After new migrations, run `npm run setup` to keep local SQLite in sync; use `prisma migrate reset` when switching environments.
- Validate external callbacks and GraphQL inputs, and log errors through `app/services/*error*.server.js` for observability.

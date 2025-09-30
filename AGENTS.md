# Repository Guidelines

## Project Structure & Module Organization
- Core Remix source lives in `app/`, with routes and API handlers under `app/routes/*.jsx`, shared services in `app/services/*.js`, UI primitives in `app/components/`, and utilities or hooks in `app/utils/`.
- Database schema and migrations reside in `prisma/`; regenerate Prisma Client after schema changes.
- Static assets and demo HTML live in `public/`; Shopify extensions are kept in `extensions/`; automation scripts belong in `scripts/`.
- Tests sit in `tests/**` or alongside the feature they cover. Clean `build/` artifacts before committing.

## Build, Test, and Development Commands
- `npm run build`: Compiles Remix SSR and client bundles to `build/` using Vite; run before releases.
- `npm run start`: Serves the compiled app via `remix-serve`; requires a configured `.env` with Shopify credentials.
- `npm run setup`: Executes `prisma generate` and `prisma migrate deploy` to sync the client and database schema.
- `npm run lint`: Runs ESLint with caching; only use inline disables with documented justification.
- `npm run test` or `npx vitest --runInBand`: Executes the test suite; run serially when touching database logic.

## Coding Style & Naming Conventions
- Format with Prettier defaults, 2-space indentation, single quotes, and trailing commas.
- Import order: external packages, internal aliases, relative paths.
- React components use PascalCase (`CoverageCard.jsx`); services and utilities favor camelCase or kebab-case (`languageCoverage.server.js`, `queue-manager.js`).
- Keep comments concise and only to clarify non-obvious behavior.

## Testing Guidelines
- Prefer Vitest for unit and integration coverage; target ≥80% coverage for `app/services/*.server.js` and `app/utils/*.js`.
- Name test files `*.test.js` or `*.spec.js`; share helpers via `tests/utils/`.
- Mock Shopify APIs deterministically and run DB-affecting tests with `--runInBand` to avoid race conditions.

## Commit & Pull Request Guidelines
- Follow Conventional Commits, e.g., `feat(app): add translation queue api` or `fix(services): handle webhook error`.
- PR descriptions should outline motivation, linked issues, verification steps (`npm run lint && npm run test && npm run setup`), relevant logs/screenshots, risks, and follow-up work.
- Ensure `build/` is clean and Prisma artifacts respect `.gitignore` before pushing.

## Security & Configuration Tips
- Store Shopify secrets, shop domains, and tunnel URLs in `.env` or deployment variables; never commit real credentials.
- After new migrations, run `npm run setup` to keep local SQLite in sync; use `prisma migrate reset` when switching environments.
- Validate external callbacks and GraphQL inputs, and log errors through `app/services/*error*.server.js` for observability.

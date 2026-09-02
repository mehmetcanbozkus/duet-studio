<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Documentation

- Use Context7 MCP for current library, framework, SDK, API, CLI, and cloud service documentation before answering or coding against those tools.

## Commands

- Package manager: Bun.
- `bun run dev` starts the development server.
- `bun run build` creates a production build.
- `bun run check` runs lint, typecheck, and formatting checks.
- `bun run lint` runs ESLint.
- `bun run typecheck` runs TypeScript checks.
- `bun run format` formats with Prettier and sorts Tailwind classes.
- `bun run db:push` pushes the Drizzle schema in development.
- `bun run db:generate` generates Drizzle migrations.
- `bun run db:migrate` applies Drizzle migrations.
- `bun run db:studio` opens Drizzle Studio.

## Stack

- Next.js 16 App Router, React 19, and strict TypeScript.
- React Compiler and typed routes are enabled in `next.config.ts`.
- Better Auth handles email/password authentication in `src/server/auth.ts`.
- Drizzle ORM and PostgreSQL live under `src/server/db/`.
- Tailwind CSS 4, shadcn/ui, Radix UI, and Lucide are used for UI.
- t3-env validates environment variables in `src/env.ts`.

## Code Style

- Prefer existing project patterns over new abstractions.
- Use `@/*` imports for files under `src`.
- Keep Server Components as the default and add `"use client"` only for interactivity.
- Use `src/server/actions/` for Server Actions that are imported by Client Components.
- For form mutations, validate with Zod on the server, verify auth inside the action, model expected errors as return values, and consume them with `useActionState`.

## Environment

- Copy `.env.example` to `.env` and fill in values.
- Required: `DATABASE_URL`, `BETTER_AUTH_SECRET` (minimum 32 characters), and `BETTER_AUTH_URL`.
- Use a local or managed PostgreSQL instance and set `DATABASE_URL`.
- `SKIP_ENV_VALIDATION=1` bypasses env checks for temporary local builds.

## Architecture Notes

- Route groups: `(auth)` for sign-in/sign-up and `(pages)` for protected pages.
- `src/proxy.ts` performs optimistic auth redirects only; server-side checks still protect pages and mutations.
- `requireSession()` redirects unauthenticated users from protected server-rendered pages.
- `getSession()` uses React `cache()` for request-level deduplication.
- The database connection uses a `globalThis` cache to survive HMR in development.

# Next.js Starter

A minimal Next.js starter with authentication, database, and UI components.

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Auth**: Better Auth (email/password)
- **Database**: Drizzle ORM + PostgreSQL
- **UI**: shadcn/ui + Tailwind CSS 4
- **Validation**: Zod + t3-env

## Getting Started

1. **Install dependencies**

```bash
bun install
```

2. **Set up environment variables**

```bash
cp .env.example .env
```

Environment variables:

| Variable             | Description                   |
| -------------------- | ----------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string  |
| `BETTER_AUTH_SECRET` | Auth secret, minimum 32 chars |
| `BETTER_AUTH_URL`    | Better Auth base URL          |

Generate a secret with `openssl rand -base64 32`.

3. **Set up database**

```bash
bun db:push      # dev: sync schema directly
# or, for production:
bun db:generate  # generate SQL migration files (commit these)
bun db:migrate   # apply migrations
```

4. **Run dev server**

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command             | Description              |
| ------------------- | ------------------------ |
| `bun dev`           | Start development server |
| `bun run build`     | Build for production     |
| `bun start`         | Start production server  |
| `bun run check`     | Run all quality checks   |
| `bun run typecheck` | Run TypeScript checks    |
| `bun db:push`       | Push schema (dev only)   |
| `bun db:generate`   | Generate migration files |
| `bun db:migrate`    | Run migrations (prod)    |
| `bun db:studio`     | Open Drizzle Studio      |
| `bun lint`          | Run ESLint               |
| `bun format`        | Format with Prettier     |
| `bun format:check`  | Check formatting         |

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Auth pages (sign-in, sign-up)
│   ├── (pages)/              # Protected pages with shared layout
│   │   ├── dashboard/        # Dashboard (with loading state)
│   │   └── profile/          # User profile (with loading state)
│   ├── api/auth/             # Better Auth catch-all route
│   ├── error.tsx             # Root error boundary
│   ├── layout.tsx            # Root layout and providers
│   ├── not-found.tsx         # 404 page
│   └── page.tsx              # Public landing page
├── components/               # React components
│   ├── auth/                 # Auth forms
│   ├── theme/                # Theme provider and toggle
│   ├── ui/                   # shadcn/ui components
│   ├── dashboard-header.tsx  # Protected page navigation
│   ├── page-skeleton.tsx     # Shared loading skeleton
│   ├── profile-form.tsx      # Profile Server Action form
│   └── user-menu.tsx         # Account navigation and sign-out
├── env.ts                    # Environment validation
├── lib/                      # Client auth and utilities
├── proxy.ts                  # Optimistic auth redirects
└── server/
    ├── actions/              # Server Actions with validation
    ├── auth.ts               # Better Auth server config
    ├── session.ts            # Cached session helpers
    └── db/                   # Drizzle client and schema
```

## Before Production

Auth ships with the minimum email/password configuration. Address these in `src/server/auth.ts` before deploying a real app:

1. **Password reset** — configure [`emailAndPassword.sendResetPassword`](https://www.better-auth.com/docs/authentication/email-password#forgot-password) with an email provider and add a "Forgot password?" flow. Without it the reset endpoint responds with `RESET_PASSWORD_DISABLED`.
2. **Email verification** — configure [`emailVerification.sendVerificationEmail`](https://www.better-auth.com/docs/concepts/email) and set `emailAndPassword.requireEmailVerification: true`. Accounts are currently created unverified and can sign in immediately.
3. **Rate limiting storage** — the built-in limiter defaults to in-memory storage, which is ineffective on serverless. Set [`rateLimit: { storage: "database" }`](https://www.better-auth.com/docs/concepts/rate-limit) (or secondary storage).

## Conventions

- Use Server Actions for authenticated form mutations.
- Validate mutation inputs on the server and return expected errors as action state.
- Keep shared server code under `src/server/`.

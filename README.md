# KOROBO APP API

Backend REST API for KOROBO APP, built with Bun, TypeScript, Express, TypeORM, and Neon PostgreSQL.

## Stack

- Bun runtime and package manager
- TypeScript with strict type checking
- Express REST API and Socket.IO
- TypeORM migrations (schema synchronization disabled)
- API-managed authentication with bcrypt password hashes and signed, expiring JWT access tokens
- SMTP mail delivery for invitations and password resets
- Zod environment and request validation

## Development

Requirements: Bun (current stable) and access to the configured Neon project.

```bash
bun install
cp .env.example .env
bun run dev
```

Configure secrets in `.env`; never commit `.env`, database passwords, JWT secrets, or SMTP credentials.

## Neon database

Set `DATABASE_URL` to the Neon PostgreSQL connection string. Set `DATABASE_CA_CERT` only if your deployment requires a custom CA. Schema changes must be made through reviewed migrations; TypeORM synchronization is disabled.

Apply the additive authentication schema before deploying the new authentication code by running `bun run db:migrate-auth` against the configured Neon database. This idempotent command adds a nullable `password_hash` column and the `auth_tokens` table without deleting existing KOROBO data. Do not run the full `db:migrate` command on an existing database until you have confirmed that the initial schema migration is recorded in TypeORM's migrations table.

## Multi-company isolation

Every public registration creates a new company and an active `admin` owner. Email/password and Google registration both create the company and owner together. Invited team members inherit the inviter's company and can only be managed inside that company. Sites and equipment are tenant-scoped in the API; equipment history and maintenance are scoped through the owning equipment record. Existing data is backfilled into a single legacy company so no records are discarded.

Before deploying this code, apply the reviewed `20261022150000-MultiCompanyTenancy` migration to the configured database using the project migration workflow. The migration adds company ownership columns and preserves existing records. Verify the migration completes successfully before switching traffic to this API version.

## Authentication

The API manages email/password sign-in, Google OAuth, first-owner bootstrap, invitations, password reset/change, and JWT verification for REST and Socket.IO. Configure `JWT_SECRET` with at least 32 random characters and configure SMTP variables to send invitations and reset links. Configure `FRONTEND_URL` to the deployed frontend origin.

For Google sign-in, create an OAuth 2.0 **Web application** client in Google Cloud Console and set:
- `GOOGLE_CLIENT_ID`: OAuth client ID
- `GOOGLE_CLIENT_SECRET`: OAuth client secret (API only; never expose it to the frontend)
- `GOOGLE_REDIRECT_URI`: exact callback URL, for example `https://YOUR_API_HOST/auth/google/callback`

Add that exact URL under **Authorized redirect URIs** in Google Cloud Console. The login button starts at `GET /auth/google`. Google verifies the identity, but the API only signs in an already-existing, active KOROBO user whose Neon email matches Google's verified email. Roles and profile data continue to come from Neon; Google sign-in does not create users or grant roles.

The first owner is created via `POST /auth/bootstrap-owner` with `OWNER_BOOTSTRAP_TOKEN`. Remove that token after the first owner is created. Invitations and password resets require SMTP.

Existing Supabase Auth password hashes are not available to this API for direct migration. Existing user profiles are preserved, but users must set a new password via a reset/invitation flow before they can sign in with the new authentication system.

## Health checks

- `GET /health`: process health
- `GET /health/ready`: database readiness

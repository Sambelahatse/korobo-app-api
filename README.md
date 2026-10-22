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

## Authentication

The API manages email/password sign-in, first-owner bootstrap, invitations, password reset/change, and JWT verification for REST and Socket.IO. Configure `JWT_SECRET` with at least 32 random characters and configure SMTP variables to send invitations and reset links. Configure `FRONTEND_URL` to the deployed frontend origin.

The first owner is created via `POST /auth/bootstrap-owner` with `OWNER_BOOTSTRAP_TOKEN`. Remove that token after the first owner is created. Invitations and password resets require SMTP.

Existing Supabase Auth password hashes are not available to this API for direct migration. Existing user profiles are preserved, but users must set a new password via a reset/invitation flow before they can sign in with the new authentication system.

## Health checks

- `GET /health`: process health
- `GET /health/ready`: database readiness

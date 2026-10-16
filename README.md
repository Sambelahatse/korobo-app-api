# KOROBO APP API

Backend REST API for KOROBO APP, built with Bun, TypeScript, Express, TypeORM, and Supabase PostgreSQL.

## Stack

- Bun runtime and package manager
- TypeScript with strict type checking
- Express REST API
- TypeORM migrations (schema synchronization disabled)
- Supabase Auth for identity
- Zod for environment and request validation

## Development

Requirements: Bun (current stable) and access to the configured Supabase project.

```bash
bun install
cp .env.example .env
bun run dev
```

Configure local secrets in `.env`. Never commit `.env`, database passwords, or Supabase secret/service-role keys.

## Existing database

The API is intended to use the existing KOROBO schema: `app_users`, `sites`, `equipment`, `planifications`, and `rapports`.

TypeORM schema synchronization must remain disabled. Use reviewed migrations for database changes.

## Status

Initial repository scaffold in progress.

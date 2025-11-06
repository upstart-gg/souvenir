# Installation

## Prerequisites

Before installing Souvenir, ensure you have:

- **Node.js 20+**, **Bun**, or **Deno**
- **PostgreSQL** with **pgvector extension**
- An **embedding provider** (OpenAI, Cohere, or custom)

## Install Package

:::tabs key:runtime

== npm

```bash
npm install @upstart-gg/souvenir ai zod
```

== bun

```bash
bun add @upstart-gg/souvenir ai zod
```

== pnpm

```bash
pnpm add @upstart-gg/souvenir ai zod
```

== yarn

```bash
yarn add @upstart-gg/souvenir ai zod
```

:::

## Database Setup

### 1. Install PostgreSQL

If you don't have PostgreSQL installed:

:::tabs key:platform

== macOS

```bash
brew install postgresql@16
brew services start postgresql@16
```

== Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

== Docker

```bash
docker run -d \
  --name souvenir-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16
```

:::

### 2. Install pgvector

Install the pgvector extension:

:::tabs key:platform

== macOS

```bash
brew install pgvector
```

== Ubuntu/Debian

```bash
sudo apt install postgresql-16-pgvector
```

== Docker

Use the `pgvector/pgvector` image:

```bash
docker run -d \
  --name souvenir-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

:::

### 3. Create Database

```bash
createdb souvenir
```

Or via SQL:

```sql
CREATE DATABASE souvenir;
```

### 4. Run Migrations

Souvenir uses [dbmate](https://github.com/amacneil/dbmate) for migrations. Install it:

:::tabs key:platform

== macOS

```bash
brew install dbmate
```

== Linux

```bash
sudo curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64
sudo chmod +x /usr/local/bin/dbmate
```

== npm

```bash
npm install -g dbmate
```

:::

Run the migrations:

```bash
cd node_modules/@upstart-gg/souvenir
dbmate -d db/migrations -u "postgresql://localhost:5432/souvenir?sslmode=disable" up
```

Or manually execute the SQL from `node_modules/@upstart-gg/souvenir/db/migrations/`.

## Verify Installation

Create a test file to verify everything works:

```typescript
import { Souvenir } from '@upstart-gg/souvenir';

const souvenir = new Souvenir({
  databaseUrl: 'postgresql://localhost:5432/souvenir?sslmode=disable',
  embeddingDimensions: 1536,
  chunkSize: 1000,
  chunkOverlap: 200,
});

console.log('Souvenir initialized successfully!');

await souvenir.close();
```

Run it:

:::tabs key:runtime

== Node.js

```bash
node --loader ts-node/esm test.ts
```

== Bun

```bash
bun test.ts
```

== Deno

```bash
deno run --allow-net --allow-env test.ts
```

:::

If you see "Souvenir initialized successfully!", you're ready to go!

## Next Steps

- [Quick Start](/guide/quick-start) - Build your first memory-enabled agent
- [Configuration](/configuration/) - Learn about configuration options

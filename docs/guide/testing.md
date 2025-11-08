# Integration Testing Guide

## Overview

Souvenir uses Bun's test runner with ISO-compliant database setup via **dbmate migrations**. All integration tests use a real PostgreSQL database with pgvector extension.

## Prerequisites

- Bun 1.0.0+
- Docker & Docker Compose (for local integration tests)
- dbmate (for running migrations)

## Running Tests

### Unit Tests (No Database Required)
```bash
bun test
bun test --watch
bun test --coverage
```

### Integration Tests (Requires Database)

**Option 1: With Docker (Recommended for local development)**
```bash
# Start PostgreSQL with pgvector + create test database
bun run docker:up

# Run integration tests
bun run test:integration

# Stop containers
bun run docker:down

# Or all in one command:
bun run test:local
```

**Option 2: With Existing Database**
```bash
# Set DATABASE_URL environment variable pointing to your database
export DATABASE_URL=postgresql://user:password@localhost:5432/souvenir_test

# Run tests
bun run test:integration
```

**Option 3: Watch Mode**
```bash
bun run docker:up
bun run test:integration:watch
# Make changes to code/tests, tests re-run automatically
```

## Database Setup Details

### Docker Compose Stack
- **PostgreSQL 16** with pgvector and pg_trgm extensions
- **Test Database**: `souvenir_test`
- **Port**: 54322 (mapped from container port 5432)
- **Default Credentials**: `postgres:postgres`
- **Access**: From host machine via `localhost:54322`

### ISO Compliance
All integration tests use **dbmate migrations** for database schema initialization:
- Database schema is initialized from `db/migrations/*.sql`
- Between each test, the database is reset via `dbmate down && dbmate up`
- This ensures schema state is identical to fresh migration run
- No hardcoded SQL - schema always matches migration files

### Test Database Lifecycle

1. **Before All Tests** (`src/__tests__/setup.ts`)
   - Wait for PostgreSQL availability (with exponential backoff)
   - Run `dbmate up` to apply all migrations
   - Initialize pgvector and pg_trgm extensions

2. **Between Each Test** (via `withTestDatabase` wrapper)
   - Drop and recreate public schema
   - Run `dbmate up` to reapply migrations
   - Ensures clean, isolated database state

3. **After All Tests**
   - Close database connections
   - Run `dbmate down` to cleanup

## Writing Integration Tests

```typescript
import { describe, it, expect } from "bun:test";
import { withTestDatabase } from "../__tests__/setup";

describe("My Integration Test", () => {
  it("should work with a clean database", async () => {
    await withTestDatabase(async (db) => {
      // Each test gets a fresh database via dbmate migrations
      const result = await db`SELECT 1 as num`;
      expect(result[0].num).toBe(1);
    });
  });
});
```

## Environment Variables

### Local Testing with Docker
```bash
# Default (uses docker container on host port 54322)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/souvenir_test
```

### Local Testing with External Database
```bash
# If running PostgreSQL outside docker-compose
DATABASE_URL=postgresql://postgres:password@localhost:5432/souvenir_test
```

### CI (GitHub Actions)
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
CI=true
```

The setup utilities automatically:
- Use `DATABASE_URL` if `CI=true` is set
- Fall back to `DATABASE_URL` for local development
- Ensure dbmate uses the correct database URL

## Troubleshooting

### Database Connection Failed
```bash
# Check if PostgreSQL is running
bun run docker:up

# Wait for PostgreSQL to be healthy
sleep 10

# Check container logs
docker-compose logs postgres
```

### Migrations Not Applied
```bash
# Check migration status
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/souvenir_test dbmate status

# Run migrations manually
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/souvenir_test dbmate up
```

### Port Already In Use
```bash
# Kill process on port 5432
lsof -ti:5432 | xargs kill -9

# Or use docker to clean up
docker-compose down -v
```

## Test Coverage

```bash
bun test --coverage
# Coverage reports generated in coverage/
```

## CI Integration

Tests automatically run in GitHub Actions when:
- PR is created against `main` branch
- PostgreSQL service is provided by GitHub Actions
- `DATABASE_URL` environment variable is set

See `.github/workflows/test.yml` for CI configuration.

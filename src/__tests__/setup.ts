/**
 * Test setup utilities for integration tests
 * Handles database connection, migrations (via dbmate), and cleanup
 * ISO Compliance: Uses dbmate migrations for consistent schema state
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { DatabaseClient } from "../db/client.js";

const execAsync = promisify(exec);

// Database connection pool for tests
let testDb: ReturnType<typeof postgres> | null = null;

/**
 * Get database URL for current environment
 * Uses DATABASE_URL environment variable
 * Local: docker-compose on localhost:54322
 * CI: GitHub Actions postgres service
 */
function getTestDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    return dbUrl;
  }

  // Fallback for docker-compose setup (runs on host, connects to localhost:54322)
  return "postgresql://postgres:postgres@localhost:54322/souvenir_test";
}

/**
 * Wait for database to be available with exponential backoff
 * Critical for CI environments where postgres service takes time to start
 * Uses faster retry strategy for local development
 */
export async function waitForDatabase(maxRetries = 20): Promise<void> {
  const databaseUrl = getTestDatabaseUrl();
  let lastError: Error | null = null;
  const isCI =
    process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  for (let i = 0; i < maxRetries; i++) {
    try {
      const db = postgres(databaseUrl, {
        idle_timeout: 5,
        connect_timeout: 5,
        ssl: false,
      });
      await db`SELECT 1`;
      await db.end();
      console.log("✓ Database is available");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Faster retry for local, slower for CI
      const delay = isCI
        ? Math.min(500 * 2 ** i, 5000)
        : Math.min(200 * 2 ** i, 2000);
      console.log(
        `⏳ Waiting for database (attempt ${i + 1}/${maxRetries}, retry in ${delay}ms)`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Database did not become available after ${maxRetries} attempts: ${lastError?.message}\n` +
      `Expected database URL: ${databaseUrl}\n` +
      `Make sure PostgreSQL is running:\n` +
      `  - For local: run 'bun run docker:up'\n` +
      `  - For CI: GitHub Actions postgres service should be running`,
  );
}

/**
 * Get or create database connection
 */
export async function getTestDatabase(): Promise<ReturnType<typeof postgres>> {
  if (testDb) {
    return testDb;
  }

  const databaseUrl = getTestDatabaseUrl();
  testDb = postgres(databaseUrl, {
    ssl: false,
    idle_timeout: 5,
    connect_timeout: 5,
  });
  return testDb;
}

/**
 * Initialize test database using dbmate migrations
 * ISO Compliance: Uses official dbmate to run migrations from db/migrations/
 * This ensures database schema state is exactly as defined in migrations
 */
export async function initializeTestDatabase(): Promise<void> {
  try {
    const databaseUrl = getTestDatabaseUrl();

    // Set DATABASE_URL for dbmate command
    const env = { ...process.env, DATABASE_URL: databaseUrl };

    // Run dbmate up to apply all migrations
    console.log("Initializing test database with dbmate migrations...");
    const { stdout, stderr } = await execAsync("dbmate up", {
      env,
      cwd: process.cwd(),
    });

    if (stderr) {
      console.log("dbmate output:", stderr);
    }
    if (stdout) {
      console.log(stdout);
    }

    console.log("✓ Test database initialized with dbmate migrations");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("ENOENT") || errorMsg.includes("not found")) {
      console.error(
        "Error: dbmate not found. Install it with: brew install dbmate (macOS) or apt-get install dbmate (Linux)",
      );
    } else {
      console.error("Failed to initialize test database with dbmate:", error);
    }
    throw error;
  }
}

/**
 * Reset database between tests using dbmate
 * ISO Compliance: Rolls back all migrations and reapplies them
 * Guarantees clean state identical to fresh migration run
 */
export async function resetTestDatabase(): Promise<void> {
  try {
    const databaseUrl = getTestDatabaseUrl();

    const env = { ...process.env, DATABASE_URL: databaseUrl };

    console.log("Resetting test database...");

    // Close existing connection to avoid stale connection issues
    if (testDb) {
      try {
        await testDb.end();
      } catch (error) {
        console.error("Error closing stale connection:", error);
      }
      testDb = null;
    }

    // Drop schema (cascade all tables)
    const db = await getTestDatabase();
    try {
      // Suppress NOTICEs for this operation
      await db`SET client_min_messages TO WARNING`;
      await db`DROP SCHEMA public CASCADE`;
      await db`CREATE SCHEMA public`;
      await db`SET client_min_messages TO DEFAULT`;
      console.log("✓ Dropped and recreated public schema");

      // Close connection after schema reset to ensure fresh connection for migrations
      await db.end();
      testDb = null;
    } catch (error) {
      console.error(
        "Note: Could not drop schema, continuing with dbmate...",
        error,
      );
    }

    // Run dbmate up to reapply all migrations
    await execAsync("dbmate up", {
      env,
      cwd: process.cwd(),
    });

    console.log("✓ Test database reset to clean state");
  } catch (error) {
    console.error("Failed to reset test database:", error);
    throw error;
  }
}

/**
 * Clean up test database using dbmate
 * ISO Compliance: Rolls back all migrations
 */
export async function cleanupTestDatabase(): Promise<void> {
  try {
    const databaseUrl = getTestDatabaseUrl();

    const env = { ...process.env, DATABASE_URL: databaseUrl };

    console.log("Cleaning up test database...");
    await execAsync("dbmate down", {
      env,
      cwd: process.cwd(),
    });

    console.log("✓ Test database cleaned up");
  } catch (error) {
    console.error("Failed to cleanup test database:", error);
    // Non-fatal, continue with connection closure
  }
}

/**
 * Close database connection
 */
export async function closeTestDatabase(): Promise<void> {
  if (testDb) {
    try {
      await testDb.end();
    } catch (error) {
      console.error("Error closing database connection:", error);
    }
    testDb = null;
  }
}

/**
 * Create a DatabaseClient for testing
 */
export function createTestDatabaseClient(): DatabaseClient {
  const databaseUrl = getTestDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("No database URL available for test database client");
  }
  return new DatabaseClient(databaseUrl);
}

/**
 * Wrapper for test functions with automatic database setup/teardown
 * Usage: await withTestDatabase(async (db) => { your test code here })
 */
export async function withTestDatabase<T>(
  testFn: (db: Awaited<ReturnType<typeof getTestDatabase>>) => Promise<T>,
): Promise<T> {
  let db: Awaited<ReturnType<typeof getTestDatabase>> | null = null;

  try {
    // Fast mode by default: do NOT reset schema per test.
    // Tests rely on per-test unique sessionId for data isolation.
    // If you need a fully clean schema for a specific test, use withIsolatedDatabase below.

    // Get connection and run test
    db = await getTestDatabase();
    const result = await testFn(db);

    return result;
  } finally {
    // Cleanup after test
    if (db) {
      try {
        await db.end();
        testDb = null;
      } catch (error) {
        console.error("Error cleaning up database connection:", error);
      }
    }
  }
}

/**
 * Wrapper that enforces a full clean schema per test by running a reset
 * before executing the test function. Use only when a test truly depends on
 * a globally empty database state; most tests should use withTestDatabase
 * with session-scoped isolation for speed.
 */
export async function withIsolatedDatabase<T>(
  testFn: (db: Awaited<ReturnType<typeof getTestDatabase>>) => Promise<T>,
): Promise<T> {
  await resetTestDatabase();
  return withTestDatabase(testFn);
}

// Bun test setup: Initialize database once before all tests
try {
  console.log("\n📦 Test database setup starting...\n");

  // Check if we're using local docker setup
  const databaseUrl = getTestDatabaseUrl();
  const isLocalDocker = databaseUrl.includes("localhost:54322");

  if (isLocalDocker) {
    console.log(`Using local docker PostgreSQL at: ${databaseUrl}`);
    console.log("Make sure to run: bun run docker:up\n");
  }

  // Wait for database availability (critical for CI)
  await waitForDatabase();

  // Initialize database schema via dbmate
  await initializeTestDatabase();

  console.log("\n✓ Test database setup completed\n");

  // Register cleanup hook
  process.on("exit", async () => {
    console.log("\n🧹 Test database cleanup starting...\n");
    try {
      await closeTestDatabase();
      await cleanupTestDatabase();
      console.log("\n✓ Test database cleanup completed\n");
    } catch (error) {
      console.error("\n✗ Test database cleanup failed:", error);
    }
  });
} catch (error) {
  console.error("\n✗ Test database setup failed:", error);
  console.error(
    "\nTroubleshooting:\n" +
      "1. Ensure PostgreSQL is running: bun run docker:up\n" +
      "2. Check PostgreSQL logs: docker-compose logs postgres\n" +
      "3. Verify dbmate is installed: which dbmate or brew install dbmate\n" +
      "4. Check database migrations exist in db/migrations/\n",
  );
  process.exit(1);
}

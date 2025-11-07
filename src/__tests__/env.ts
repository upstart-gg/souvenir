/**
 * Environment setup for tests
 * This file is preloaded before setup.ts to ensure DATABASE_URL is set
 */

// Set DATABASE_URL if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:54322/souvenir_test?sslmode=disable";
  console.log("✓ DATABASE_URL set for test environment");
}

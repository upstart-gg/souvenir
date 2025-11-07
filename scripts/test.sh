#!/bin/bash
set -e

echo "Starting Docker..."
bun run docker:up

echo "Running tests..."
export DATABASE_URL=postgresql://postgres:postgres@localhost:54322/souvenir_test
echo "DATABASE_URL is set to: $DATABASE_URL"
bun run test:ci || TEST_RESULT=$?

echo "Stopping Docker..."
bun run docker:down

if [ ! -z "$TEST_RESULT" ]; then
  exit $TEST_RESULT
fi

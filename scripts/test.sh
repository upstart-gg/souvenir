#!/bin/bash
set -e

echo "Starting Docker..."
bun run docker:up

echo "Running tests..."
bun run test:ci || TEST_RESULT=$?

echo "Stopping Docker..."
bun run docker:down

if [ ! -z "$TEST_RESULT" ]; then
  exit $TEST_RESULT
fi

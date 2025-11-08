#!/bin/bash
set -e

echo "Starting Docker..."
pnpm docker:up

echo "Running tests..."
pnpm run test:ci || TEST_RESULT=$?

echo "Stopping Docker..."
pnpm docker:down

if [ ! -z "$TEST_RESULT" ]; then
  exit $TEST_RESULT
fi

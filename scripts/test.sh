#!/bin/bash
set -e

echo "Starting Docker..."
npm docker:up

echo "Running tests..."
npm run test:ci || TEST_RESULT=$?

echo "Stopping Docker..."
npm docker:down

if [ ! -z "$TEST_RESULT" ]; then
  exit $TEST_RESULT
fi

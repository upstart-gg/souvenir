# Contributing to Souvenir

Thank you for your interest in contributing to Souvenir! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up your local database:
   ```bash
   # Install dbmate
   brew install dbmate  # macOS
   # or download from https://github.com/amacneil/dbmate

   # Create database and run migrations
   export DATABASE_URL="postgresql://user:pass@localhost:5432/souvenir_dev"
   dbmate -d db/migrations -s db/schema.sql up
   ```

4. Run tests to verify setup:
   ```bash
   bun test
   ```

## Development Workflow

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Run tests and linting:
   ```bash
   bun test
   bun run typecheck
   bun run lint
   ```

4. Build the project:
   ```bash
   bun run build
   ```

5. Commit your changes using conventional commits:
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug"
   git commit -m "docs: update documentation"
   ```

6. Push and create a pull request

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions or updates
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `perf:` - Performance improvements

## Code Style

We use Biome for linting and formatting:

```bash
# Format code
bun run format

# Check for issues
bun run lint

# Auto-fix issues
bun run lint:fix
```

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Aim for >90% code coverage
- Run tests with coverage: `bun test:coverage`

## Pull Request Process

1. Update README.md with details of changes if applicable
2. Update examples if you change public APIs
3. Ensure CI passes (tests, linting, build)
4. Request review from maintainers
5. Address review feedback
6. Squash commits if requested

## Adding Changesets

For changes that should be published, add a changeset:

```bash
bun changeset
```

Follow the prompts to describe your changes.

## Questions?

Feel free to open an issue for any questions or concerns!

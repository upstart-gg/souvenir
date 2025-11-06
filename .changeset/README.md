# Changesets

This directory contains changeset files. Changesets are used to manage versioning and changelogs for this package.

## Adding a changeset

When you make changes that should be included in the changelog, run:

```bash
bun changeset
```

This will prompt you to describe your changes and select the appropriate version bump (major, minor, or patch).

## Publishing

To publish a new version:

```bash
bun changeset version
bun install
bun run build
bun publish
```

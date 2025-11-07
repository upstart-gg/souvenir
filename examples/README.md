# Souvenir Examples

This directory contains example usage of the Souvenir memory system.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up your database and environment variables:
```bash
cp ../.env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY
```

3. Run database migrations:
```bash
# Using dbmate
dbmate up
```

## Examples

### Basic Usage
Demonstrates core Souvenir functionality: adding data, processing, and searching.

```bash
bun run basic
```

### With Tools
Shows how to use Souvenir tools with Vercel AI SDK for autonomous memory management.

```bash
bun run tools
```

### Knowledge Graph
Explores knowledge graph features including relationships, neighborhoods, and clusters.

```bash
bun run graph
```

## Learn More

- [Souvenir Documentation](../README.md)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)

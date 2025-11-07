# Configuration

Customize Souvenir for your needs.

## Basic Configuration

```typescript
import { Souvenir } from '@upstart-gg/souvenir';

const souvenir = new Souvenir({
  // Database connection
  databaseUrl: process.env.DATABASE_URL!,

  // Embedding dimensions (must match your embedding model)
  embeddingDimensions: 1536, // OpenAI text-embedding-3-small

  // Chunking configuration
  chunkSize: 1000,
  chunkOverlap: 200,
  chunkingMode: 'token', // or 'recursive'

  // Search defaults
  minRelevanceScore: 0.7,
  maxResults: 10,
});
```

## Configuration Options

### Database

- **databaseUrl** (required): PostgreSQL connection string
  ```typescript
  databaseUrl: 'postgresql://user:password@localhost:5432/souvenir'
  ```

### Embeddings

- **embeddingDimensions** (default: 1536): Vector size for embeddings
  - OpenAI text-embedding-3-small: 1536
  - OpenAI text-embedding-3-large: 3072
  - Cohere embed-english-v3.0: 1024

### Chunking

- **chunkSize** (default: 1000): Target chunk size in tokens
- **chunkOverlap** (default: 200): Overlap between chunks
- **chunkingMode** (default: 'token'): Chunking strategy
  - `'token'`: Fixed-size chunks with overlap
  - `'recursive'`: Hierarchical splitting
- **chunkingTokenizer** (optional): Custom tokenizer
  - `'character'`: Character-based (default)
  - `'Xenova/gpt2'`: GPT-2 tokenizer
  - Any HuggingFace model name
- **minCharactersPerChunk** (optional): Minimum chunk size

### Search Defaults

- **minRelevanceScore** (default: 0.7): Minimum similarity threshold
- **maxResults** (default: 10): Maximum results per search

## Advanced Options

```typescript
const souvenir = new Souvenir(
  {
    // Basic config
    databaseUrl: process.env.DATABASE_URL!,
    embeddingDimensions: 1536,
  },
  {
    // Embedding provider
    embeddingProvider: {
      generateEmbedding: async (text) => {
        // Your embedding logic
        return embedding;
      },
    },

    // LLM for processing
    processorModel: openai('gpt-4o-mini'),

    // Custom prompts
    promptTemplates: {
      entityExtraction: 'Extract entities...',
      relationshipExtraction: 'Extract relationships...',
      summarization: 'Summarize...',
    },
  }
);
```

### Embedding Provider

Provide your own embedding function:

```typescript
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

embeddingProvider: {
  generateEmbedding: async (text) => {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text,
    });
    return embedding;
  },
}
```

### Processor Model

LLM for entity extraction and relationship detection:

```typescript
import { openai } from '@ai-sdk/openai';

processorModel: openai('gpt-4o-mini')
```

### Prompt Templates

Customize extraction prompts:

```typescript
promptTemplates: {
  entityExtraction: `
    Extract named entities from the text.
    Focus on: people, places, organizations, concepts.
  `,
  relationshipExtraction: `
    Extract relationships between entities.
    Format: entity1 | relationship | entity2
  `,
  summarization: `
    Provide a concise summary in 2-3 sentences.
  `,
  qa: `
    Answer the question based on the provided context.
  `,
}
```

## Detailed Guides

- [Database Setup](/configuration/database) - PostgreSQL and pgvector
- [Embedding Providers](/configuration/embeddings) - Configure embeddings
- [Chunking Options](/configuration/chunking) - Advanced chunking

## Environment Variables

Recommended environment variables:

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/souvenir?sslmode=disable

# OpenAI (if using)
OPENAI_API_KEY=sk-...

# Optional
SOUVENIR_CHUNK_SIZE=1000
SOUVENIR_CHUNK_OVERLAP=200
```

## Next Steps

- [Database Setup](/configuration/database) - Set up PostgreSQL
- [Chunking Options](/configuration/chunking) - Optimize chunking
- [Examples](/examples/) - See configuration in action

# Configuration

Customize Souvenir for your needs.

## Basic Configuration

```typescript
import { Souvenir } from '@upstart.gg/souvenir';

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

  // Auto-processing (batched background processing)
  autoProcessing: true,        // Enable auto-processing (default: true)
  autoProcessDelay: 1000,      // Debounce delay in ms (default: 1000)
  autoProcessBatchSize: 10,    // Chunks per batch (default: 10)
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
- **chunkingMode** (default: 'recursive'): Chunking strategy
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

### Auto-Processing

Souvenir uses timer-based batching to optimize LLM API calls and processing efficiency:

- **autoProcessing** (default: true): Enable/disable automatic batched processing
  - When enabled, multiple rapid `add()` calls are automatically batched together
  - Processing is scheduled after a configurable delay period
  - Set to `false` for manual processing control with `processAll()`

- **autoProcessDelay** (default: 1000): Debounce delay in milliseconds
  - Each `add()` call resets this timer
  - When the timer expires, all pending chunks are processed in one batch
  - Increase for more aggressive batching (e.g., 5000ms)
  - Decrease for faster processing (e.g., 500ms)

- **autoProcessBatchSize** (default: 10): Number of chunks to process per batch
  - Larger batches are more efficient but take longer
  - Smaller batches provide faster individual processing

**Example: Disable auto-processing**
```typescript
const souvenir = new Souvenir({
  databaseUrl: process.env.DATABASE_URL!,
  autoProcessing: false,
});

// Manually control processing
await souvenir.add('Content 1...');
await souvenir.add('Content 2...');
await souvenir.processAll({ generateEmbeddings: true });
```

**Example: Force immediate processing**
```typescript
await souvenir.add('Important data...');

// Force processing before searching
await souvenir.forceMemoryProcessing({
  generateEmbeddings: true,
  generateSummaries: false,
});

const results = await souvenir.search('query');
```

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

- [Quick Start](/guide/quick-start) - Configuration reference
- [Chunking Options](/guide/chunking) - Advanced chunking
- [ETL Pipeline](/guide/etl-pipeline) - How Souvenir processes data

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

- [Quick Start](/guide/quick-start) - Get started
- [Retrieval Strategies](/guide/retrieval-strategies) - Search options


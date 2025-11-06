# Overview

**Souvenir** is a memory management library for AI agents built with the Vercel AI SDK. It provides a complete ETL (Extract, Transform, Load) pipeline for managing agent memory using knowledge graphs and vector search.

## What is Souvenir?

Souvenir helps AI agents remember and reason about information by:

- **Extracting** information from text by chunking and storing it
- **Transforming** chunks into entities and relationships using LLMs
- **Loading** structured data into a knowledge graph for retrieval

## Key Features

### ETL Pipeline

Souvenir follows a clear three-phase workflow:

1. **Extract**: Add text content which is automatically chunked
2. **Transform**: Process chunks to extract entities and relationships
3. **Load**: Store in knowledge graph and vector database for retrieval

### Multiple Retrieval Strategies

Based on research from ["Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"](https://arxiv.org/abs/2505.24478), Souvenir supports:

- **Vector retrieval** - Traditional semantic search
- **Graph-neighborhood** - Retrieve connected graph nodes
- **Graph-completion** - Format graph triplets for LLM reasoning
- **Graph-summary** - Use summary nodes for retrieval
- **Hybrid** - Combine multiple strategies

### Knowledge Graphs

- Store entities and relationships with weighted connections
- Traverse graph to find related information
- Generate summaries of subgraphs and sessions
- Format graph triplets for LLM context

### Advanced Chunking

Powered by [chonkiejs](https://github.com/chonkie-inc/chonkiejs):

- **Token-based chunking** - Fixed-size chunks with configurable overlap
- **Recursive chunking** - Hierarchical splitting with custom rules
- **Custom tokenizers** - Support for character, GPT-2, and HuggingFace models

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Input                          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Extract (Add) │
                    │   - Chunking   │
                    └────────┬───────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Transform (Process) │
                  │  - Entity Extraction │
                  │  - Relationships     │
                  │  - Summaries         │
                  └──────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │      Load (Store & Index)    │
              │  - Knowledge Graph           │
              │  - Vector Database           │
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │    Retrieval   │
                    │  - Vector      │
                    │  - Graph       │
                    │  - Hybrid      │
                    └────────────────┘
```

## Use Cases

Souvenir is ideal for:

- **Chatbots** that need to remember conversation history
- **Documentation assistants** that can traverse related topics
- **Research assistants** that need to understand entity relationships
- **Customer support agents** that need context from previous interactions
- **Personal assistants** that manage tasks and knowledge

## Philosophy

Souvenir is designed with these principles:

1. **Research-based**: Built on proven techniques from academic research
2. **Type-safe**: Full TypeScript support for reliability
3. **Runtime-agnostic**: Works across Node.js, Bun, Deno, and edge runtimes
4. **Flexible**: Configurable chunking, embeddings, and retrieval strategies
5. **Production-ready**: PostgreSQL with pgvector for scalability

## Next Steps

- [Installation](/guide/installation) - Set up Souvenir in your project
- [Quick Start](/guide/quick-start) - Build your first memory-enabled agent
- [ETL Pipeline](/guide/etl-pipeline) - Learn about the Extract-Transform-Load workflow

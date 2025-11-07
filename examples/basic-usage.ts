/**
 * Basic usage example of Souvenir with Vercel AI SDK
 */

import { Souvenir, AIEmbeddingProvider } from '@upstart.gg/souvenir';
import { openai } from '@ai-sdk/openai';

async function main() {
  // 1. Initialize Souvenir
  const souvenir = new Souvenir(
    {
      databaseUrl: process.env.DATABASE_URL!,
      chunkSize: 1000,
      chunkOverlap: 200,
      minRelevanceScore: 0.7,
      maxResults: 10,
    },
    {
      // Use OpenAI for embeddings
      embeddingProvider: new AIEmbeddingProvider(openai.embedding('text-embedding-3-small')),
      // Use OpenAI for entity/relationship extraction
      processorModel: openai('gpt-4o-mini'),
    }
  );

  // 2. Create a session
  const session = await souvenir.createSession('demo-session', {
    topic: 'AI Memory Systems',
  });

  console.log('Created session:', session.id);

  // 3. Add data to memory
  const text = `
    Memory systems for AI agents are crucial for maintaining context across conversations.
    Vector databases enable semantic search, while knowledge graphs capture relationships.
    Together, they create a powerful hybrid memory architecture.
  `;

  const chunkIds = await souvenir.add(text, {
    sessionId: session.id,
    metadata: { source: 'documentation', topic: 'memory-systems' },
  });

  console.log('Added chunks:', chunkIds);

  // 4. Process the chunks (extract entities, relationships, generate embeddings)
  await souvenir.processAll({
    sessionId: session.id,
    extractEntities: true,
    extractRelationships: true,
    generateEmbeddings: true,
  });

  console.log('Processing complete!');

  // 5. Search memory
  const results = await souvenir.search('What are knowledge graphs?', {
    sessionId: session.id,
    limit: 5,
  });

  console.log('\nSearch results:');
  for (const result of results) {
    console.log(`- Score: ${result.score.toFixed(3)}`);
    console.log(`  Content: ${result.node.content.substring(0, 100)}...`);
  }

  // 6. Close connection
  await souvenir.close();
}

main().catch(console.error);

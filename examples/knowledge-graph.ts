/**
 * Example demonstrating knowledge graph features
 */

import { Souvenir, AIEmbeddingProvider } from '@upstart.gg/souvenir';
import { openai } from '@ai-sdk/openai';

async function main() {
  const souvenir = new Souvenir(
    {
      databaseUrl: process.env.DATABASE_URL!,
    },
    {
      embeddingProvider: new AIEmbeddingProvider(openai.embedding('text-embedding-3-small')),
      processorModel: openai('gpt-4o-mini'),
    }
  );

  const session = await souvenir.createSession('knowledge-graph-demo');

  // Add interconnected information
  const texts = [
    'TypeScript is a superset of JavaScript that adds static typing.',
    'JavaScript is a dynamic programming language used for web development.',
    'React is a JavaScript library for building user interfaces.',
    'Next.js is a React framework for building full-stack web applications.',
    'Vercel AI SDK is built with TypeScript and works great with Next.js.',
  ];

  for (const text of texts) {
    await souvenir.add(text, { sessionId: session.id });
  }

  // Process to extract entities and relationships
  await souvenir.processAll({
    sessionId: session.id,
    extractEntities: true,
    extractRelationships: true,
    generateEmbeddings: true,
  });

  // Search for a concept
  const results = await souvenir.search('TypeScript', {
    sessionId: session.id,
    limit: 3,
    includeRelationships: true,
  });

  console.log('Found memories:');
  for (const result of results) {
    console.log(`\n- Content: ${result.node.content}`);
    console.log(`  Score: ${result.score.toFixed(3)}`);

    if (result.relationships && result.relationships.length > 0) {
      console.log(`  Relationships: ${result.relationships.length}`);
      for (const rel of result.relationships.slice(0, 3)) {
        console.log(`    - ${rel.relationshipType} (weight: ${rel.weight})`);
      }
    }
  }

  // Explore the graph neighborhood
  if (results[0]) {
    console.log('\n\nExploring neighborhood of first result:');
    const neighborhood = await souvenir.getNeighborhood(results[0].node.id, {
      maxDepth: 2,
    });

    console.log(`Found ${neighborhood.nodes.length} connected nodes`);
    console.log(`Found ${neighborhood.relationships.length} relationships`);

    // Show some relationships
    for (const rel of neighborhood.relationships.slice(0, 5)) {
      const sourceNode = neighborhood.nodes.find((n) => n.id === rel.sourceId);
      const targetNode = neighborhood.nodes.find((n) => n.id === rel.targetId);

      if (sourceNode && targetNode) {
        console.log(
          `\n${sourceNode.content.substring(0, 50)}... --[${rel.relationshipType}]--> ${targetNode.content.substring(0, 50)}...`
        );
      }
    }
  }

  // Find clusters of related concepts
  const clusters = await souvenir.findClusters(session.id, 2);
  console.log(`\n\nFound ${clusters.length} concept clusters`);

  await souvenir.close();
}

main().catch(console.error);

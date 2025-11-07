/**
 * Example using Souvenir tools with Vercel AI SDK
 */

import { Souvenir, AIEmbeddingProvider, createSouvenirTools } from '@upstart.gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

async function main() {
  // Initialize Souvenir
  const souvenir = new Souvenir(
    {
      databaseUrl: process.env.DATABASE_URL!,
    },
    {
      embeddingProvider: new AIEmbeddingProvider(openai.embedding('text-embedding-3-small')),
      processorModel: openai('gpt-4o-mini'),
    }
  );

  // Create Souvenir tools
  const tools = createSouvenirTools(souvenir);

  // Create a session
  const session = await souvenir.createSession('chat-session');

  // Use the AI agent with memory tools
  const result = await generateText({
    model: openai('gpt-4o'),
    tools,
    maxSteps: 10,
    prompt: `
      I'm going to tell you some facts about myself. Please store them in memory.

      - My name is Alice
      - I love programming in TypeScript
      - I work on AI applications
      - My favorite color is blue

      After storing these facts, search memory to confirm you remembered them.
    `,
  });

  console.log('Agent response:', result.text);
  console.log('\nTool calls made:');
  for (const step of result.steps) {
    if ('toolCalls' in step) {
      for (const toolCall of step.toolCalls) {
        console.log(`- ${toolCall.toolName}`);
      }
    }
  }

  // Now test retrieval in a new conversation
  const retrievalResult = await generateText({
    model: openai('gpt-4o'),
    tools,
    maxSteps: 5,
    prompt: "What do you know about me? Search your memory to recall.",
  });

  console.log('\nRetrieval result:', retrievalResult.text);

  await souvenir.close();
}

main().catch(console.error);

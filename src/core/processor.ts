import { generateText } from 'ai';
import {
  ExtractedEntity,
  ExtractedRelationship,
  MemoryChunk,
  SouvenirProcessOptions,
} from '../types.js';

/**
 * Souvenir processor for extracting entities and relationships from text
 */
export class SouvenirProcessor {
  constructor(private model: Parameters<typeof generateText>[0]['model']) {}

  /**
   * Extract entities from text content
   */
  async extractEntities(content: string): Promise<ExtractedEntity[]> {
    const prompt = `Extract key entities from the following text. Return them as a JSON array of objects with "text", "type", and optional "metadata" fields.

Entity types can be: person, organization, location, concept, event, date, technology, or other.

Text:
${content}

Return only valid JSON, no additional text.`;

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 1000,
      });

      const entities = JSON.parse(text);
      return Array.isArray(entities) ? entities : [];
    } catch (error) {
      console.error('Entity extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract relationships from text content
   */
  async extractRelationships(
    content: string,
    entities: ExtractedEntity[]
  ): Promise<ExtractedRelationship[]> {
    if (entities.length < 2) {
      return [];
    }

    const entityList = entities.map((e) => e.text).join(', ');

    const prompt = `Given the following entities: ${entityList}

Extract relationships between these entities from the text below. Return them as a JSON array of objects with "source", "target", "type", and optional "weight" (0-1) fields.

Relationship types can be: related_to, part_of, caused_by, enables, requires, similar_to, or other descriptive types.

Text:
${content}

Return only valid JSON, no additional text.`;

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 1000,
      });

      const relationships = JSON.parse(text);
      return Array.isArray(relationships) ? relationships : [];
    } catch (error) {
      console.error('Relationship extraction failed:', error);
      return [];
    }
  }

  /**
   * Generate a summary of content for metadata
   */
  async generateSummary(content: string, maxLength: number = 200): Promise<string> {
    const prompt = `Provide a concise summary of the following text in ${maxLength} characters or less:

${content}`;

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 100,
      });

      return text.trim();
    } catch (error) {
      console.error('Summary generation failed:', error);
      return content.slice(0, maxLength) + '...';
    }
  }

  /**
   * Process a chunk and extract structured information
   */
  async processChunk(
    chunk: MemoryChunk,
    options: SouvenirProcessOptions = {}
  ): Promise<{
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
    summary: string;
  }> {
    const { extractEntities = true, extractRelationships = true } = options;

    let entities: ExtractedEntity[] = [];
    let relationships: ExtractedRelationship[] = [];

    if (extractEntities) {
      entities = await this.extractEntities(chunk.content);
    }

    if (extractRelationships && entities.length > 0) {
      relationships = await this.extractRelationships(chunk.content, entities);
    }

    const summary = await this.generateSummary(chunk.content);

    return { entities, relationships, summary };
  }
}

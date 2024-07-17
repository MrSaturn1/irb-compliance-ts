// File: server/src/rag/vectorStore.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Document } from './types';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface VectorEntry {
  embedding: number[];
  content: string;
  id: string;
  metadata: any;
}

export class VectorStore {
  private vectors: VectorEntry[] = [];
  private storePath: string;

  constructor(storePath: string = path.join(__dirname, '../../data/vector_store.json')) {
    this.storePath = storePath;
    this.loadVectors();
  }

  private loadVectors() {
    if (fs.existsSync(this.storePath)) {
      const data = fs.readFileSync(this.storePath, 'utf-8');
      this.vectors = JSON.parse(data);
      console.log(`Loaded ${this.vectors.length} vectors from storage.`);
    }
  }

  private saveVectors() {
    fs.writeFileSync(this.storePath, JSON.stringify(this.vectors));
    console.log(`Saved ${this.vectors.length} vectors to storage.`);
  }

  async addChunk(chunk: { id: string; content: string; metadata: any }): Promise<void> {
    const embedding = await this.getEmbedding(chunk.content);
    this.vectors.push({ 
      embedding, 
      content: chunk.content, 
      id: chunk.id, 
      metadata: chunk.metadata 
    });
    this.saveVectors();
  }

  async search(query: string, topK: number = 3): Promise<string[]> {
    const queryEmbedding = await this.getEmbedding(query);
    const similarities = this.vectors.map(vec => ({
      content: vec.content,
      similarity: this.cosineSimilarity(queryEmbedding, vec.embedding),
    }));
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK).map(s => s.content);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return response.data[0].embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
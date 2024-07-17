// File: server/src/rag/tokenizer.ts

import { Document } from './types';
import GPT3TokenizerImport from 'gpt3-tokenizer';

const GPT3Tokenizer: typeof GPT3TokenizerImport =
  typeof GPT3TokenizerImport === 'function'
    ? GPT3TokenizerImport
    : (GPT3TokenizerImport as any).default;

export class Tokenizer {
  private tokenizer: any;

  constructor() {
    this.tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
  }

  chunkDocument(document: Document, maxTokens: number = 500): string[] {
    const text = document.content;
    const chunks: string[] = [];
    let currentChunk = '';

    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      const tokenCount = this.countTokens(currentChunk + sentence);

      if (tokenCount > maxTokens) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        if (this.countTokens(sentence) > maxTokens) {
          const subChunks = this.chunkLongSentence(sentence, maxTokens);
          chunks.push(...subChunks);
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  public countTokens(text: string): number {
    const encoded = this.tokenizer.encode(text);
    return encoded.bpe.length;
  }

  private chunkLongSentence(sentence: string, maxTokens: number): string[] {
    const words = sentence.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (this.countTokens(currentChunk + ' ' + word) > maxTokens) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        if (this.countTokens(word) > maxTokens) {
          // If a single word is longer than maxTokens, split it arbitrarily
          const subWords = word.match(new RegExp(`.{1,${maxTokens}}`, 'g')) || [];
          chunks.push(...subWords);
        } else {
          currentChunk = word;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
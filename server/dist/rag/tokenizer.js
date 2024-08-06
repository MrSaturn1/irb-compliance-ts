"use strict";
// File: server/src/rag/tokenizer.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tokenizer = void 0;
const gpt3_tokenizer_1 = __importDefault(require("gpt3-tokenizer"));
const GPT3Tokenizer = typeof gpt3_tokenizer_1.default === 'function'
    ? gpt3_tokenizer_1.default
    : gpt3_tokenizer_1.default.default;
class Tokenizer {
    constructor() {
        this.tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
    }
    chunkDocument(document, maxTokens = 500) {
        const text = document.content;
        const chunks = [];
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
                }
                else {
                    currentChunk = sentence;
                }
            }
            else {
                currentChunk += (currentChunk ? ' ' : '') + sentence;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        return chunks;
    }
    countTokens(text) {
        const encoded = this.tokenizer.encode(text);
        return encoded.bpe.length;
    }
    chunkLongSentence(sentence, maxTokens) {
        const words = sentence.split(/\s+/);
        const chunks = [];
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
                }
                else {
                    currentChunk = word;
                }
            }
            else {
                currentChunk += (currentChunk ? ' ' : '') + word;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        return chunks;
    }
}
exports.Tokenizer = Tokenizer;

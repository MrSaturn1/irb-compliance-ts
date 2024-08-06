"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStore = void 0;
// File: server/src/rag/vectorStore.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const openai_1 = __importDefault(require("openai"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
class VectorStore {
    constructor(storePath = path_1.default.join(__dirname, '../../data/vector_store.json')) {
        this.vectors = [];
        this.storePath = storePath;
        this.loadVectors();
    }
    loadVectors() {
        if (fs_1.default.existsSync(this.storePath)) {
            const data = fs_1.default.readFileSync(this.storePath, 'utf-8');
            this.vectors = JSON.parse(data);
            console.log(`Loaded ${this.vectors.length} vectors from storage.`);
        }
    }
    saveVectors() {
        fs_1.default.writeFileSync(this.storePath, JSON.stringify(this.vectors));
        console.log(`Saved ${this.vectors.length} vectors to storage.`);
    }
    async addChunk(chunk) {
        const embedding = await this.getEmbedding(chunk.content);
        this.vectors.push({
            embedding,
            content: chunk.content,
            id: chunk.id,
            metadata: chunk.metadata
        });
        this.saveVectors();
    }
    async search(query, topK = 3) {
        const queryEmbedding = await this.getEmbedding(query);
        const similarities = this.vectors.map(vec => ({
            content: vec.content,
            similarity: this.cosineSimilarity(queryEmbedding, vec.embedding),
        }));
        similarities.sort((a, b) => b.similarity - a.similarity);
        return similarities.slice(0, topK).map(s => s.content);
    }
    async getEmbedding(text) {
        const response = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text,
        });
        return response.data[0].embedding;
    }
    cosineSimilarity(a, b) {
        const dotProduct = a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }
}
exports.VectorStore = VectorStore;

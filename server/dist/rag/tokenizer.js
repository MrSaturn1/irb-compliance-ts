"use strict";
// File: server/src/rag/tokenizer.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tokenizer = void 0;
var gpt3_tokenizer_1 = __importDefault(require("gpt3-tokenizer"));
var GPT3Tokenizer = typeof gpt3_tokenizer_1.default === 'function'
    ? gpt3_tokenizer_1.default
    : gpt3_tokenizer_1.default.default;
var Tokenizer = /** @class */ (function () {
    function Tokenizer() {
        this.tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
    }
    Tokenizer.prototype.chunkDocument = function (document, maxTokens) {
        if (maxTokens === void 0) { maxTokens = 500; }
        var text = document.content;
        var chunks = [];
        var currentChunk = '';
        var sentences = text.split(/(?<=[.!?])\s+/);
        for (var _i = 0, sentences_1 = sentences; _i < sentences_1.length; _i++) {
            var sentence = sentences_1[_i];
            var tokenCount = this.countTokens(currentChunk + sentence);
            if (tokenCount > maxTokens) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                if (this.countTokens(sentence) > maxTokens) {
                    var subChunks = this.chunkLongSentence(sentence, maxTokens);
                    chunks.push.apply(chunks, subChunks);
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
    };
    Tokenizer.prototype.countTokens = function (text) {
        var encoded = this.tokenizer.encode(text);
        return encoded.bpe.length;
    };
    Tokenizer.prototype.chunkLongSentence = function (sentence, maxTokens) {
        var words = sentence.split(/\s+/);
        var chunks = [];
        var currentChunk = '';
        for (var _i = 0, words_1 = words; _i < words_1.length; _i++) {
            var word = words_1[_i];
            if (this.countTokens(currentChunk + ' ' + word) > maxTokens) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                if (this.countTokens(word) > maxTokens) {
                    // If a single word is longer than maxTokens, split it arbitrarily
                    var subWords = word.match(new RegExp(".{1,".concat(maxTokens, "}"), 'g')) || [];
                    chunks.push.apply(chunks, subWords);
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
    };
    return Tokenizer;
}());
exports.Tokenizer = Tokenizer;

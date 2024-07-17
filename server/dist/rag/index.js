"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGSystem = void 0;
// File: src/rag/index.ts
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var groq_sdk_1 = __importDefault(require("groq-sdk"));
var vectorStore_1 = require("./vectorStore");
var tokenizer_1 = require("./tokenizer");
var RAGSystem = /** @class */ (function () {
    function RAGSystem(apiKey) {
        this.vectorStore = new vectorStore_1.VectorStore();
        this.groqClient = new groq_sdk_1.default({ apiKey: apiKey });
        this.tokenizer = new tokenizer_1.Tokenizer();
        this.initializeWithDefaultDocuments();
    }
    RAGSystem.prototype.initializeWithDefaultDocuments = function () {
        return __awaiter(this, void 0, void 0, function () {
            var defaultDocumentsPath, files, _i, files_1, file, filePath, content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        defaultDocumentsPath = path_1.default.join(__dirname, '../../../default_documents');
                        files = fs_1.default.readdirSync(defaultDocumentsPath);
                        _i = 0, files_1 = files;
                        _a.label = 1;
                    case 1:
                        if (!(_i < files_1.length)) return [3 /*break*/, 4];
                        file = files_1[_i];
                        filePath = path_1.default.join(defaultDocumentsPath, file);
                        content = fs_1.default.readFileSync(filePath, 'utf-8');
                        return [4 /*yield*/, this.addDocument({
                                id: file,
                                content: content,
                                metadata: { title: file }
                            })];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        console.log("Initialized with ".concat(files.length, " default documents"));
                        return [2 /*return*/];
                }
            });
        });
    };
    RAGSystem.prototype.addDocument = function (document) {
        return __awaiter(this, void 0, void 0, function () {
            var chunks;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        chunks = this.tokenizer.chunkDocument(document);
                        return [4 /*yield*/, this.vectorStore.addChunks(chunks)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    RAGSystem.prototype.query = function (studyContent) {
        return __awaiter(this, void 0, void 0, function () {
            var relevantChunks, context, prompt, response;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.vectorStore.search(studyContent)];
                    case 1:
                        relevantChunks = _b.sent();
                        context = relevantChunks.join('\n\n');
                        prompt = "\nYou are an expert on IRB standards for studies involving human subjects. Please evaluate the provided study design for compliance with IRB standards. Your response should clearly state whether the study is compliant or non-compliant, and provide detailed reasoning based on specific IRB standards. Non-compliant features of the proposed study should all be highlighted in your response.\n\nContext:\n".concat(context, "\n\nStudy:\n").concat(studyContent, "\n");
                        return [4 /*yield*/, this.groqClient.chat.completions.create({
                                messages: [{ role: 'user', content: prompt }],
                                model: 'mixtral-8x7b-32768',
                                temperature: 0.5,
                                max_tokens: 1000,
                            })];
                    case 2:
                        response = _b.sent();
                        return [2 /*return*/, (_a = response.choices[0].message.content) !== null && _a !== void 0 ? _a : ''];
                }
            });
        });
    };
    return RAGSystem;
}());
exports.RAGSystem = RAGSystem;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const rag_1 = require("../rag");
const cors_1 = __importDefault(require("cors"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express_1.default.json());
const upload = (0, multer_1.default)({ dest: 'uploads/' });
const groq_api_key = process.env.GROQ_API_KEY || '';
let ragSystem = null;
const initializeRAGSystem = async () => {
    console.log('Initializing RAG system...');
    ragSystem = new rag_1.RAGSystem(groq_api_key);
    console.log('RAG system initialized.');
};
app.post('/api/evaluate-study', upload.single('file'), async (req, res) => {
    if (!ragSystem) {
        return res.status(503).json({ error: 'RAG system is not ready yet. Please try again later.' });
    }
    console.log('Received request to evaluate study');
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    try {
        let studyContent = req.body.description || '';
        if (req.file) {
            console.log('File received:', req.file.originalname);
            const dataBuffer = fs_1.default.readFileSync(req.file.path);
            const pdfData = await (0, pdf_parse_1.default)(dataBuffer);
            console.log('PDF parsed. Raw text length:', pdfData.text.length);
            const decodedText = iconv_lite_1.default.decode(Buffer.from(pdfData.text), 'utf-8');
            console.log('Decoded text length:', decodedText.length);
            console.log('First 1000 characters of decoded PDF content:', decodedText.substring(0, 1000));
            // Log any significant differences between raw and decoded text
            if (pdfData.text.length !== decodedText.length) {
                console.log('Note: Decoded text length differs from raw text length');
                console.log('Raw text (first 100 chars):', pdfData.text.substring(0, 100));
                console.log('Decoded text (first 100 chars):', decodedText.substring(0, 100));
            }
            studyContent += '\n' + decodedText;
            console.log('Total study content length after adding PDF:', studyContent.length);
            fs_1.default.unlinkSync(req.file.path); // Clean up the uploaded file
            console.log('Temporary file deleted');
        }
        if (!studyContent.trim()) {
            throw new Error('No study content provided');
        }
        console.log('Study content:', studyContent.substring(0, 100) + '...');
        const result = await ragSystem.query(studyContent);
        console.log('Evaluation result:', result.summary.substring(0, 100) + '...');
        res.json({
            summary: result.summary,
            fullEvaluation: result.fullEvaluation
        });
    }
    catch (error) {
        console.error('Error evaluating study:', error);
        res.status(500).json({ error: 'Error evaluating study', details: error instanceof Error ? error.message : 'Unknown error' });
    }
});
// In server/src/api/index.ts
app.post('/api/add-document', upload.single('file'), async (req, res) => {
    if (!ragSystem) {
        return res.status(503).json({ error: 'RAG system is not ready yet. Please try again later.' });
    }
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    try {
        const dataBuffer = fs_1.default.readFileSync(req.file.path);
        const pdfData = await (0, pdf_parse_1.default)(dataBuffer);
        const document = {
            id: req.file.filename,
            content: pdfData.text,
            metadata: {
                title: req.body.title || req.file.originalname,
                // Add any other metadata you want to include
            }
        };
        await ragSystem.addDocument(document);
        fs_1.default.unlinkSync(req.file.path);
        res.status(200).send('Document added successfully.');
    }
    catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).send('Error processing PDF file.');
    }
});
app.listen(3001, () => {
    console.log('Server running on http://localhost:3001');
    initializeRAGSystem();
});

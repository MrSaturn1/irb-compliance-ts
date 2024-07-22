import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import pdf from 'pdf-parse';
import { RAGSystem } from '../rag';
import { Document } from '../rag/types';
import cors from 'cors';
import iconv from 'iconv-lite';

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
const upload = multer({ dest: 'uploads/' });
const groq_api_key: string = process.env.GROQ_API_KEY || '';
let ragSystem: RAGSystem | null = null;

const initializeRAGSystem = async () => {
  console.log('Initializing RAG system...');
  ragSystem = new RAGSystem(groq_api_key);
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
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdf(dataBuffer);
      console.log('PDF parsed. Raw text length:', pdfData.text.length);
      const decodedText = iconv.decode(Buffer.from(pdfData.text), 'utf-8');
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

      fs.unlinkSync(req.file.path); // Clean up the uploaded file
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
  } catch (error) {
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
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdf(dataBuffer);
    
    const document: Document = {
      id: req.file.filename,
      content: pdfData.text,
      metadata: {
        title: req.body.title || req.file.originalname,
        // Add any other metadata you want to include
      }
    };
    await ragSystem.addDocument(document);
    
    fs.unlinkSync(req.file.path);
    res.status(200).send('Document added successfully.');
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).send('Error processing PDF file.');
  }
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
  initializeRAGSystem();
});

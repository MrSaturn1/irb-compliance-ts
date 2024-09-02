import dotenv from 'dotenv';
dotenv.config(); // Ensure this is called at the top before accessing any env variables
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import pdf from 'pdf-parse';
import { RAGSystem } from '../rag';
import { Document } from '../rag/types';
import cors from 'cors';
import iconv from 'iconv-lite';
import { v4 as uuidv4 } from 'uuid';
import { RateLimiter } from '../utils/rateLimiter';
import http from 'http';
import { Server } from 'socket.io';

// Load environment variables
const app = express();
const port = process.env.PORT || 3001; // Default to 3001 if PORT is not set
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Add this root route handler
app.get('/', (req, res) => {
  res.send('IRB Compliance Backend is running');
});

// Set up CORS
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const groq_api_key: string = process.env.GROQ_API_KEY || '';
let ragSystem: RAGSystem | null = null;
const rateLimiter = new RateLimiter();

// Initialize RAG system
const initializeRAGSystem = async () => {
  console.log('Initializing RAG system...');
  ragSystem = new RAGSystem(groq_api_key);
  console.log('RAG system initialized.');
};

function asyncHandler(fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error('Error in route handler:', error);
      if (error instanceof Error && error.message.includes('Rate limit')) {
        res.status(429).json({ error: 'Rate limit reached. Please try again later.' });
      } else {
        res.status(500).json({ error: 'Error processing request', details: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  };
}

// Evaluate Study Endpoint
app.post('/api/evaluate-study', upload.single('file'), (req, res) => {
  const requestId = uuidv4();
  res.json({ requestId });

  processStudy(req, requestId);
});

async function processStudy(req: express.Request, requestId: string) {
  if (!ragSystem) {
    io.emit(`study_error_${requestId}`, { error: 'RAG system is not ready yet. Please try again later.' });
    return;
  }

  console.log('Received request to evaluate study');

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

      if (pdfData.text.length !== decodedText.length) {
        console.log('Note: Decoded text length differs from raw text length');
        console.log('Raw text (first 100 chars):', pdfData.text.substring(0, 100));
        console.log('Decoded text (first 100 chars):', decodedText.substring(0, 100));
      }

      studyContent += '\n' + decodedText;
      console.log('Total study content length after adding PDF:', studyContent.length);
      fs.unlinkSync(req.file.path);
      console.log('Temporary file deleted');
    }

    if (!studyContent.trim()) {
      throw new Error('No study content provided');
    }

    console.log('Study content:', studyContent.substring(0, 100) + '...');

    const tokenCount = ragSystem.tokenizer.countTokens(studyContent);

    const result = await rateLimiter.limit(
      async () => {
        io.emit(`study_status_${requestId}`, { status: 'Processing study...' });
        return await ragSystem!.query(studyContent);
      },
      tokenCount
    );

    io.emit(`study_complete_${requestId}`, { 
      summary: result.summary,
      fullEvaluation: result.fullEvaluation
    });

  } catch (error) {
    console.error('Error evaluating study:', error);
    if (error instanceof Error && error.message.includes('Rate limit')) {
      io.emit(`study_status_${requestId}`, { status: 'Rate limit reached. Waiting to retry...' });
      // The rateLimiter will handle the waiting and retry automatically
    } else {
      io.emit(`study_error_${requestId}`, { 
        error: 'Error evaluating study', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}

// Add Document Endpoint
app.post('/api/add-document', upload.single('file'), asyncHandler(async (req, res) => {
  if (!ragSystem) {
    res.status(503).json({ error: 'RAG system is not ready yet. Please try again later.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }
  
  const dataBuffer = fs.readFileSync(req.file.path);
  const pdfData = await pdf(dataBuffer);
  
  const document: Document = {
    id: req.file.filename,
    content: pdfData.text,
    metadata: {
      title: req.body.title || req.file.originalname,
    }
  };
  await ragSystem.addDocument(document);
  
  fs.unlinkSync(req.file.path);
  res.status(200).json({ message: 'Document added successfully.' });
}));

// Custom error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Always send CORS headers
  res.header('Access-Control-Allow-Origin', frontendUrl);
  res.header('Access-Control-Allow-Credentials', 'true');
  
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// CHANGE: Replace the app.listen call at the end of the file with this:
server.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
  initializeRAGSystem();
});

// ADD: Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A client connected');
  
  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

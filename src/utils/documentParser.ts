import fs from 'fs/promises';
import pdf from 'pdf-parse';

export interface ParsedDocument {
  content: string;
  metadata: {
    title: string;
    type: string;
    source: string;
  };
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const dataBuffer = await fs.readFile(filePath);
  
  if (filePath.endsWith('.pdf')) {
    const pdfData = await pdf(dataBuffer);
    return {
      content: pdfData.text,
      metadata: {
        title: pdfData.info.Title || 'Untitled',
        type: 'pdf',
        source: filePath,
      }
    };
  }
  
  if (filePath.endsWith('.txt')) {
    const content = dataBuffer.toString('utf8');
    return {
      content,
      metadata: {
        title: 'Untitled Text Document',
        type: 'text',
        source: filePath,
      }
    };
  }

  throw new Error('Unsupported file type');
}
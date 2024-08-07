import fs from 'fs/promises';

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
    const pdfParse = await import('pdf-parse');
    const pdfData = await pdfParse.default(dataBuffer);
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
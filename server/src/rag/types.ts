// File: server/src/rag/types.ts

export interface Document {
  id: string;
  content: string;
  metadata: {
    title: string;
    [key: string]: any;  // This allows for additional metadata fields
  };
}
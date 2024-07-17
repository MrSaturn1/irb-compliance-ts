// File: src/rag/index.ts
import path from 'path';
import fs from 'fs';
import GroqClient from 'groq-sdk';
import { Document } from './types';
import { VectorStore } from './vectorStore';
import { Tokenizer } from './tokenizer';
import { encode, decode } from 'gpt-3-encoder';
import { RateLimiter } from '../utils/rateLimiter';

export class RAGSystem {
  private vectorStore: VectorStore;
  private groqClient: GroqClient;
  private tokenizer: Tokenizer;
  private defaultDocumentsProcessedFlag: string;
  private rateLimiter: RateLimiter;

  constructor(apiKey: string) {
    this.vectorStore = new VectorStore();
    this.groqClient = new GroqClient({ apiKey });
    this.tokenizer = new Tokenizer();
    this.defaultDocumentsProcessedFlag = path.join(__dirname, '../../data/default_documents_processed');
    this.rateLimiter = new RateLimiter();
    this.initializeWithDefaultDocuments();
  }

  /*private chunkText(text: string, maxTokens: number = 1000): string[] {
    const tokens = encode(text);
    const chunks: string[] = [];
    let currentChunk: number[] = [];

    for (const token of tokens) {
      if (currentChunk.length + 1 > maxTokens) {
        chunks.push(decode(currentChunk));
        currentChunk = [];
      }
      currentChunk.push(token);
    }

    if (currentChunk.length > 0) {
      chunks.push(decode(currentChunk));
    }

    return chunks;
  }*/

  private chunkText(text: string, maxTokens: number = 500): string[] {
    return this.tokenizer.chunkDocument({ content: text, id: '', metadata: { title: 'tempDoc' } }, maxTokens);
  }

  private async initializeWithDefaultDocuments() {
    if (fs.existsSync(this.defaultDocumentsProcessedFlag)) {
      console.log('Default documents already processed. Skipping initialization.');
      return;
    }

    const defaultDocumentsPath = path.join(__dirname, '../../../default_documents');
    try {
      const files = fs.readdirSync(defaultDocumentsPath);
      let totalChunks = 0;
      for (const file of files) {
        const filePath = path.join(defaultDocumentsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const chunks = this.chunkText(content);
        
        for (let i = 0; i < chunks.length; i++) {
          await this.vectorStore.addChunk({
            id: `${file}-chunk-${i}`,
            content: chunks[i],
            metadata: { 
              title: file,
              chunkIndex: i,
              totalChunks: chunks.length
            }
          });
        }
        
        totalChunks += chunks.length;
        console.log(`Processed ${file}: ${chunks.length} chunks`);
      }
      console.log(`Initialized with ${files.length} default documents (${totalChunks} total chunks)`);
      fs.writeFileSync(this.defaultDocumentsProcessedFlag, 'processed');
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error initializing with default documents:', error.message);
      } else {
        console.error('Unknown error initializing with default documents:', error);
      }
    }
  }

  private countTokens(text: string): number {
    return this.tokenizer.countTokens(text);
  }

  private async recursiveSummarize(text: string, maxTokens: number = 4000): Promise<string> {
    const chunks = this.chunkText(text, maxTokens);
    
    if (chunks.length === 1) {
      return chunks[0];
    }

    let summaries: string[] = [];

    for (const chunk of chunks) {
      const summaryPrompt = `
      Summarize the following evaluation of an IRB study proposal. Focus on key points of compliance and non-compliance, without repeating the verdict multiple times:

      ${chunk}
      `;

      const summaryResponse = await this.rateLimiter.limit(
        async () => {
          const result = await this.groqClient.chat.completions.create({
            messages: [{ role: 'user', content: summaryPrompt }],
            model: 'llama3-8b-8192',
            temperature: 0.5,
            max_tokens: 1000,
          });

          if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            return result.choices[0].message.content || '';
          }
          throw new Error('Unexpected response structure from Groq API for summary');
        },
        this.countTokens(summaryPrompt)
      );

      summaries.push(summaryResponse);
    }

    const combinedSummaries = summaries.join('\n\n');

    if (this.countTokens(combinedSummaries) <= maxTokens) {
      return this.finalSummarize(combinedSummaries);
    } else {
      return this.recursiveSummarize(combinedSummaries, maxTokens);
    }
  }

  private async finalSummarize(text: string): Promise<string> {
    const finalPrompt = `
    Create a final, cohesive summary of the following IRB study evaluation. Include:
    1. A single, clear verdict (compliant or non-compliant)
    2. Key points of compliance (if any)
    3. Key points of non-compliance
    4. Any important recommendations

    Ensure the summary is concise and non-repetitive:

    ${text}
    `;

    const finalSummary = await this.rateLimiter.limit(
      async () => {
        const result = await this.groqClient.chat.completions.create({
          messages: [{ role: 'user', content: finalPrompt }],
          model: 'llama3-8b-8192',
          temperature: 0.5,
          max_tokens: 2000,
        });

        if (result.choices && result.choices.length > 0 && result.choices[0].message) {
          return result.choices[0].message.content || '';
        }
        throw new Error('Unexpected response structure from Groq API for final summary');
      },
      this.countTokens(finalPrompt)
    );

    return finalSummary;
  }

  private async extractSectionTitles(studyContent: string): Promise<string[]> {
    // First, try to find a table of contents
    const tocRegex = /Table of Contents([\s\S]*?)(?:\n\n|\z)/i;
    const tocMatch = studyContent.match(tocRegex);
    
    if (tocMatch) {
      // Extract titles from the table of contents
      const tocContent = tocMatch[1];
      const titleRegex = /^\s*(?:\d+\.)*\s*(.+?)(?:\s*\.{2,}|\s*$)/gm;
      const titles = [...tocContent.matchAll(titleRegex)].map(match => match[1].trim());
      
      if (titles.length > 0) {
        return titles;
      }
    }
    
    // If no ToC or no titles found, parse the entire document for headers
    const headerRegex = /^(#{1,6})\s+(.+?)$/gm;
    const headers = [...studyContent.matchAll(headerRegex)].map(match => ({
      level: match[1].length,
      title: match[2].trim()
    }));
    
    // Sort headers by their appearance in the document and extract titles
    return headers.sort((a, b) => studyContent.indexOf(a.title) - studyContent.indexOf(b.title))
                  .map(header => header.title);
  }

  private async identifySections(studyContent: string): Promise<Section[]> {
    const sectionTitles = await this.extractSectionTitles(studyContent);
    const sections: Section[] = [];

    for (let i = 0; i < sectionTitles.length; i++) {
      const currentTitle = sectionTitles[i];
      const nextTitle = sectionTitles[i + 1];
      
      const startIndex = studyContent.indexOf(currentTitle);
      const endIndex = nextTitle ? studyContent.indexOf(nextTitle) : studyContent.length;
      
      if (startIndex !== -1) {
        sections.push({
          title: currentTitle,
          content: studyContent.slice(startIndex + currentTitle.length, endIndex).trim()
        });
      }
    }

    return sections;
  }

  private async generateEvaluationCriteria(sectionTitle: string): Promise<string[]> {
    const prompt = `
    Generate a list of 3-5 key evaluation criteria for the following section of an IRB study proposal:

    Section Title: ${sectionTitle}

    Provide the criteria as a comma-separated list.
    `;

    try {
      const response = await this.rateLimiter.limit(
        async () => {
          const result = await this.groqClient.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama3-8b-8192', // or whichever model you're using
            temperature: 0.7,
            max_tokens: 200,
          });

          if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            return result.choices[0].message.content || '';
          }
          throw new Error('Unexpected response structure from Groq API for criteria generation');
        },
        this.countTokens(prompt)
      );

      // Parse the response and return as an array of strings
      const criteriaList = response.split(',').map(criterion => criterion.trim());

      // Filter out any empty strings
      return criteriaList.filter(criterion => criterion.length > 0);

    } catch (error) {
      console.error(`Error generating evaluation criteria for section "${sectionTitle}":`, error);
      // Return a default set of criteria in case of an error
      return ["Compliance with IRB standards", "Clarity of information", "Ethical considerations"];
    }
  }

  async addDocument(document: Document): Promise<void> {
    const chunks = this.chunkText(document.content);
    for (let i = 0; i < chunks.length; i++) {
      await this.vectorStore.addChunk({
        id: `${document.id}-chunk-${i}`,
        content: chunks[i],
        metadata: { ...document.metadata, chunkIndex: i, totalChunks: chunks.length }
      });
    }
    console.log(`Added document ${document.id}: ${chunks.length} chunks`);
  }

  async query(studyContent: string): Promise<{ fullEvaluation: string; summary: string }> {
    const chunks = this.chunkText(studyContent, 500);
    let fullEvaluation = '';
    console.log(`Study content chunked into ${chunks.length} parts`);

    const maxContextLength = 8192; // for llama3-8b-8192 model
    const reservedTokens = 10; // Reserve tokens for the response

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i + 1}/${chunks.length}`);

      console.time('Vector store search');
      const relevantContextChunks = await this.vectorStore.search(chunk);
      console.timeEnd('Vector store search');

      let context = '';
      let promptPrefix = `
  You are an expert on IRB standards for studies involving human subjects. Please evaluate the provided study design for compliance with IRB standards. Your response should clearly state whether the study is compliant or non-compliant, and provide detailed reasoning based on specific IRB standards. Non-compliant features of the proposed study should all be highlighted in your response.

  This is part of a longer study. Focus on evaluating this specific part based on the context provided.

  Context:
  `;

      let promptSuffix = `

  Study Part ${i} of ${chunks.length}:
  ${chunk}

  Based on the context and the study part, provide your evaluation.`;

      // Calculate available tokens for context
      const availableContextTokens = maxContextLength - this.countTokens(promptPrefix) - this.countTokens(promptSuffix) - reservedTokens;

      // Add context chunks until we reach the token limit
      for (const contextChunk of relevantContextChunks) {
        if (this.countTokens(context + contextChunk) > availableContextTokens) {
          break;
        }
        context += contextChunk + '\n\n';
      }

      const prompt = promptPrefix + context + promptSuffix;
      const promptTokens = this.countTokens(prompt);
      console.log(`Total prompt tokens: ${promptTokens}`);

      try {
        console.time('Groq API call');
        const response = await this.rateLimiter.limit(
          async () => {
            console.log(`Sending request to Groq API for chunk ${i + 1}`);
            const result = await this.groqClient.chat.completions.create({
              messages: [{ role: 'user', content: prompt }],
              model: 'llama3-8b-8192',
              temperature: 0,
              max_tokens: maxContextLength - promptTokens, // Dynamically set max_tokens
            });
            
            if (result.choices && result.choices.length > 0 && result.choices[0].message) {
              const responseContent = result.choices[0].message.content || '';
              const responseTokens = this.countTokens(responseContent);
              console.log(`Response tokens: ${responseTokens}`);
              console.log(`Total tokens for this request: ${promptTokens + responseTokens}`);
            }

            return result;
          },
          promptTokens
        );
        console.timeEnd('Groq API call');

        if (response.choices && response.choices.length > 0 && response.choices[0].message) {
          fullEvaluation += (response.choices[0].message.content || '') + '\n\n';
        } else {
          throw new Error('Unexpected response structure from Groq API');
        }
      } catch (error) {
        console.error(`Error processing chunk ${i + 1}:`, error);
      }
    }

    return {
      fullEvaluation,
      summary: await this.finalSummarize(await this.recursiveSummarize(fullEvaluation))
    };
  }
}
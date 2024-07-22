// File: src/rag/index.ts
import path from 'path';
import fs from 'fs';
import GroqClient from 'groq-sdk';
import { Document } from './types';
import { VectorStore } from './vectorStore';
import { Tokenizer } from './tokenizer';
import { encode, decode } from 'gpt-3-encoder';
import { RateLimiter } from '../utils/rateLimiter';

type Section = {
  title: string;
  content: string;
};

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

  private chunkText(text: string, maxTokens: number = 2000): string[] {
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
      Summarize the following evaluation of an IRB study proposal. Focus on key points of compliance and non-compliance, and understand that each evaluation is part of a larger study. Synthesize and resolve these evaluations into a coherent whole. For example, if evaluation of one part in a given section displays compliance with an IRB criteria, but evaluation of other parts in that section claim that element is missing and therefore the study is non-compliant, synthesize these evaluations to ensure that the study is determined to be compliant for that element, while maintaining other relevant concerns. Section:

      ${chunk}
      `;

      const summaryResponse = await this.rateLimiter.limit(
        async () => {
          const result = await this.groqClient.chat.completions.create({
            messages: [{ role: 'user', content: summaryPrompt }],
            model: 'llama3-8b-8192',
            temperature: 0.5,
            max_tokens: 5000,
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
          max_tokens: 5000,
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

  private async extractSectionTitles(studyContent: string): Promise<{ title: string; page: number }[]> {
    console.log("Extracting section titles...");
    // Look for a table of contents-like structure
    const tocRegex = /(?:Title\s*:|Table\s*of\s*Contents)?[\s\S]*?(.+\s+\d+\s*\n){2,}/i;
    const tocMatch = studyContent.match(tocRegex);
    
    if (tocMatch) {
      const tocContent = tocMatch[0];
      // This regex looks for lines with a title followed by page numbers
      const titleRegex = /^(.+?)[\s.]+(\d+)\s*$/gm;
      const titles = [...tocContent.matchAll(titleRegex)].map(match => ({
        title: match[1].trim()
                       .replace(/\.+$/, '')  // Remove trailing dots
                       .replace(/\.{2,}/g, ' ')  // Replace multiple dots with a space
                       .replace(/\s+/g, ' ')  // Replace multiple spaces with a single space
                       .trim(),  // Trim any leading/trailing spaces
        page: parseInt(match[2])
      }));
      
      if (titles.length > 0) {
        // Further process titles to preserve spaces and commas
        const processedTitles = titles.map(title => ({
          ...title,
          title: title.title
            .replace(/(\w)([A-Z])/g, '$1 $2')  // Add space between camelCased words
            .replace(/([a-z])(\d)/g, '$1 $2')  // Add space between letters and numbers
            .replace(/(\d)([a-z])/gi, '$1 $2') // Add space between numbers and letters
            .replace(/,(\w)/g, ', $1')         // Add space after commas
        }));
        
        console.log(`Extracted ${processedTitles.length} section titles from table of contents:`, processedTitles);
        return processedTitles;
      }
    }
    
    // If no ToC-like structure is found, fall back to parsing headers
    const headerRegex = /^(#{1,6}|\d+\.)\s+(.+?)$/gm;
    const headers = [...studyContent.matchAll(headerRegex)].map((match, index) => ({
      title: match[2].trim(),
      page: index + 1 // Assign arbitrary page numbers if no ToC is found
    }));
    
    // If no sections are found, create a default section
    if (headers.length === 0) {
      console.log("No sections found. Creating a default section.");
      return [{ title: "Full Study", page: 1 }];
    }
    
    console.log(`Extracted ${headers.length} section titles:`, headers);
    return headers;
  }

  private async identifySections(studyContent: string): Promise<Section[]> {
    const extractedTitles = await this.extractSectionTitles(studyContent);
    let sections: Section[] = [];

    console.log("Raw extracted titles:", extractedTitles);

    const strategies = [
      this.identifySectionsByExactMatch,
      this.identifySectionsByFlexibleMatch,
      this.identifySectionsByPageNumbers,
      this.identifySectionsByHeaders
    ];

    for (const strategy of strategies) {
      console.time(`Strategy: ${strategy.name}`);
      const strategyResults = await strategy.call(this, studyContent, extractedTitles);
      console.timeEnd(`Strategy: ${strategy.name}`);
      console.log(`Sections identified using strategy ${strategy.name}:`, strategyResults.length);
      sections = this.mergeSections(sections, strategyResults, extractedTitles);
    }

    if (sections.length === 0) {
      console.warn("No sections identified after trying all strategies. Creating a single section with all content.");
      sections.push({
        title: "Full Study",
        content: studyContent.trim()
      });
    }

    sections = this.sortSectionsByOrder(sections, extractedTitles);
    this.checkSectionConsistency(sections, extractedTitles);

    console.log("Identified sections:");
    sections.forEach((section, index) => {
      console.log(`Section ${index + 1}: ${section.title}`);
      console.log("Content length:", section.content.length);
      console.log("First 200 characters:", section.content.substring(0, 200));
      console.log("Last 200 characters:", section.content.substring(section.content.length - 200));
      console.log("---");
    });

    return sections;
  }

  private mergeSections(existing: Section[], newSections: Section[], extractedTitles: { title: string; page: number }[]): Section[] {
    const merged = [...existing];
    for (const newSection of newSections) {
      const existingIndex = merged.findIndex(s => s.title.toLowerCase() === newSection.title.toLowerCase());
      if (existingIndex === -1) {
        // Only add new sections that match extracted titles
        if (extractedTitles.some(title => title.title.toLowerCase() === newSection.title.toLowerCase())) {
          merged.push(newSection);
        }
      } else if (newSection.content.length > merged[existingIndex].content.length) {
        // Replace existing section if new section has more content
        merged[existingIndex] = newSection;
      }
    }
    return merged;
  }

  private sortSectionsByOrder(sections: Section[], tocTitles: { title: string; page: number }[]): Section[] {
    return sections.sort((a, b) => {
      const indexA = tocTitles.findIndex(t => t.title === a.title);
      const indexB = tocTitles.findIndex(t => t.title === b.title);
      return indexA - indexB;
    });
  }

  private async identifySectionsByExactMatch(studyContent: string, extractedTitles: { title: string; page: number }[]): Promise<Section[]> {
    const sections: Section[] = [];
    for (let i = 0; i < extractedTitles.length; i++) {
      const currentTitle = extractedTitles[i].title;
      const nextTitle = extractedTitles[i + 1]?.title;
      const startIndex = studyContent.indexOf(currentTitle);
      if (startIndex !== -1) {
        const endIndex = nextTitle ? studyContent.indexOf(nextTitle, startIndex + currentTitle.length) : studyContent.length;
        sections.push({
          title: currentTitle,
          content: studyContent.slice(startIndex, endIndex).trim()
        });
      }
    }
    return sections;
  }

  private async identifySectionsByFlexibleMatch(studyContent: string, extractedTitles: { title: string; page: number }[]): Promise<Section[]> {
    const sections: Section[] = [];
    for (let i = 0; i < extractedTitles.length; i++) {
      const currentTitle = extractedTitles[i].title;
      const nextTitle = extractedTitles[i + 1]?.title;
      const escapedTitle = currentTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Look for titles that are on their own line or preceded by a number
      const sectionStartRegex = new RegExp(`(^|\\n)\\s*(\\d+\\.?\\s*)?${escapedTitle}\\s*$`, 'im');
      const sectionMatch = studyContent.match(sectionStartRegex);
      if (sectionMatch) {
        const startIndex = sectionMatch.index;
        const nextSectionRegex = nextTitle ? new RegExp(`(^|\\n)\\s*(\\d+\\.?\\s*)?${nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im') : null;
        const endIndex = nextSectionRegex 
          ? studyContent.slice(startIndex).search(nextSectionRegex) + startIndex
          : studyContent.length;
        sections.push({
          title: currentTitle,
          content: studyContent.slice(startIndex, endIndex).trim()
        });
      }
    }
    return sections;
  }

  private async identifySectionsByPageNumbers(studyContent: string, extractedTitles: { title: string; page: number }[]): Promise<Section[]> {
    const sections: Section[] = [];
    const pageMarkers = [...studyContent.matchAll(/\n\s*Page\s+(\d+)\s+of\s+\d+/g)];
    for (let i = 0; i < extractedTitles.length; i++) {
      const currentTitle = extractedTitles[i].title;
      const currentPage = extractedTitles[i].page;
      const nextPage = extractedTitles[i + 1]?.page || pageMarkers.length + 1;
      const startMarker = pageMarkers.find(marker => parseInt(marker[1]) >= currentPage);
      const endMarker = pageMarkers.find(marker => parseInt(marker[1]) >= nextPage);
      if (startMarker) {
        const startIndex = startMarker.index;
        const endIndex = endMarker ? endMarker.index : studyContent.length;
        sections.push({
          title: currentTitle,
          content: studyContent.slice(startIndex, endIndex).trim()
        });
      }
    }
    return sections;
  }

  private async identifySectionsByHeaders(studyContent: string, extractedTitles: { title: string; page: number }[]): Promise<Section[]> {
    const sections: Section[] = [];
    const headerRegex = /^(#{1,6}|\d+\.)\s+(.+?)$/gm;
    const headers = [...studyContent.matchAll(headerRegex)];
    for (let i = 0; i < headers.length; i++) {
      const currentHeader = headers[i][2].trim();
      // Only consider headers that match extracted titles
      if (extractedTitles.some(title => title.title.toLowerCase() === currentHeader.toLowerCase())) {
        const nextHeader = headers[i + 1]?.[2].trim();
        const startIndex = headers[i].index;
        const endIndex = nextHeader ? studyContent.indexOf(nextHeader, startIndex) : studyContent.length;
        sections.push({
          title: currentHeader,
          content: studyContent.slice(startIndex, endIndex).trim()
        });
      }
    }
    return sections;
  }

  private handleNestedSections(sections: Section[]): Section[] {
    const result: Section[] = [];
    const stack: Section[] = [];

    for (const section of sections) {
      while (stack.length > 0 && this.isSubsection(stack[stack.length - 1].title, section.title)) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        parent.content += `\n\n${section.title}\n${section.content}`;
      } else {
        result.push(section);
      }

      stack.push(section);
    }

    return result;
  }

  private isSubsection(parentTitle: string, childTitle: string): boolean {
    const parentLevel = this.getSectionLevel(parentTitle);
    const childLevel = this.getSectionLevel(childTitle);
    return childLevel > parentLevel;
  }

  private getSectionLevel(title: string): number {
    const match = title.match(/^(#{1,6}|\d+\.)/);
    if (match) {
      return match[0].length;
    }
    return 0;
  }

  private checkSectionConsistency(extractedSections: Section[], tocTitles: { title: string; page: number }[]): void {
    const extractedTitles = extractedSections.map(s => s.title.toLowerCase());
    const missingTitles = tocTitles.filter(t => !extractedTitles.includes(t.title.toLowerCase()));
    
    if (missingTitles.length > 0) {
      console.warn('Warning: Some sections from the table of contents were not extracted:');
      missingTitles.forEach(t => console.warn(`  - ${t.title}`));
    }

    const extraTitles = extractedTitles.filter(t => !tocTitles.some(toc => toc.title.toLowerCase() === t));
    if (extraTitles.length > 0) {
      console.warn('Warning: Some extracted sections were not in the table of contents:');
      extraTitles.forEach(t => console.warn(`  - ${t}`));
    }
  }

  private async generateEvaluationCriteria(sectionTitle: string): Promise<string[]> {
    const prompt = `
    Generate a list of 3-5 key evaluation criteria specifically for the "${sectionTitle}" section of an IRB study proposal.
    These criteria should be relevant only to this section, not to the overall study.
    For example, don't include criteria about study title for a "Methods" section.
    Provide the criteria as a comma-separated list.
    `;

    try {
      const response = await this.rateLimiter.limit(
        async () => {
          const result = await this.groqClient.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama3-8b-8192', // or whichever model you're using
            temperature: 0.7,
            max_tokens: 2000,
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
    console.log("Starting query method. Study content length:", studyContent.length);
    const sections = await this.identifySections(studyContent);
    let fullEvaluation = '';
    const maxContextLength = 8192; // for llama3-8b-8192 model
    const reservedTokens = 10; // Reserve tokens for the response

    console.log(`Identified ${sections.length} sections in the study content`);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log(`Processing section ${i + 1}/${sections.length}: ${section.title}`);
      console.log("Section content length:", section.content.length);
      console.log("First 500 characters of section:", section.content.substring(0, 500));

      const chunks = this.chunkText(section.content, 2000);
      console.log(`Section chunked into ${chunks.length} parts`);
      let sectionEvaluation = '';

      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        console.log(`Processing chunk ${j + 1}/${chunks.length} of section ${section.title}`);
        console.log("Chunk content:", chunk);

        console.time('Vector store search');
        const relevantContextChunks = await this.vectorStore.search(chunk);
        console.timeEnd('Vector store search');

        let context = '';
        const criteria = await this.generateEvaluationCriteria(section.title);
        let promptPrefix = `
  You are an expert on IRB standards for studies involving human subjects. Please evaluate the provided section of a study design for compliance with IRB standards. Your response should ONLY address the following criteria:
  ${criteria.join('\n')}

  Highlight areas of compliance and non-compliance where they occur. Focus on evaluating this specific part based on the context and criteria provided.

  Context:
  `;
        let promptSuffix = `

  Section: ${section.title}
  Part ${j + 1} of ${chunks.length}:
  ${chunk}

  Based on the context, criteria, and the study part, provide your evaluation.`;

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
              console.log(`Sending request to Groq API for section ${section.title}, chunk ${j + 1}`);
              const result = await this.groqClient.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-8b-8192',
                temperature: 0,
                max_tokens: 2000,
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
            sectionEvaluation += (response.choices[0].message.content || '') + '\n\n';
            console.log(`Added evaluation for chunk ${j + 1}. Current section evaluation length: ${sectionEvaluation.length}`);
            console.log(`Evaluation for chunk ${j + 1}:`, (response.choices[0].message.content || '').substring(0, 200) + "...");
          } else {
            throw new Error('Unexpected response structure from Groq API');
          }
        } catch (error) {
          console.error(`Error processing section ${section.title}, chunk ${j + 1}:`, error);
        }
      }

      fullEvaluation += `Evaluation for Section: ${section.title}\n\n${sectionEvaluation}\n\n`;
      console.log(`Added evaluation for section ${section.title}. Current full evaluation length: ${fullEvaluation.length}`);
      console.log(`Full evaluation for section ${section.title}:`, sectionEvaluation.substring(0, 500) + "...");
    }

    if (fullEvaluation.trim().length === 0) {
      throw new Error("No evaluation generated for the study");
    }

    console.log("Full evaluation completed. Length:", fullEvaluation.length);

    try {
      console.log("Starting recursive summarization");
      const recursiveSummary = await this.recursiveSummarize(fullEvaluation);
      console.log("Recursive summarization completed. Length:", recursiveSummary.length);

      console.log("Starting final summarization");
      const finalSummary = await this.finalSummarize(recursiveSummary);
      console.log("Final summarization completed. Length:", finalSummary.length);

      return { fullEvaluation, summary: finalSummary };
    } catch (error) {
      console.error("Error in summarization process:", error);
      throw error;
    }
  }
}
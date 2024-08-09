// src/app/page.tsx
"use client";

import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadIcon } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { ProgressBar } from "@/components/ui/ProgressBar";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fullEvaluation, setFullEvaluation] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);
    setFullEvaluation(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/evaluate-study`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          setFeedback('The server is currently busy. Please wait a moment and try again.');
          return;
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
      }

      const data = await response.json();
      if (data && data.summary && data.fullEvaluation) {
        setFeedback(data.summary);
        setFullEvaluation(data.fullEvaluation);
      } else {
        throw new Error('Evaluation data not found in response');
      }
    } catch (error) {
      console.error('Error submitting study:', error);
      if (error instanceof Error) {
        setFeedback(`An error occurred while evaluating the study: ${error.message}`);
      } else {
        setFeedback('An unknown error occurred while evaluating the study.');
      }
      setFullEvaluation(null);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const formatResponseText = (text: string) => {
    // Format headers
    let formattedText = text.replace(/\*\*(Compliance|Non-compliance):\*\*/g, '<h4 class="text-md font-semibold mb-2">$1:</h4>');
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<h3 class="text-lg font-bold mb-2">$1</h3>');

    // Format bullet points
    formattedText = formattedText.replace(/\* (.*?)(\n|$)/g, '<li>$1</li>');

    // Wrap bullet points with <ul>
    formattedText = formattedText.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');

    // Format numbered lists with line breaks
    formattedText = formattedText.replace(/(\d+)\. (.*?)(?=\d+\.|$)/g, '<li>$1. $2</li>\n');
    formattedText = formattedText.replace(/(<li>.*?<\/li>)+/gs, '<ol>$&</ol>');

    return formattedText;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-12 flex flex-col min-h-screen">
      <div className="flex-grow">
        <Card className="p-6 bg-muted h-full max-h-[calc(100vh-16rem)] overflow-y-auto">
          <h2 className="text-2xl font-bold mb-4">IRB Evaluation</h2>
          {feedback ? (
            <>
              <div dangerouslySetInnerHTML={{ __html: formatResponseText(feedback) }} />
              <Separator className="my-4" />
              {fullEvaluation && (
                <div className="mt-4">
                  <div dangerouslySetInnerHTML={{ __html: formatResponseText(fullEvaluation) }} />
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No feedback available yet. Submit your proposal to get feedback.</p>
          )}
        </Card>
      </div>
      <form className="w-full mt-4" onSubmit={handleSubmit}>
        <div className="fixed bottom-0 left-0 right-0 bg-white py-4 shadow-lg flex justify-center space-x-4">
          {file && <span className="text-sm text-muted-foreground self-center mr-4">{file.name}</span>}
          <Button 
            type="button"
            variant="outline" 
            onClick={handleUploadClick}
          >
            <UploadIcon className="w-5 h-5 mr-2" />
            Upload Documents
          </Button>
          <input 
            ref={fileInputRef}
            type="file" 
            onChange={handleFileChange}
            className="hidden" 
          />
          <Button type="submit" disabled={isLoading || !file}>
            {isLoading ? 'Submitting...' : 'Submit Proposal'}
          </Button>
        </div>
      </form>
      <ProgressBar isLoading={isLoading} />
    </div>
  );
}

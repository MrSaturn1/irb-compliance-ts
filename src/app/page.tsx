// src/app/page.tsx
"use client";

import React, { useState, useRef } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UploadIcon, RefreshCwIcon, CircleIcon } from "@/components/ui/icons";

export default function Home() {
  const [studyTitle, setStudyTitle] = useState('');
  const [studyDescription, setStudyDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [trainingDocs, setTrainingDocs] = useState<File[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingFeedback, setTrainingFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullEvaluation, setFullEvaluation] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('title', studyTitle);
      formData.append('description', studyDescription);
      if (file) {
        formData.append('file', file);
      }

      console.log('Sending request to evaluate study');
      const response = await fetch('http://localhost:3001/api/evaluate-study', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response received:', data);
      
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
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleTrainingDocsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setTrainingDocs(Array.from(e.target.files));
    }
  };

  const handleModelTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTraining(true);

    try {
      const formData = new FormData();
      trainingDocs.forEach((file, index) => {
        formData.append(`file-${index}`, file);
      });

      const response = await fetch('http://localhost:3001/api/add-document', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });

      setTrainingFeedback('Documents successfully added for model training.');
    } catch (error) {
      console.error('Error submitting training documents:', error);
      setTrainingFeedback('An error occurred while adding training documents.');
    } finally {
      setIsTraining(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-20">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Submit a Study Proposal</h1>
            <p className="text-muted-foreground">
              Get your study reviewed and potentially approved for our subscription-based service.
            </p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="title">Study Title</Label>
              <Input 
                id="title" 
                value={studyTitle}
                onChange={(e) => setStudyTitle(e.target.value)}
                placeholder="Enter a title for your study" 
              />
            </div>
            <div>
              <Label htmlFor="description">Study Description</Label>
              <Textarea 
                id="description" 
                value={studyDescription}
                onChange={(e) => setStudyDescription(e.target.value)}
                placeholder="Provide a detailed description of your study" 
                rows={5} 
              />
              <div className="flex items-center gap-4 mt-4">
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
                {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Submitting...' : 'Submit Proposal'}
              </Button>
            </div>
          </form>
        </div>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">RAG Feedback</h2>
            <p className="text-muted-foreground">Get instant feedback on your study design.</p>
          </div>
          <Card className="p-6 bg-muted">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold">Study Design Quality</h3>
                <p className="text-muted-foreground">
                  Our AI model has reviewed your study design and provided the following feedback:
                </p>
              </div>
              {feedback && (
                <div className="flex items-center gap-2">
                  <CircleIcon className="w-6 h-6 fill-yellow-500" />
                  <span className="font-medium text-yellow-500">Feedback Available</span>
                </div>
              )}
            </div>
            <Separator className="my-4" />
            <div className="space-y-2">
              {feedback ? (
                <p>{feedback}</p>
              ) : (
                <p>Submit a study proposal to receive AI-generated feedback.</p>
              )}
            </div>
            {feedback && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => {setFeedback(null); setFullEvaluation(null);}}>
                    <RefreshCwIcon className="w-5 h-5 mr-2" />
                    Clear Feedback
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setFullEvaluation(prev => prev ? null : fullEvaluation)}
                  >
                    {fullEvaluation ? 'Hide Full Evaluation' : 'Show Full Evaluation'}
                  </Button>
                  <Link href="#" className="text-primary underline" prefetch={false}>
                    Learn more about study design
                  </Link>
                </div>
              </>
            )}
          </Card>
          {fullEvaluation && (
            <Card className="p-6 bg-muted mt-4">
              <h3 className="text-lg font-bold mb-2">Full Evaluation</h3>
              <p className="whitespace-pre-wrap">{fullEvaluation}</p>
            </Card>
          )}
        </div>
      </div>
      <Tabs defaultValue="study" className="mt-12">
        <TabsList>
          <TabsTrigger value="study">Study Proposal</TabsTrigger>
          <TabsTrigger value="model">Model Training</TabsTrigger>
        </TabsList>
        <TabsContent value="model">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Model Training</h2>
              <p className="text-muted-foreground">
                Submit additional documents to train the model assigned to your study.
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleModelTraining}>
              <div>
                <Label htmlFor="training-docs">Additional Documents</Label>
                <Input 
                  id="training-docs" 
                  type="file" 
                  onChange={handleTrainingDocsChange}
                  multiple
                />
                {trainingDocs.length > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {trainingDocs.length} file(s) selected
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Button type="submit" disabled={isTraining || trainingDocs.length === 0}>
                  {isTraining ? 'Submitting...' : 'Submit Documents'}
                </Button>
              </div>
            </form>
            {trainingFeedback && (
              <Card className="p-4 bg-muted">
                <p>{trainingFeedback}</p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
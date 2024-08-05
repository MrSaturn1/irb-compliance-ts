// src/components/ui/ProgressBar.tsx
import React from 'react';

export const ProgressBar: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
  if (!isLoading) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-blue-500 h-1 z-50">
      <div className="h-1 bg-blue-700 animate-progress"></div>
    </div>
  );
};

// src/components/ui/card.tsx
import React from 'react';

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card: React.FC<CardProps> = ({ children, ...props }) => {
  return (
    <div {...props} className="bg-white shadow rounded-lg p-4">
      {children}
    </div>
  );
};

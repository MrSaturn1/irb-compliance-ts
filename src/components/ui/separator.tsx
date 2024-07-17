// src/components/ui/separator.tsx
import React from 'react';

type SeparatorProps = React.HTMLAttributes<HTMLDivElement>;

export const Separator: React.FC<SeparatorProps> = (props) => {
  return (
    <div {...props} className="border-t border-gray-200" />
  );
};

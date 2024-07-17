// src/components/ui/label.tsx
import React from 'react';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label: React.FC<LabelProps> = ({ children, ...props }) => {
  return (
    <label {...props} className="block text-sm font-medium text-gray-700">
      {children}
    </label>
  );
};

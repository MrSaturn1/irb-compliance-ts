import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'outline' | 'solid';
  as?: string;
  htmlFor?: string;
  size?: 'sm' | 'md' | 'lg';
};

export const Button: React.FC<ButtonProps> = ({ children, variant = 'solid', size = 'md', ...props }) => {
  const variantClasses =
    variant === 'outline'
      ? 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
      : 'bg-indigo-600 text-white hover:bg-indigo-700';

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-1 text-sm'
      : size === 'lg'
      ? 'px-6 py-3 text-lg'
      : 'px-4 py-2';

  return (
    <button
      {...props}
      className={`rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${variantClasses} ${sizeClasses}`}
    >
      {children}
    </button>
  );
};

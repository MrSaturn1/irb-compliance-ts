"use client";

import React, { useState } from 'react';

type TabsProps = {
  children: React.ReactNode;
  defaultValue?: string;
  className?: string; // Add className prop
};

type TabsListProps = {
  children: React.ReactNode;
};

type TabsTriggerProps = {
  value: string;
  children: React.ReactNode;
  activeTab?: string;
  setActiveTab?: React.Dispatch<React.SetStateAction<string | undefined>>;
};

type TabsContentProps = {
  value: string;
  children: React.ReactNode;
  activeTab?: string;
};

export const Tabs: React.FC<TabsProps> = ({ children, defaultValue, className }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);

  return (
    <div className={`tabs ${className}`}>
      {React.Children.map(children, (child) =>
        React.cloneElement(child as React.ReactElement<any>, { activeTab, setActiveTab })
      )}
    </div>
  );
};

export const TabsList: React.FC<TabsListProps> = ({ children }) => {
  return <div className="tabs-list">{children}</div>;
};

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value,
  children,
  activeTab,
  setActiveTab,
}) => {
  const isActive = activeTab === value;
  return (
    <button
      className={`tabs-trigger ${isActive ? 'active' : ''}`}
      onClick={() => setActiveTab?.(value)}
    >
      {children}
    </button>
  );
};

export const TabsContent: React.FC<TabsContentProps> = ({ value, children, activeTab }) => {
  return activeTab === value ? <div className="tabs-content">{children}</div> : null;
};

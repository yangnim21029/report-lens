"use client";

import { useState } from "react";

interface CopyButtonProps {
  data: string;
  label?: string;
  className?: string;
}

export function CopyButton({ data, label = "Copy TSV", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`
        px-[var(--space-md)] py-[var(--space-sm)] 
        bg-[var(--accent-primary)] text-white 
        hover:bg-[var(--accent-primary-dark)] 
        transition-all duration-[var(--duration-normal)]
        font-bold text-[var(--text-sm)] uppercase
        border-0 cursor-pointer
        ${className}
      `}
    >
      {copied ? "✓ Copied!" : `📋 ${label}`}
    </button>
  );
}
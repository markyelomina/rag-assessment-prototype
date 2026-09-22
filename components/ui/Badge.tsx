import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export default function Badge({ children, variant = 'neutral' }: BadgeProps) {
  const baseStyle = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0";
  
  const variants = {
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-800",
    info: "bg-blue-100 text-blue-800",
    neutral: "bg-slate-100 text-slate-600"
  };

  return (
    <span className={`${baseStyle} ${variants[variant]}`}>
      {children}
    </span>
  );
}
import React from 'react';

interface FullScreenLoaderProps {
  isOpen: boolean;
  message?: string;
}

export default function FullScreenLoader({ isOpen, message = "Processing..." }: FullScreenLoaderProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-xs w-full mx-4 border border-slate-200">
        <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <h3 className="text-lg font-bold text-slate-800 text-center">{message}</h3>
        <p className="text-xs text-slate-500 font-bold mt-2 text-center text-balance">
          Please do not close or refresh this page.
        </p>
      </div>
    </div>
  );
}
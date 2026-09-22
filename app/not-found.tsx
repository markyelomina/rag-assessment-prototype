import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div 
      className="min-h-screen bg-slate-50 bg-cover bg-center bg-no-repeat flex flex-col justify-center items-center p-4"
      style={{ backgroundImage: "url('/background.svg')" }}
    >
      <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden text-center p-10">
        <h1 className="text-6xl font-black text-blue-600 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h2>
        <p className="text-sm font-bold text-slate-500 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link 
          href="/login" 
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm inline-block"
        >
          Return to Login
        </Link>
      </div>
    </div>
  );
}
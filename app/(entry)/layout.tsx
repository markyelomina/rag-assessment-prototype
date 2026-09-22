import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="min-h-screen bg-slate-50 bg-cover bg-center bg-no-repeat flex flex-col justify-center items-center p-4"
      style={{ backgroundImage: "url('/background.svg')" }}
    >
      {children}
    </div>
  );
}
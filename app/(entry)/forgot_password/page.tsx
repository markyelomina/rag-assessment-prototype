'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://rag-assessment-prototype.vercel.app/forgot_password/update_password', 
    });

    if (error) {
      setError(error.message);
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1500);
  };

  return (
    <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      
      <div className="p-6 bg-slate-900 text-center">
        <h1 className="text-2xl font-bold text-blue-400">RPLE Platform</h1>
        <p className="text-sm text-slate-300 mt-1">Reset your password</p>
      </div>

      <div className="p-6">
        {isSubmitted ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800">Check your email</h2>
            <p className="text-sm font-bold text-slate-600">
              If an account exists for <span className="text-slate-900">{email}</span>, you will receive password reset instructions shortly.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link href="/login" className="text-sm font-bold text-blue-600 hover:text-blue-800">
                Return to Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm font-bold text-slate-600 mb-4 text-center">
              Enter your university email address and we will send you instructions to reset your password.
            </p>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@university.edu" 
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-white border-2 text-slate-900 rounded-lg focus:outline-none focus:ring-1 placeholder-slate-400 ${
                  error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              {error && <p className="text-xs text-red-600 mt-1 font-bold">{error}</p>}
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className={`w-full text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4 flex justify-center items-center ${
                isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>

            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm font-bold text-blue-600 hover:text-blue-800">
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
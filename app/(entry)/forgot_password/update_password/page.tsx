'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
    } else {
      setIsSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    }
  };

  return (
    <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      
      <div className="p-6 bg-slate-900 text-center">
        <h1 className="text-2xl font-bold text-blue-400">RPLE Platform</h1>
        <p className="text-sm text-slate-300 mt-1">Create new password</p>
      </div>

      <div className="p-6">
        {isSuccess ? (
          <div className="text-center space-y-4 animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800">Password Updated!</h2>
            <p className="text-sm font-bold text-slate-600">
              Your password has been changed successfully. Redirecting to login...
            </p>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4">
            <p className="text-sm font-bold text-slate-600 mb-4 text-center">
              Please enter your new password below. Make sure it is at least 8 characters long.
            </p>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                disabled={isLoading}
                required
                className={`w-full px-4 py-3 bg-white border-2 text-slate-900 rounded-lg focus:outline-none focus:ring-1 placeholder-slate-400 ${
                  error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Confirm New Password</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••" 
                disabled={isLoading}
                required
                className={`w-full px-4 py-3 bg-white border-2 text-slate-900 rounded-lg focus:outline-none focus:ring-1 placeholder-slate-400 ${
                  error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>

            {error && <p className="text-xs text-red-600 mt-1 font-bold">{error}</p>}
            
            <button 
              type="submit" 
              disabled={isLoading}
              className={`w-full text-white font-bold py-3 px-4 rounded-lg transition-colors mt-6 flex justify-center items-center shadow-sm ${
                isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save New Password'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
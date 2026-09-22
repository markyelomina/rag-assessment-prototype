'use client';

import { supabase } from '@/lib/supabaseClient';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      newErrors.password = 'Password is required.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (authError) {
      setErrors({ email: 'Invalid login credentials. Please try again.' });
      setIsLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('Users')
      .select('role_id')
      .eq('user_id', authData.user.id)
      .single();

    if (profileError || !profileData) {
      setErrors({ email: 'Could not retrieve user profile.' });
      setIsLoading(false);
      return;
    }

    if (profileData.role_id === 3) {
      window.location.href = '/admin';
    } else if (profileData.role_id === 2) {
      window.location.href = '/faculty';
    } else if (profileData.role_id === 1) {
      window.location.href = '/learner';
    }
  };

  return (
    <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      
      <div className="p-6 bg-slate-900 text-center">
        <h1 className="text-2xl font-bold text-blue-400">RPLE Platform</h1>
        <p className="text-sm text-slate-300 mt-1">Sign in to your account</p>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu" 
              disabled={isLoading}
              className={`w-full px-4 py-3 bg-white border-2 text-slate-900 rounded-lg focus:outline-none focus:ring-1 placeholder-slate-400 ${
                errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {errors.email && <p className="text-xs text-red-600 mt-1 font-bold">{errors.email}</p>}
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" 
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-white border-2 text-slate-900 rounded-lg focus:outline-none focus:ring-1 pr-12 placeholder-slate-400 ${
                  errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none text-sm font-bold"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="mt-2 flex justify-end">
              <Link href="/forgot_password" className="text-xs font-bold text-blue-600 hover:underline">
                Forgot Password?
              </Link>
            </div>
            
            {errors.password && <p className="text-xs text-red-600 mt-1 font-bold">{errors.password}</p>}
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full text-white font-bold py-3 px-4 rounded-lg transition-colors mt-2 flex justify-center items-center ${
              isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing In...
              </>
            ) : (
              'Login'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs font-bold text-slate-500">
            Need an account? Please contact your university administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
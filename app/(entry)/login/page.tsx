'use client';

import { supabase } from '@/lib/supabaseClient';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const [logoUrl, setLogoUrl] = useState('/logo.png');
  const [platformName, setPlatformName] = useState('DeepCore Prep');

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('Platform_Settings').select('*').eq('id', 1).single();
      if (data) {
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.platform_name) setPlatformName(data.platform_name);
      }
    };
    fetchSettings();
  }, []);

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
      email,
      password,
    });

    if (authError) {
      await supabase.from('AuditLogs').insert([{
        user_email: email,
        role: 'Unauthenticated',
        action: 'Failed login attempt (Invalid credentials)',
        type: 'Security',
        severity: 'Warning',
        ip_address: 'Client IP', 
        user_agent: navigator.userAgent
      }]);
      setErrors({ email: 'Invalid email or password.' });
      setIsLoading(false);
      return;
    }

    if (authData.user) {
      const { data: userData, error: userError } = await supabase
        .from('Users')
        .select('account_status')
        .eq('user_id', authData.user.id)
        .single();

      if (userError || !userData) {
        setErrors({ email: "Could not verify account status." });
        setIsLoading(false);
        return;
      }

      if (userData.account_status !== 'Active') {
        await supabase.auth.signOut();
        setErrors({ email: "Your account has been deactivated. Please contact an administrator." });
        setIsLoading(false);
        return;
      }

      await supabase
        .from('Users')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', authData.user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('Users')
        .select('role_id')
        .eq('user_id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setErrors({ email: "Could not retrieve user profile." });
        setIsLoading(false);
        return;
      }

      const roleMap: Record<number, string> = { 1: 'Learner', 2: 'Teacher', 3: 'Admin' };
      const userRoleString = roleMap[profileData.role_id] || 'Unknown';

      await supabase.from('AuditLogs').insert([{
        user_email: email, 
        role: userRoleString, 
        action: 'Successful user login',
        type: 'User Activity',
        severity: 'Info',
        ip_address: 'Client IP',
        user_agent: navigator.userAgent
      }]);

      if (profileData.role_id === 3) {
        window.location.href = '/admin';
      } else if (profileData.role_id === 2) {
        window.location.href = '/faculty';
      } else if (profileData.role_id === 1) {
        window.location.href = '/learner';
      }
    }
  };

  return (
    <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
      
      <div className="pt-10 pb-4 px-8 text-center flex flex-col items-center">
        <img 
          src={logoUrl} 
          alt={`${platformName} Logo`} 
          className="h-40 w-auto object-contain mix-blend-multiply brightness-110 contrast-125 transition-all duration-300" 
        />
        <p className="text-sm font-bold text-slate-500 mt-2">Sign in to your account</p>
      </div>

      <div className="px-8 pb-10">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu" 
              disabled={isLoading}
              className={`w-full px-4 py-3 bg-slate-50 border-2 text-slate-900 rounded-xl focus:outline-none focus:ring-0 placeholder-slate-400 transition-colors ${
                errors.email ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-600 focus:bg-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {errors.email && <p className="text-xs text-red-600 mt-1.5 font-bold">{errors.email}</p>}
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" 
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-slate-50 border-2 text-slate-900 rounded-xl focus:outline-none focus:ring-0 pr-12 placeholder-slate-400 transition-colors ${
                  errors.password ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-600 focus:bg-white'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600 focus:outline-none text-sm font-bold transition-colors"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="mt-3 flex justify-end">
              <Link href="/forgot_password" className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                Forgot Password?
              </Link>
            </div>
            
            {errors.password && <p className="text-xs text-red-600 mt-1.5 font-bold">{errors.password}</p>}
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full text-white font-bold py-3.5 px-4 rounded-xl transition-all mt-4 flex justify-center items-center shadow-md ${
              isLoading ? 'bg-blue-400 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-[0.98]'
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

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs font-bold text-slate-500">
            Need an account? Please contact your university administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
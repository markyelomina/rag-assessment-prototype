'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastContext';

export default function AddUserPage() {
  const router = useRouter();
  const { addToast } = useToast();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Learner / Reviewer');
  const [cohort, setCohort] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (role === 'Learner / Reviewer' && !cohort) {
        throw new Error('Please select a cohort for the learner.');
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      addToast(`${name} was successfully registered as a ${role}.`, 'success');
      router.push('/admin/users');

    } catch (error: any) {
      setErrorMessage(error.message || 'An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto relative">
      <div className="flex items-center gap-3 mb-2">
        <button 
          onClick={() => router.push('/admin/users')} 
          disabled={isLoading}
          className="text-slate-500 hover:text-blue-600 font-bold text-sm flex items-center gap-1 disabled:opacity-50"
        >
          &larr; Back to Directory
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Add New User</h1>
        <p className="text-sm text-slate-500 mt-1 font-bold">Provide general information to manually register a user to the platform.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-800 font-bold">{errorMessage}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Dela Cruz" 
            required
            disabled={isLoading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" 
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="juan@university.edu" 
            required
            disabled={isLoading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" 
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Platform Role</label>
          <select 
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="Learner / Reviewer">Learner / Reviewer</option>
            <option value="Teacher / Faculty">Teacher / Faculty</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        {role === 'Learner / Reviewer' && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-sm font-bold text-slate-700 mb-2">Assign Cohort</label>
            <select 
              value={cohort}
              onChange={(e) => setCohort(e.target.value)}
              disabled={isLoading}
              className={`w-full px-4 py-3 border rounded-lg text-sm font-bold focus:outline-none focus:ring-1 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-500 ${
                errorMessage && !cohort ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
            >
              <option value="" disabled>Select a cohort...</option>
              <option value="Cohort Alpha 2026">Cohort Alpha 2026</option>
              <option value="Cohort Beta 2026">Cohort Beta 2026</option>
            </select>
            <p className="text-xs font-bold text-slate-500 mt-2">Learners must be assigned to a cohort to access specific exams.</p>
          </div>
        )}

        <div className="pt-6 flex justify-end gap-4 border-t border-slate-100">
          <button 
            type="button"
            onClick={() => router.push('/admin/users')}
            disabled={isLoading}
            className="px-6 py-3 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isLoading}
            className={`min-w-[140px] px-8 py-3 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${
              isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Add User'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
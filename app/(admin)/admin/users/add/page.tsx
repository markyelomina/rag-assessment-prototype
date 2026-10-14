'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastContext';
import { supabase } from '@/lib/supabaseClient';
import { createClient } from '@supabase/supabase-js';

interface DropdownCohort {
  id: string;
  name: string;
}

interface ParsedUser {
  name: string;
  email: string;
  role: string;
  cohortName: string;
  cohortId: string | null;
  isValid: boolean;
  errorMsg?: string;
}

export default function AddUserPage() {
  const router = useRouter();
  const { addToast } = useToast();
  
  // --- UI States ---
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  
  // --- Single User States ---
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Learner / Reviewer');
  const [cohort, setCohort] = useState('');
  
  // --- Batch Upload States ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // --- Cohort Data ---
  const [availableCohorts, setAvailableCohorts] = useState<DropdownCohort[]>([]);
  const [isFetchingCohorts, setIsFetchingCohorts] = useState(true);

  useEffect(() => {
    const fetchCohorts = async () => {
      const { data, error } = await supabase
        .from('Cohorts')
        .select('cohort_id, cohort_name')
        .eq('account_status', 'Active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching cohorts for dropdown:", error.message);
      } else if (data) {
        const formattedCohorts = data.map((c: any) => ({
          id: c.cohort_id,
          name: c.cohort_name
        }));
        setAvailableCohorts(formattedCohorts);
      }
      setIsFetchingCohorts(false);
    };

    fetchCohorts();
  }, []);

  const roleMap: Record<string, number> = {
    'Learner / Reviewer': 1,
    'Teacher / Faculty': 2,
    'Admin': 3
  };

  // ==========================================
  // SINGLE USER CREATION LOGIC
  // ==========================================
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingMessage(`Registering ${name}...`); 
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (role === 'Learner / Reviewer' && !cohort) {
        throw new Error('Please select a cohort for the learner.');
      }

      const roleId = roleMap[role];

      const tempAdminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false } }
      );

      const { data: authData, error: authError } = await tempAdminClient.auth.signUp({
        email: email,
        password: 'malayan@2026'  // Default password for new users
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: dbError } = await supabase
          .from('Users')
          .insert([
            {
              user_id: authData.user.id,
              name: name,
              email: email, 
              role_id: roleId,
              cohort_id: role === 'Learner / Reviewer' ? cohort : null, 
              account_status: 'Active'
            }
          ]);

        if (dbError) throw dbError;

        const { data: sessionData } = await supabase.auth.getUser();
        const activeAdminEmail = sessionData?.user?.email || 'Unknown Admin';

        await supabase.from('AuditLogs').insert([{
          user_email: activeAdminEmail,
          role: 'Admin',
          action: `Created new user account: ${email} as ${role}`,
          type: 'Security',
          severity: 'Warning', 
          ip_address: 'Internal',
          user_agent: navigator.userAgent
        }]);
      }
      
      addToast(`${name} was successfully registered as a ${role}.`, 'success');
      router.push('/admin/users');

    } catch (error: any) {
      console.error("User Creation Error:", error);
      setErrorMessage(error.message || 'An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  // ==========================================
  // BATCH CSV PROCESSING LOGIC
  // ==========================================
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result as string;
      const lines = csvText.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length <= 1) {
        setErrorMessage("The CSV file appears to be empty or missing data rows.");
        return;
      }

      // Expected Headers: Name, Email, Role, Cohort
      const dataRows = lines.slice(1);
      const parsed: ParsedUser[] = dataRows.map(row => {
        const [csvName, csvEmail, csvRole, csvCohort] = row.split(',').map(item => item.trim().replace(/^["']|["']$/g, ''));
        
        let isValid = true;
        let errorMsg = '';
        let matchedCohortId = null;

        if (!csvName || !csvEmail || !csvRole) {
          isValid = false;
          errorMsg = 'Missing required fields.';
        } else if (!roleMap[csvRole]) {
          isValid = false;
          errorMsg = `Invalid role: ${csvRole}`;
        } else if (csvRole === 'Learner / Reviewer') {
          const matchedCohort = availableCohorts.find(c => c.name.toLowerCase() === csvCohort?.toLowerCase());
          if (!matchedCohort) {
            isValid = false;
            errorMsg = `Cohort '${csvCohort}' not found.`;
          } else {
            matchedCohortId = matchedCohort.id;
          }
        }

        return {
          name: csvName,
          email: csvEmail,
          role: csvRole,
          cohortName: csvCohort || '',
          cohortId: matchedCohortId,
          isValid,
          errorMsg
        };
      });

      setParsedUsers(parsed);
      setErrorMessage('');
    };
    
    reader.readAsText(file);
  };

  const handleBatchSubmit = async () => {
    const validUsers = parsedUsers.filter(u => u.isValid);
    if (validUsers.length === 0) {
      setErrorMessage("No valid users found to import. Please check the preview table.");
      return;
    }

    setLoadingMessage('Processing batch import...');
    setIsBatchProcessing(true);
    setBatchProgress({ current: 0, total: validUsers.length, successes: 0, failures: 0 });

    const tempAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } }
    );

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validUsers.length; i++) {
      const user = validUsers[i];
      setBatchProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        const { data: authData, error: authError } = await tempAdminClient.auth.signUp({
          email: user.email,
          password: 'malayan@2026'
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: dbError } = await supabase.from('Users').insert([
            {
              user_id: authData.user.id,
              name: user.name,
              email: user.email, 
              role_id: roleMap[user.role],
              cohort_id: user.cohortId, 
              account_status: 'Active'
            }
          ]);

          if (dbError) throw dbError;
          successCount++;
        }
      } catch (err) {
        console.error(`Failed to import ${user.email}:`, err);
        failCount++;
      }

      // Small delay to prevent hitting Supabase rate limits (Too Many Requests)
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Log the bulk action once
    const { data: sessionData } = await supabase.auth.getUser();
    await supabase.from('AuditLogs').insert([{
      user_email: sessionData?.user?.email || 'Unknown Admin',
      role: 'Admin',
      action: `Executed batch import: ${successCount} users registered successfully, ${failCount} failed.`,
      type: 'Security',
      severity: failCount > 0 ? 'Warning' : 'Info', 
      ip_address: 'Internal',
      user_agent: navigator.userAgent
    }]);

    setBatchProgress(prev => ({ ...prev, successes: successCount, failures: failCount }));
    setIsBatchProcessing(false);
    
    if (failCount === 0) {
      addToast(`Batch import complete! ${successCount} users added.`, 'success');
      router.push('/admin/users');
    } else {
      addToast(`Import finished with ${failCount} errors. Check console for details.`, 'error');
    }
  };

  const generateCSVTemplate = () => {
    const headers = "Name,Email,Role,Cohort\n";
    const sampleData = "Juan Dela Cruz,juan@university.edu,Learner / Reviewer,Cohort 2026\nMaria Santos,maria.s@university.edu,Teacher / Faculty,\nAdmin User,admin@university.edu,Admin,";
    const blob = new Blob([headers + sampleData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'user_import_template.csv';
    link.click();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto relative pb-12">
      <div className="flex items-center gap-3 mb-2">
        <button 
          onClick={() => router.push('/admin/users')} 
          disabled={isLoading || isBatchProcessing}
          className="text-slate-500 hover:text-blue-600 font-bold text-sm flex items-center gap-1 disabled:opacity-50"
        >
          &larr; Back to Directory
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Register Users</h1>
        <p className="text-sm text-slate-500 mt-1 font-bold">Add users manually or import a CSV file to register multiple accounts simultaneously.</p>
      </div>

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('single')}
          disabled={isBatchProcessing}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors disabled:opacity-50 ${activeTab === 'single' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Single Entry
        </button>
        <button 
          onClick={() => setActiveTab('batch')}
          disabled={isBatchProcessing}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors disabled:opacity-50 ${activeTab === 'batch' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Batch Import (CSV)
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 animate-in fade-in duration-300">
          <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-800 font-bold">{errorMessage}</p>
        </div>
      )}

      {/* SINGLE TAB CONTENT */}
      {activeTab === 'single' && (
        <form onSubmit={handleSingleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6 animate-in fade-in duration-300 max-w-2xl">
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
                disabled={isLoading || isFetchingCohorts}
                className={`w-full px-4 py-3 border rounded-lg text-sm font-bold focus:outline-none focus:ring-1 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-500 border-slate-300 focus:border-blue-500 focus:ring-blue-500`}
                required
              >
                <option value="" disabled>
                  {isFetchingCohorts ? 'Loading cohorts...' : 'Select a cohort...'}
                </option>
                {availableCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs font-bold text-slate-500 mt-2">Learners must be assigned to a cohort to access specific exams.</p>
            </div>
          )}

          <div className="pt-6 flex justify-end gap-4 border-t border-slate-100">
            <button 
              type="submit"
              disabled={isLoading}
              className={`min-w-[140px] px-8 py-3 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${
                isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Saving...' : 'Add User'}
            </button>
          </div>
        </form>
      )}

      {/* BATCH TAB CONTENT */}
      {activeTab === 'batch' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6 animate-in fade-in duration-300">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 p-4 border border-slate-200 rounded-lg">
            <div>
              <h3 className="text-sm font-bold text-slate-800">CSV Template</h3>
              <p className="text-xs text-slate-500 font-bold mt-1">Ensure your headers exactly match: <span className="font-mono bg-slate-200 px-1 py-0.5 rounded text-slate-700">Name, Email, Role, Cohort</span></p>
            </div>
            <button 
              onClick={generateCSVTemplate}
              disabled={isBatchProcessing}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap"
            >
              Download Template
            </button>
          </div>

          <div 
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors relative ${parsedUsers.length > 0 ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${parsedUsers.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            {parsedUsers.length > 0 ? (
              <div>
                <h4 className="text-sm font-bold text-emerald-700 mb-1">File Loaded Successfully</h4>
                <p className="text-xs font-bold text-slate-600">{parsedUsers.length} records found. Review the data below before submitting.</p>
                <button 
                  onClick={() => { setParsedUsers([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  disabled={isBatchProcessing}
                  className="mt-4 text-xs font-bold text-red-600 hover:underline"
                >
                  Clear and upload a different file
                </button>
              </div>
            ) : (
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-1">Upload CSV File</h4>
                <p className="text-xs font-bold text-slate-500 mb-4">Drag and drop or click to browse.</p>
                <input 
                  type="file" 
                  accept=".csv"
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="px-5 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm relative z-20"
                >
                  Browse Files
                </button>
              </div>
            )}
          </div>

          {parsedUsers.length > 0 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-sm">Data Preview</h3>
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-600">
                  {parsedUsers.filter(u => u.isValid).length} Valid / {parsedUsers.filter(u => !u.isValid).length} Errors
                </span>
              </div>
              
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                    <tr className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                      <th className="p-3">Status</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Cohort</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedUsers.map((user, idx) => (
                      <tr key={idx} className={user.isValid ? 'bg-white' : 'bg-red-50/50'}>
                        <td className="p-3">
                          {user.isValid ? (
                            <span className="text-emerald-500 font-bold">✓ Ready</span>
                          ) : (
                            <span className="text-red-500 font-bold" title={user.errorMsg}>✗ Error</span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-800">{user.name}</td>
                        <td className="p-3 text-slate-600">{user.email}</td>
                        <td className="p-3 text-slate-600">{user.role}</td>
                        <td className="p-3 text-slate-600">
                          {user.cohortName || <span className="text-slate-400 italic">N/A</span>}
                          {!user.isValid && user.errorMsg && (
                            <span className="block text-[10px] text-red-600 mt-0.5">{user.errorMsg}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isBatchProcessing && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="flex justify-between text-xs font-bold text-blue-800 mb-2">
                    <span>Importing Accounts...</span>
                    <span>{batchProgress.current} / {batchProgress.total}</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}></div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end border-t border-slate-100">
                <button 
                  onClick={handleBatchSubmit}
                  disabled={isBatchProcessing || parsedUsers.filter(u => u.isValid).length === 0}
                  className={`px-8 py-3 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${
                    isBatchProcessing || parsedUsers.filter(u => u.isValid).length === 0 ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isBatchProcessing ? 'Processing Batch...' : `Import ${parsedUsers.filter(u => u.isValid).length} Valid Users`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <FullScreenLoader 
        isOpen={isLoading || isBatchProcessing} 
        message={loadingMessage} 
      />
    </div>
  );
}
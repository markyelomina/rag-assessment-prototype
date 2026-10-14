'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';

interface StudentMaterial {
  id: string; // Cohort_Materials ID
  material_id: string;
  title: string;
  file_name: string;
  file_path: string;
  subject: string;
}

const BLEPP_SUBJECTS = [
  'All',
  'Industrial-Organizational Psychology',
  'Abnormal Psychology',
  'Psychological Assessment',
  'Developmental Psychology'
];

export default function LearnerMaterialsPage() {
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [hasNoCohort, setHasNoCohort] = useState(false);
  const [materials, setMaterials] = useState<StudentMaterial[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');

  useEffect(() => {
    const fetchCohortMaterials = async () => {
      setIsLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Get student's enrolled cohort
      const { data: profile, error: profileErr } = await supabase
        .from('Users')
        .select('cohort_id, Cohorts(cohort_name)')
        .eq('user_id', user.id)
        .single();

      console.log('[DEBUG - Student Materials] User ID:', user.id);
      console.log('[DEBUG - Student Materials] Enrolled Cohort Profile:', profile);
      console.log('[DEBUG - Student Materials] Profile Error:', profileErr);

      if (profileErr || !profile?.cohort_id) {
        setHasNoCohort(true);
        setIsLoading(false);
        return;
      }

      setCohortName((profile.Cohorts as any)?.cohort_name || 'Enrolled Cohort');

      // 2. Fetch materials assigned to this cohort
      const { data: assigned, error: matErr } = await supabase
        .from('Cohort_Materials')
        .select(`
          id,
          material_id,
          created_at,
          "Material Requests" (
            id,
            title,
            file_name,
            file_path,
            file_size_mb,
            subject,
            tags,
            status
          )
        `)
        .eq('cohort_id', profile.cohort_id);

      console.log('[DEBUG - Student Materials] Assigned Query Result:', assigned);
      console.log('[DEBUG - Student Materials] Query Error (if any):', matErr);

      if (matErr) {
        console.error('Error fetching materials:', matErr);
        addToast('Failed to load review materials.', 'error');
        setIsLoading(false);
        return;
      }

      // 3. Format rows and retain approved materials
      const formatted: StudentMaterial[] = (assigned || [])
        .filter((row: any) => row['Material Requests']?.status === 'Approved & Indexed')
        .map((row: any) => {
          const m = row['Material Requests'];
          return {
            id: row.id,
            material_id: row.material_id,
            title: m.title || m.file_name || 'Untitled Document',
            file_name: m.file_name || 'document.pdf',
            file_path: m.file_path,
            subject: m.subject || (m.tags && m.tags[0]) || 'General Reference',
          };
        });

      setMaterials(formatted);
      setIsLoading(false);
    };

    fetchCohortMaterials();
  }, [addToast]);

  // Self-Healing URL Resolver
  const getValidSignedUrl = async (path: string, forDownload: boolean = false, fileName?: string) => {
    if (!path) throw new Error('Document path is missing.');

    const options = forDownload ? { download: fileName || true } : undefined;
    let { data, error } = await supabase.storage.from('textbooks').createSignedUrl(path, 120, options);

    // Swap fallback between indexed/ and pending/
    if (error || !data?.signedUrl) {
      const alternatePath = path.startsWith('indexed/')
        ? path.replace('indexed/', 'pending/')
        : path.replace('pending/', 'indexed/');

      const retry = await supabase.storage.from('textbooks').createSignedUrl(alternatePath, 120, options);
      if (retry.data?.signedUrl) {
        data = retry.data;
        error = null;
      }
    }

    if (error || !data?.signedUrl) {
      throw new Error('Unable to generate secure file link. It may have been archived.');
    }

    return data.signedUrl;
  };

  // Action: Read (Open preview in new tab)
  const handleOpenFile = async (path: string) => {
    try {
      const url = await getValidSignedUrl(path, false);
      window.open(url, '_blank');
    } catch (err: any) {
      addToast(err.message || 'Error opening secure document.', 'error');
    }
  };

  // Action: Download (Direct file download trigger)
  const handleDownloadFile = async (path: string, fileName: string) => {
    try {
      const url = await getValidSignedUrl(path, true, fileName);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err: any) {
      addToast(err.message || 'Error downloading secure document.', 'error');
    }
  };

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesSearch =
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.subject.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSubject = selectedSubject === 'All' || m.subject === selectedSubject;

      return matchesSearch && matchesSubject;
    });
  }, [materials, searchQuery, selectedSubject]);

  if (hasNoCohort) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Review Materials</h1>
          <p className="text-sm text-slate-500 font-bold mt-1">Textbooks and outlines for your licensure preparation.</p>
        </div>

        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">No Cohort Enrollment Found</h3>
          <p className="text-sm text-slate-500 font-bold max-w-md mx-auto">
            You are not currently enrolled in an active review cohort. Please contact your instructor to be added to a cohort roster.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Review Materials</h1>
            {cohortName && (
              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
                {cohortName}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 font-bold mt-1">
            Access assigned textbooks and review outlines provided by your instructors.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search textbook name or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="sm:w-64">
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-blue-500"
          >
            {BLEPP_SUBJECTS.map((subj) => (
              <option key={subj} value={subj}>
                {subj === 'All' ? 'All BLEPP Subjects' : subj}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Materials List Table */}
      {isLoading ? (
        <FullScreenLoader isOpen={isLoading} message="Loading your assigned review files..." />
      ) : filteredMaterials.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-bold">
            {materials.length === 0 
              ? 'No review materials have been assigned to your cohort yet.' 
              : 'No documents match your current filter or search criteria.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                    File Name
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-72 whitespace-nowrap">
                    BLEPP Subject
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right w-28 whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMaterials.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    {/* File Name: flexible width, clamped to 2 lines max, with hover tooltip */}
                    <td className="p-4 pr-6">
                      <p 
                        className="font-bold text-slate-800 line-clamp-2 leading-relaxed" 
                        title={file.title}
                      >
                        {file.title}
                      </p>
                    </td>

                    {/* Subject: fixed width, never wraps or squishes */}
                    <td className="p-4 w-72 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-xs font-bold">
                        {file.subject}
                      </span>
                    </td>

                    {/* Actions: fixed width with Open Book icon */}
                    <td className="p-4 text-right w-28 whitespace-nowrap">
                      <div className="flex justify-end items-center gap-2">
                        {/* Open Book Icon (Read / View Document) */}
                        <button
                          onClick={() => handleOpenFile(file.file_path)}
                          className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-blue-50"
                          title="Read Document"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" 
                            />
                          </svg>
                        </button>

                        {/* Download Icon (Save to disk) */}
                        <button
                          onClick={() => handleDownloadFile(file.file_path, file.file_name)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors p-1.5 rounded-lg hover:bg-emerald-50"
                          title="Download Document"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
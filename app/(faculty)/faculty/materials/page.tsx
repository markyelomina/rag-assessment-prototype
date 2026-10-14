'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/components/ui/ToastContext';

const BLEPP_SUBJECTS = [
  'Industrial-Organizational Psychology',
  'Abnormal Psychology',
  'Psychological Assessment',
  'Developmental Psychology'
];

export default function FacultyMaterialsPage() {
  // Security Hook
  const { uploadDocs, isLoading: isPermissionsLoading } = usePermissions();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'action' | 'active' | 'archive'>('action');
  
  const [isNavigating, setIsNavigating] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading materials...');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSubject, setSelectedSubject] = useState(BLEPP_SUBJECTS[0]);
  const [isUploading, setIsUploading] = useState(false);

  // Destructive Cancellation States
  const [cancelModal, setCancelModal] = useState<{ id: string, path: string, title: string } | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Edit Subject Modal
  const [editSubjectModal, setEditSubjectModal] = useState<{ id: string, currentSubject: string } | null>(null);
  const [editSubjectChoice, setEditSubjectChoice] = useState(BLEPP_SUBJECTS[0]);
  const [viewDetailsModal, setViewDetailsModal] = useState<any | null>(null);

  // 5-second countdown timer effect for destructive cancellation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cancelModal && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [cancelModal, countdown]);

  // Restore tab from localStorage on mount
  useEffect(() => {
    const savedTab = localStorage.getItem('facultyRagTab') as 'action' | 'active' | 'archive';
    if (savedTab) setActiveTab(savedTab);
  }, []);

  const handleTabChange = (tab: 'action' | 'active' | 'archive') => {
    setActiveTab(tab);
    localStorage.setItem('facultyRagTab', tab);
  };

  const fetchRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsNavigating(false);
      return;
    }

    const { data, error } = await supabase
      .from('Material Requests')
      .select('*')
      .eq('faculty_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) setMaterials(data);
    
    setIsNavigating(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const actionRequiredFiles = materials.filter(m => m.status === 'Pending Admin Approval');
  const activeFiles = materials.filter(m => m.status === 'Approved & Indexed' || m.status === 'Processing');
  const archivedFiles = materials.filter(m => ['Archived', 'Rejected', 'Deleted by Admin', 'File Purged'].includes(m.status));

  const getVisibleFiles = () => {
    if (activeTab === 'action') return actionRequiredFiles;
    if (activeTab === 'active') return activeFiles;
    return archivedFiles;
  };

  const executeEditSubject = async () => {
  if (!editSubjectModal) return;

  const { error } = await supabase
      .from('Material Requests')
      .update({ 
        subject: editSubjectChoice,
        tags: [editSubjectChoice]
      })
      .eq('id', editSubjectModal.id);

    if (error) {
      addToast(error.message || 'Failed to update subject.', 'error');
    } else {
      addToast('Target subject updated successfully.', 'success');
      fetchRequests();
      setEditSubjectModal(null);
    }
  };

  // Preview file directly in browser via signed URL
  const handleReview = async (path: string) => {
    if (!path) {
      addToast('No storage path found for this document.', 'error');
      return;
    }

    try {
      // 1. Try primary path from database
      let { data, error } = await supabase.storage.from('textbooks').createSignedUrl(path, 60);

      // 2. Self-Healing Fallback: Check between pending/ and indexed/
      if (error || !data?.signedUrl) {
        let alternatePath = '';
        if (path.startsWith('pending/')) {
          alternatePath = path.replace('pending/', 'indexed/');
        } else if (path.startsWith('indexed/')) {
          alternatePath = path.replace('indexed/', 'pending/');
        }

        if (alternatePath) {
          const retry = await supabase.storage.from('textbooks').createSignedUrl(alternatePath, 60);
          if (retry.data?.signedUrl) {
            data = retry.data;
            error = null;
          }
        }
      }

      if (error || !data?.signedUrl) {
        addToast('Could not load file. It may have been deleted or purged from storage.', 'error');
        return;
      }

      window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      addToast(err.message || 'Error generating secure document link.', 'error');
    }
  };

  const executeCancelRequest = async () => {
    if (!cancelModal || countdown > 0) return;
    
    setLoadingMessage('Purging file and canceling request...');
    setIsUploading(true);

    await supabase.storage.from('textbooks').remove([cancelModal.path]);
    await supabase.from('Material Requests').delete().eq('id', cancelModal.id);
    
    await fetchRequests();
    setIsUploading(false);
    setCancelModal(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadDocs) return;
    
    setLoadingMessage('Uploading file to system...');
    setIsUploading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `pending/${Date.now()}_${safeName}`;
    
    const { error: uploadError } = await supabase.storage.from('textbooks').upload(filePath, selectedFile);

    if (uploadError) {
      console.error("Upload failed", uploadError);
      setIsUploading(false);
      return;
    }

    const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);

    await supabase.from('Material Requests').insert({
      faculty_id: user?.id,
      title: selectedFile.name,
      file_name: selectedFile.name,
      file_path: filePath,
      file_size_mb: fileSizeMB,
      subject: selectedSubject,
      tags: [selectedSubject],
      status: 'Pending Admin Approval'
    });

    if (user) {
      const { data: userData } = await supabase
        .from('Users')
        .select(`
          email,
          Roles ( role_name )
        `)
        .eq('user_id', user.id)
        .single();

      const userEmail = userData?.email || user.email || 'System';
      
      let roleName = 'Teacher';
      if (userData?.Roles) {
        if (Array.isArray(userData.Roles) && userData.Roles.length > 0) {
          roleName = (userData.Roles[0] as any).role_name || 'Teacher';
        } else if (!Array.isArray(userData.Roles)) {
          roleName = (userData.Roles as any).role_name || 'Teacher';
        }
      }

      await supabase.from('AuditLogs').insert([
        {
          user_email: userEmail,
          role: roleName,
          action: `Requested RAG material upload: "${selectedFile.name}" (${fileSizeMB} MB) under [${selectedSubject}]`,
          type: 'Document Uploads',
          severity: 'Info',
          ip_address: 'Internal',
          user_agent: navigator.userAgent
        }
      ]);
    }

    fetchRequests(); 
    setIsUploading(false);
    setShowUploadModal(false);
    setSelectedFile(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) setSelectedFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-6 relative pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reference Materials Request</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Request syllabus, reading materials, and rubrics to be added to the AI knowledge base.</p>
        </div>
        
        {!isPermissionsLoading && uploadDocs && (
          <button onClick={() => setShowUploadModal(true)} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
            Request File Upload
          </button>
        )}
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button onClick={() => handleTabChange('action')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'action' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Action Needed ({actionRequiredFiles.length})
        </button>
        <button onClick={() => handleTabChange('active')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'active' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          My Active Files ({activeFiles.length})
        </button>
        <button onClick={() => handleTabChange('archive')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'archive' ? 'border-slate-500 text-slate-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Archive ({archivedFiles.length})
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">File Name & Details</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">BLEPP Subject</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date Requested</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {getVisibleFiles().length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">No records found for this view.</td></tr>
              ) : (
                getVisibleFiles().map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <p className={`font-bold ${file.status === 'File Purged' || file.status === 'Archived' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{file.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider">{file.file_name.split('.').pop()?.toUpperCase()}</span>
                        <span className="text-xs font-bold text-slate-500">{file.file_size_mb} MB</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-xs font-bold whitespace-nowrap">
                        {file.subject || (file.tags && file.tags[0]) || 'General Reference'}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 font-bold">{new Date(file.created_at).toLocaleDateString()}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-default ${
                        file.status === 'Approved & Indexed' ? 'bg-emerald-100 text-emerald-800' : 
                        file.status === 'Pending Admin Approval' ? 'bg-amber-100 text-amber-800' : 
                        file.status === 'Archived' ? 'bg-purple-100 text-purple-800' : 
                        file.status === 'File Purged' ? 'bg-slate-200 text-slate-500' : 
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {file.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-2">
                        {/* EYE ICON: View File (Action Needed and Active Files only) */}
                        {(file.status === 'Pending Admin Approval' || file.status === 'Approved & Indexed' || file.status === 'Processing') && (
                          <button
                            onClick={() => handleReview(file.file_path)}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                            title="View Document"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}

                        {/* NOTEBOOK ICON: View Details (Always available) */}
                        <button
                          onClick={() => setViewDetailsModal(file)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                          title="View Details"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </button>

                        {/* Pending Controls: Edit Subject & Cancel Request */}
                        {file.status === 'Pending Admin Approval' && (
                          <>
                            <div className="w-px h-4 bg-slate-200 mx-1"></div>
                            {/* PENCIL ICON: Edit Subject */}
                            <button 
                              onClick={() => {
                                setEditSubjectModal({ id: file.id, currentSubject: file.subject || BLEPP_SUBJECTS[0] });
                                setEditSubjectChoice(file.subject || BLEPP_SUBJECTS[0]);
                              }} 
                              className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                              title="Edit Subject"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>

                            {/* RED "X" ICON: Cancel Request */}
                            <button 
                              onClick={() => {
                                setCancelModal({ id: file.id, path: file.file_path, title: file.title });
                                setCountdown(5);
                              }} 
                              className="text-red-500 hover:text-red-700 transition-colors p-1"
                              title="Cancel Request"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && uploadDocs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">Request New File Upload</h3>
              <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); }} className="text-slate-400 hover:text-slate-700 transition-colors" disabled={isUploading}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors relative ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                >
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  {selectedFile ? (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-emerald-600 mb-1">File Attached!</h4>
                      <p className="text-xs font-bold text-slate-600">{selectedFile.name}</p>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">Drag and drop your file here</h4>
                      <p className="text-xs font-bold text-slate-500 mb-4">Supports PDF, PPTX, and DOCX up to 50MB</p>
                    </>
                  )}
                  <div className="flex items-center justify-center">
                    <span className="px-2 bg-slate-50 text-xs font-bold text-slate-400 uppercase relative z-10">Or</span>
                    <div className="absolute left-10 right-10 top-auto h-px bg-slate-200"></div>
                  </div>
                  <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 px-5 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm relative z-20">Browse Files</button>
                </div>

                {/* Target BLEPP Subject */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Target BLEPP Subject
                  </label>
                  <select 
                    value={selectedSubject} 
                    onChange={(e) => setSelectedSubject(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 bg-white" 
                    disabled={isUploading}
                  >
                    {BLEPP_SUBJECTS.map((subj) => (
                      <option key={subj} value={subj}>{subj}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => { setShowUploadModal(false); setSelectedFile(null); }} disabled={isUploading} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isUploading || !selectedFile} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">{isUploading ? 'Uploading...' : 'Submit for Approval'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subject Modal */}
      {editSubjectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Target Subject</h3>
            <select
              value={editSubjectChoice}
              onChange={(e) => setEditSubjectChoice(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 bg-white mb-6"
            >
              {BLEPP_SUBJECTS.map((subj) => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditSubjectModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Cancel</button>
              <button onClick={executeEditSubject} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors">Save Subject</button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive Cancel & File Deletion Modal with 5s Timer */}
      {cancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-slate-800 mb-2">Cancel Request & Delete File?</h3>
            <p className="text-sm text-slate-600 font-bold mb-4">
              Are you sure you want to cancel the request for <span className="text-slate-900 font-extrabold">{cancelModal.title}</span>?
            </p>
            <p className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-lg p-3 mb-6 text-left">
              This action permanently purges the uploaded document from storage and discards the pending administrative request. It cannot be recovered.
            </p>

            <div className="flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setCancelModal(null)} 
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
              >
                Keep Request
              </button>
              <button 
                type="button"
                onClick={executeCancelRequest} 
                disabled={countdown > 0}
                className="min-w-[170px] px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
              >
                {countdown > 0 ? `Confirm in ${countdown}s` : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-lg font-bold text-slate-800">Document Details</h3>
              <button onClick={() => setViewDetailsModal(null)} className="text-slate-400 hover:text-slate-700"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="space-y-4">
              <div><span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">File Name</span><p className="text-sm font-bold text-slate-800">{viewDetailsModal.title}</p></div>
              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">BLEPP Subject</span>
                <span className="inline-block mt-1 px-2.5 py-1 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {viewDetailsModal.subject || (viewDetailsModal.tags && viewDetailsModal.tags[0]) || 'General Reference'}
                </span>
              </div>
              {(viewDetailsModal.status === 'Rejected' || viewDetailsModal.status === 'Deleted by Admin' || viewDetailsModal.status === 'File Purged' || viewDetailsModal.status === 'Archived') && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg mt-4">
                  <span className="block text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Status Note / Reason</span>
                  <p className="text-sm font-bold text-red-800">{viewDetailsModal.reject_reason || 'Archived by administrator.'}</p>
                </div>
              )}
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setViewDetailsModal(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
      
      <FullScreenLoader 
        isOpen={isNavigating || isUploading} 
        message={loadingMessage} 
      />
    </div>
  );
}
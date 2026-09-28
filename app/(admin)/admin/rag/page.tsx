'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useIngestion } from '@/hooks/useIngestion'; 

export default function AdminRagPage() {
  const [activeTab, setActiveTab] = useState<'action' | 'active' | 'archive'>('action');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewDetailsModal, setViewDetailsModal] = useState<any | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string, path: string, status: string } | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  // Restore tab from localStorage on mount
  useEffect(() => {
    const savedTab = localStorage.getItem('adminRagTab') as 'action' | 'active' | 'archive';
    if (savedTab) setActiveTab(savedTab);
  }, []);

  const handleTabChange = (tab: 'action' | 'active' | 'archive') => {
    setActiveTab(tab);
    localStorage.setItem('adminRagTab', tab);
  };

  const fetchRequests = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('Material Requests')
      .select('*, faculty:Users(name, email)')
      .order('created_at', { ascending: false });

    if (!error && data) setRequests(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const { startIngestion, status: ingestionStatus, progressDetails } = useIngestion({
    onSuccess: () => fetchRequests()
  });

  const actionRequired = requests.filter(r => r.status === 'Pending Admin Approval');
  const activeFiles = requests.filter(r => r.status === 'Approved & Indexed' || r.status === 'Processing');
  const archivedFiles = requests.filter(r => ['Rejected', 'Deleted by Admin', 'File Purged'].includes(r.status));

  const getVisibleFiles = () => {
    if (activeTab === 'action') return actionRequired;
    if (activeTab === 'active') return activeFiles;
    return archivedFiles;
  };

  // Safe Signed URL generator for Review Button
  const handleReview = async (path: string) => {
    const { data, error } = await supabase.storage.from('textbooks').createSignedUrl(path, 60);
    if (error || !data) {
      alert("Could not load file. It may have been deleted, or the bucket is incorrectly configured.");
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleApproveAndProcess = async (requestId: string, filePath: string, tags: string[]) => {
    await supabase.from('Material Requests').update({ status: 'Processing' }).eq('id', requestId);
    fetchRequests(); 
    await startIngestion(requestId, filePath, tags);
  };

  const executeReject = async () => {
    if (!rejectModal) return;
    await supabase.from('Material Requests').update({ 
      status: 'Rejected',
      reject_reason: rejectReason || 'File did not meet formatting requirements.'
    }).eq('id', rejectModal);
    
    fetchRequests();
    setRejectModal(null);
    setRejectReason('');
  };

  const executeAdminDelete = async () => {
    if (!deleteModal) return;

    // 1. Delete physical file from Supabase storage bucket
    await supabase.storage.from('textbooks').remove([deleteModal.path]);

    // 2. Database Update Logic
    if (deleteModal.status === 'Approved & Indexed' || deleteModal.status === 'Processing') {
      // Move to archive so faculty can read the reason
      await supabase.from('Material Requests').update({ 
        status: 'Deleted by Admin',
        reject_reason: 'Removed from active knowledge base by an administrator.'
      }).eq('id', deleteModal.id);

      // Ping local FastAPI to delete vectors
      try {
        await fetch(`${API_BASE_URL}/api/v1/vectors`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: deleteModal.path })
        });
      } catch (e) {
        console.error("FastAPI vector deletion failed:", e);
      }
    } else {
      // If already in the archive (Rejected or Deleted by Admin), update to Purged status
      await supabase.from('Material Requests').update({ 
        status: 'File Purged',
        reject_reason: 'Physical file permanently deleted from storage to free up space. Record retained for auditing.'
      }).eq('id', deleteModal.id);
    }

    fetchRequests();
    setDeleteModal(null);
  };

  const submitDirectAdminUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const filePath = `pending/admin_${Date.now()}_${safeName}`;
      const defaultTags = ['Global Knowledge Base'];
      
      const { error: uploadError } = await supabase.storage.from('textbooks').upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
      const { data: insertData, error: insertError } = await supabase.from('Material Requests').insert({
        faculty_id: user?.id,
        title: selectedFile.name,
        file_name: selectedFile.name,
        file_path: filePath,
        file_size_mb: fileSizeMB,
        tags: defaultTags,
        status: 'Processing'
      }).select().single();

      if (insertError) throw insertError;

      fetchRequests();
      setShowUploadModal(false);
      setSelectedFile(null);
      await startIngestion(insertData.id, filePath, defaultTags);

    } catch (error) {
      setUploadError('Failed to upload the document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="mb-2 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Knowledge Base Administration</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Review faculty material requests and monitor document vectorization status.</p>
        </div>
        <button onClick={() => { setShowUploadModal(true); setSelectedFile(null); setUploadError(''); }} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
          Direct Admin Upload
        </button>
      </div>

      <div className="flex gap-4 border-b border-slate-200 mb-6">
        <button onClick={() => handleTabChange('action')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'action' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Action Required ({actionRequired.length})
        </button>
        <button onClick={() => handleTabChange('active')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'active' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Active Knowledge Base
        </button>
        <button onClick={() => handleTabChange('archive')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'archive' ? 'border-slate-500 text-slate-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Archive
        </button>
      </div>

      {ingestionStatus === 'PROCESSING' && progressDetails && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between mb-6 shadow-sm animate-in fade-in">
          <div>
            <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              {progressDetails.step || 'Processing Document'}
            </h4>
            <p className="text-xs text-blue-600 mt-1">{progressDetails.details || progressDetails.message}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Filename and Size</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Requested By</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tags / Scope</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Pipeline Status</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Loading requests...</td></tr>
              ) : getVisibleFiles().length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">No records found for this view.</td></tr>
              ) : (
                getVisibleFiles().map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <p className={`font-bold ${file.status === 'File Purged' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{file.title}</p>
                      <p className="text-xs font-bold text-slate-500">{file.file_size_mb} MB • {new Date(file.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-700">{file.faculty?.name || 'Unknown User'}</p>
                      <p className="text-xs text-slate-500">{file.faculty?.email}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {(file.tags || []).map((tag: string, idx: number) => (
                          <span key={idx} className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${file.status === 'File Purged' ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        file.status === 'Approved & Indexed' ? 'bg-emerald-100 text-emerald-800' : 
                        file.status === 'Pending Admin Approval' ? 'bg-amber-100 text-amber-800' :
                        file.status === 'File Purged' ? 'bg-slate-200 text-slate-500' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {file.status === 'Processing' && <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></span>}
                        {file.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-4">
                        {file.status === 'Pending Admin Approval' ? (
                          <>
                            <button onClick={() => handleReview(file.file_path)} className="text-blue-500 hover:text-blue-700 transition-colors" title="Review Document">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </button>
                            <button onClick={() => handleApproveAndProcess(file.id, file.file_path, file.tags)} className="text-emerald-500 hover:text-emerald-700 transition-colors" title="Approve & Process">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button onClick={() => setRejectModal(file.id)} className="text-red-500 hover:text-red-700 transition-colors" title="Reject">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setViewDetailsModal(file)} className="text-xs font-bold text-blue-600 hover:underline">View Details</button>
                        )}
                        {(file.status !== 'Pending Admin Approval' && file.status !== 'File Purged') && (
                          <>
                            <div className="w-px h-4 bg-slate-200 mx-1"></div>
                            <button onClick={() => setDeleteModal({ id: file.id, path: file.file_path, status: file.status })} className="text-slate-400 hover:text-red-600 transition-colors" title={file.status === 'Rejected' || file.status === 'Deleted by Admin' ? "Purge Storage File" : "Soft Delete & Drop Vectors"}>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

      {/* Direct Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">Direct Admin Upload</h3>
              <button onClick={() => !isUploading && setShowUploadModal(false)} disabled={isUploading} className="text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={submitDirectAdminUpload}>
              <div className="space-y-5">
                {uploadError && (<div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 font-bold flex items-center gap-2">{uploadError}</div>)}
                <div 
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors relative ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) setSelectedFile(e.dataTransfer.files[0]); }}
                >
                  <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg></div>
                  {selectedFile ? (
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">{selectedFile.name}</h4>
                      <p className="text-xs font-bold text-slate-500 mb-4">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ready for upload</p>
                      <button type="button" onClick={() => setSelectedFile(null)} disabled={isUploading} className="text-xs font-bold text-red-500 hover:underline relative z-20 disabled:opacity-50">Remove file</button>
                    </div>
                  ) : (
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">Drag and drop your document</h4>
                      <p className="text-xs font-bold text-slate-500 mb-4">Upload global materials directly to the AI pending queue</p>
                      <div className="flex items-center justify-center"><span className="px-2 bg-slate-50 text-xs font-bold text-slate-400 uppercase relative z-10">Or</span><div className="absolute left-10 right-10 top-auto h-px bg-slate-200"></div></div>
                      <label className="mt-4 px-5 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm relative z-20 cursor-pointer inline-block">Browse Files<input type="file" className="hidden" accept=".pdf,.pptx,.docx" onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }} /></label>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => !isUploading && setShowUploadModal(false)} disabled={isUploading} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isUploading || !selectedFile} className={`min-w-[170px] px-5 py-2.5 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${isUploading || !selectedFile ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>{isUploading ? 'Uploading...' : 'Upload and Embed'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Reject Request</h3>
            <p className="text-sm text-slate-600 font-bold mb-4">Please provide a reason for rejecting this material request.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. File contains corrupted text formatting." className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 mb-6 min-h-[100px] resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Cancel</button>
              <button onClick={executeReject} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors">Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Delete Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Purge File?</h3>
            <p className="text-sm text-slate-600 font-bold mb-6">
              {deleteModal.status === 'Approved & Indexed' || deleteModal.status === 'Processing' 
                ? "This will remove the physical file, drop its vectors from the AI, and notify the faculty of the deletion." 
                : "This will permanently delete the physical file from storage to free up space. The request record will remain in the archive for auditing."}
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Cancel</button>
              <button onClick={executeAdminDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors">
                {deleteModal.status === 'Approved & Indexed' || deleteModal.status === 'Processing' ? 'Soft Delete & Drop Vectors' : 'Purge File from Storage'}
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
              <div><span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Requested By</span><p className="text-sm font-bold text-slate-800">{viewDetailsModal.faculty?.name || 'Admin Upload'} ({viewDetailsModal.faculty?.email || 'N/A'})</p></div>
              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tags</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(viewDetailsModal.tags || []).map((tag: string, idx: number) => (
                    <span key={idx} className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${viewDetailsModal.status === 'File Purged' ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{tag}</span>
                  ))}
                </div>
              </div>
              {(viewDetailsModal.status === 'Rejected' || viewDetailsModal.status === 'Deleted by Admin' || viewDetailsModal.status === 'File Purged') && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg mt-4">
                  <span className="block text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Rejection/Deletion Reason</span>
                  <p className="text-sm font-bold text-red-800">{viewDetailsModal.reject_reason}</p>
                </div>
              )}
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setViewDetailsModal(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
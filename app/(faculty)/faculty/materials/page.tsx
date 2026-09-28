'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function FacultyMaterialsPage() {
  const [activeTab, setActiveTab] = useState<'action' | 'active' | 'archive'>('action');
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [cancelModal, setCancelModal] = useState<{ id: string, path: string } | null>(null);
  const [editTagsModal, setEditTagsModal] = useState<{ id: string, tagsStr: string } | null>(null);
  const [viewDetailsModal, setViewDetailsModal] = useState<any | null>(null);

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
    if (!user) return;

    const { data, error } = await supabase
      .from('Material Requests')
      .select('*')
      .eq('faculty_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) setMaterials(data);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const actionRequiredFiles = materials.filter(m => m.status === 'Pending Admin Approval');
  const activeFiles = materials.filter(m => m.status === 'Approved & Indexed' || m.status === 'Processing');
  const archivedFiles = materials.filter(m => ['Rejected', 'Deleted by Admin', 'File Purged'].includes(m.status));

  const getVisibleFiles = () => {
    if (activeTab === 'action') return actionRequiredFiles;
    if (activeTab === 'active') return activeFiles;
    return archivedFiles;
  };

  const executeEditTags = async () => {
    if (!editTagsModal) return;
    const updatedTags = editTagsModal.tagsStr.split(',').map(tag => tag.trim()).filter(Boolean);
    
    await supabase.from('Material Requests').update({ tags: updatedTags }).eq('id', editTagsModal.id);
    fetchRequests();
    setEditTagsModal(null);
  };

  const executeCancelRequest = async () => {
    if (!cancelModal) return;
    await supabase.storage.from('textbooks').remove([cancelModal.path]);
    await supabase.from('Material Requests').delete().eq('id', cancelModal.id);
    fetchRequests();
    setCancelModal(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
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
    const tagsArray = tagsInput.split(',').map(tag => tag.trim()).filter(Boolean);

    await supabase.from('Material Requests').insert({
      faculty_id: user?.id,
      title: selectedFile.name,
      file_name: selectedFile.name,
      file_path: filePath,
      file_size_mb: fileSizeMB,
      tags: tagsArray,
      status: 'Pending Admin Approval'
    });

    fetchRequests(); 
    setIsUploading(false);
    setShowUploadModal(false);
    setSelectedFile(null);
    setTagsInput('');
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
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reference Materials Request</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Request syllabus, reading materials, and rubrics to be added to the AI knowledge base.</p>
        </div>
        <button onClick={() => setShowUploadModal(true)} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
          Request File Upload
        </button>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button onClick={() => handleTabChange('action')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'action' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Action Needed ({actionRequiredFiles.length})
        </button>
        <button onClick={() => handleTabChange('active')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'active' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          My Active Files
        </button>
        <button onClick={() => handleTabChange('archive')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'archive' ? 'border-slate-500 text-slate-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Archive
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">File Name & Details</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tags / Scope</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date Requested</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {getVisibleFiles().length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">No records found for this view.</td></tr>
              ) : (
                getVisibleFiles().map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <p className={`font-bold ${file.status === 'File Purged' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{file.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider">{file.file_name.split('.').pop()?.toUpperCase()}</span>
                        <span className="text-xs font-bold text-slate-500">{file.file_size_mb} MB</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {(file.tags || []).map((tag: string, idx: number) => (
                          <span key={idx} className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${file.status === 'File Purged' ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-slate-500 font-bold">{new Date(file.created_at).toLocaleDateString()}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-default ${
                        file.status === 'Approved & Indexed' ? 'bg-emerald-100 text-emerald-800' : 
                        file.status === 'Pending Admin Approval' ? 'bg-amber-100 text-amber-800' : 
                        file.status === 'File Purged' ? 'bg-slate-200 text-slate-500' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {file.status}
                      </span>
                    </td>
                    <td className="p-4 flex justify-end gap-4 mt-2">
                      {file.status === 'Pending Admin Approval' ? (
                        <>
                          <button onClick={() => setEditTagsModal({ id: file.id, tagsStr: (file.tags || []).join(', ') })} className="text-slate-600 hover:text-blue-600 font-bold text-xs">Edit Tags</button>
                          <button onClick={() => setCancelModal({ id: file.id, path: file.file_path })} className="text-red-500 hover:underline font-bold text-xs">Cancel Request</button>
                        </>
                      ) : (
                        <button onClick={() => setViewDetailsModal(file)} className="text-blue-600 hover:underline font-bold text-xs">View Details</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
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
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors relative ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                >
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-4">
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
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Apply Tags / Scope</label>
                  <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. PSY301, Midterms, General" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" disabled={isUploading} />
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

      {/* Edit Tags Modal */}
      {editTagsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Tags</h3>
            <input type="text" value={editTagsModal.tagsStr} onChange={(e) => setEditTagsModal({ ...editTagsModal, tagsStr: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditTagsModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Cancel</button>
              <button onClick={executeEditTags} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors">Save Tags</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Cancel Request?</h3>
            <p className="text-sm text-slate-600 font-bold mb-6">Are you sure you want to cancel this request and delete the uploaded file? This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setCancelModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Keep Request</button>
              <button onClick={executeCancelRequest} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors">Confirm Deletion</button>
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
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tags</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(viewDetailsModal.tags || []).map((tag: string, idx: number) => (
                    <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">{tag}</span>
                  ))}
                </div>
              </div>
              {(viewDetailsModal.status === 'Rejected' || viewDetailsModal.status === 'Deleted by Admin' || viewDetailsModal.status === 'File Purged') && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg mt-4">
                  <span className="block text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Admin Note / Rejection Reason</span>
                  <p className="text-sm font-bold text-red-800">{viewDetailsModal.reject_reason || 'No specific reason provided.'}</p>
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
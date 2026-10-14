'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useIngestion } from '@/hooks/useIngestion'; 
import { useToast } from '@/components/ui/ToastContext';

interface DomainSetting {
  id: string;
  subject: string;
  setting_name: string;
  created_at: string;
}

const BLEPP_SUBJECTS = [
  'Industrial-Organizational Psychology',
  'Abnormal Psychology',
  'Psychological Assessment',
  'Developmental Psychology'
];

export default function AdminRagPage() {
  // Top-level Navigation Switcher
  const [currentSection, setCurrentSection] = useState<'documents' | 'settings'>('documents');
  const { addToast } = useToast();

  // Document Management States
  const [activeTab, setActiveTab] = useState<'action' | 'active' | 'archive'>('action');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [adminUploadSubject, setAdminUploadSubject] = useState(BLEPP_SUBJECTS[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading knowledge base...');

  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewDetailsModal, setViewDetailsModal] = useState<any | null>(null);
  
  // Destructive Document Archive Modal + 5s Timer
  const [deleteModal, setDeleteModal] = useState<{ id: string, title: string, path: string, status: string } | null>(null);
  const [archiveCountdown, setArchiveCountdown] = useState(5);

  // Domain Settings States
  const [domainSettings, setDomainSettings] = useState<DomainSetting[]>([]);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('All');
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [showAddSettingModal, setShowAddSettingModal] = useState(false);
  const [newSettingSubject, setNewSettingSubject] = useState(BLEPP_SUBJECTS[0]);
  const [newSettingName, setNewSettingName] = useState('');
  const [isSubmittingSetting, setIsSubmittingSetting] = useState(false);
  const [settingActionError, setSettingActionError] = useState('');

  // Destructive Domain Setting Delete Modal + 5s Timer
  const [deleteSettingModal, setDeleteSettingModal] = useState<DomainSetting | null>(null);
  const [settingDeleteCountdown, setSettingDeleteCountdown] = useState(5);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  // Centralized Audit Logging
  const logAuditAction = async (actionDesc: string, type: string = 'Document Uploads', severity: string = 'Info') => {
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const adminEmail = sessionData?.user?.email || 'Unknown Admin';

      await supabase.from('AuditLogs').insert([
        {
          user_email: adminEmail,
          role: 'Admin',
          action: actionDesc,
          type,
          severity,
          ip_address: 'Internal',
          user_agent: navigator.userAgent
        }
      ]);
    } catch (err) {
      console.error('AuditLog insert failed:', err);
    }
  };

  // 5-second countdown timer effect for Document Archive
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (deleteModal && archiveCountdown > 0) {
      timer = setTimeout(() => {
        setArchiveCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [deleteModal, archiveCountdown]);

  // 5-second countdown timer effect for Setting Deletion
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (deleteSettingModal && settingDeleteCountdown > 0) {
      timer = setTimeout(() => {
        setSettingDeleteCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [deleteSettingModal, settingDeleteCountdown]);

  // Restore active document tab on mount
  useEffect(() => {
    const savedTab = localStorage.getItem('adminRagTab') as 'action' | 'active' | 'archive';
    if (savedTab) setActiveTab(savedTab);
  }, []);

  const handleTabChange = (tab: 'action' | 'active' | 'archive') => {
    setActiveTab(tab);
    localStorage.setItem('adminRagTab', tab);
  };

  // Fetch Material Requests
  const fetchRequests = async () => {
    setIsLoading(true);
    setLoadingMessage('Loading knowledge base documents...');
    const { data, error } = await supabase
      .from('Material Requests')
      .select('*, faculty:Users(name, email)')
      .order('created_at', { ascending: false });

    if (!error && data) setRequests(data);
    setIsLoading(false);
  };

  // Fetch Domain Settings
  const fetchDomainSettings = async () => {
    setIsSettingsLoading(true);
    const { data, error } = await supabase
      .from('Domain_Settings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("[Domain_Settings Fetch Error]:", error);
    } else if (data) {
      setDomainSettings(data);
    }
    setIsSettingsLoading(false);
  };

  useEffect(() => {
    fetchRequests();
    fetchDomainSettings();
  }, []);

  const { startIngestion, status: ingestionStatus, progressDetails } = useIngestion({
    onSuccess: () => fetchRequests()
  });

  const actionRequired = requests.filter(r => r.status === 'Pending Admin Approval');
  const activeFiles = requests.filter(r => r.status === 'Approved & Indexed' || r.status === 'Processing');
  const archivedFiles = requests.filter(r => ['Archived', 'Rejected', 'Deleted by Admin', 'File Purged'].includes(r.status));

  const getVisibleFiles = () => {
    if (activeTab === 'action') return actionRequired;
    if (activeTab === 'active') return activeFiles;
    return archivedFiles;
  };

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

  const handleApproveAndProcess = async (requestId: string, filePath: string, subject: string, fileName?: string) => {
    await supabase.from('Material Requests').update({ status: 'Processing' }).eq('id', requestId);
    await logAuditAction(`Approved and initiated ingestion for material request: "${fileName || filePath}" (${subject})`, 'Document Uploads', 'Info');
    fetchRequests(); 
    await startIngestion(requestId, filePath, [subject]);
  };

  const executeReject = async () => {
    if (!rejectModal) return;
    const targetFile = requests.find(r => r.id === rejectModal);
    const finalReason = rejectReason || 'File did not meet formatting requirements.';

    await supabase.from('Material Requests').update({ 
      status: 'Rejected',
      reject_reason: finalReason
    }).eq('id', rejectModal);
    
    await logAuditAction(`Rejected material request "${targetFile?.title || 'Unknown'}" (Reason: ${finalReason})`, 'Document Uploads', 'Warning');

    fetchRequests();
    setRejectModal(null);
    setRejectReason('');
  };

  // Archive & Purge Handler
  const executeAdminArchive = async () => {
    if (!deleteModal || archiveCountdown > 0) return;
    setLoadingMessage('Purging file vectors and archiving request...');
    setIsLoading(true);

    try {
      if (deleteModal.status === 'Approved & Indexed' || deleteModal.status === 'Processing') {
        try {
          await fetch(`${API_BASE_URL}/api/v1/vectors`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storage_path: deleteModal.path })
          });
        } catch (e) {
          console.error("FastAPI vector deletion failed:", e);
        }
      }

      if (deleteModal.path) {
        await supabase.storage.from('textbooks').remove([deleteModal.path]);
      }

      await supabase.from('Material Requests').update({ 
        status: 'Archived',
        reject_reason: 'Archived by administrator. Physical file removed and vector embeddings dropped.'
      }).eq('id', deleteModal.id);

      await logAuditAction(
        `Archived material "${deleteModal.title}": purged from storage and dropped vector embeddings`,
        'Document Uploads',
        'Warning'
      );

    } catch (err) {
      console.error("Error executing archive:", err);
    } finally {
      await fetchRequests();
      setIsLoading(false);
      setDeleteModal(null);
    }
  };

  const submitDirectAdminUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const filePath = `pending/admin_${Date.now()}_${safeName}`;
      
      const { error: uploadError } = await supabase.storage.from('textbooks').upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
      const { data: insertData, error: insertError } = await supabase.from('Material Requests').insert({
        faculty_id: user?.id,
        title: selectedFile.name,
        file_name: selectedFile.name,
        file_path: filePath,
        file_size_mb: fileSizeMB,
        subject: adminUploadSubject,
        tags: [adminUploadSubject],
        status: 'Processing'
      }).select().single();

      if (insertError) throw insertError;

      await logAuditAction(
        `Direct admin upload: "${selectedFile.name}" (${fileSizeMB} MB) assigned to [${adminUploadSubject}]`,
        'Document Uploads',
        'Info'
      );

      fetchRequests();
      setShowUploadModal(false);
      setSelectedFile(null);
      await startIngestion(insertData.id, filePath, [adminUploadSubject]);

    } catch (error) {
      setUploadError('Failed to upload the document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Domain Settings Actions
  const handleAddDomainSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSettingName.trim()) return;
    setIsSubmittingSetting(true);
    setSettingActionError('');

    try {
      const trimmedName = newSettingName.trim();
      const { error } = await supabase.from('Domain_Settings').insert({
        subject: newSettingSubject,
        setting_name: trimmedName
      });

      if (error) throw error;

      await logAuditAction(
        `Added operational vignette setting "${trimmedName}" for subject: ${newSettingSubject}`,
        'AI Engine',
        'Info'
      );

      setNewSettingName('');
      setShowAddSettingModal(false);
      fetchDomainSettings();
    } catch (err: any) {
      setSettingActionError(err.message || 'Failed to save domain setting.');
    } finally {
      setIsSubmittingSetting(false);
    }
  };

  const executeDeleteDomainSetting = async () => {
    if (!deleteSettingModal || settingDeleteCountdown > 0) return;
    setLoadingMessage('Removing operational setting...');
    setIsSettingsLoading(true);

    const targetId = deleteSettingModal.id;
    const targetName = deleteSettingModal.setting_name;
    const targetSubject = deleteSettingModal.subject;

    const { error } = await supabase.from('Domain_Settings').delete().eq('id', targetId);
    
    if (!error) {
      setDomainSettings(prev => prev.filter(s => s.id !== targetId));

      await logAuditAction(
        `Deleted operational vignette setting "${targetName}" from subject: ${targetSubject}`,
        'AI Engine',
        'Warning'
      );
    } else {
      console.error('Failed to delete setting:', error.message);
    }
    
    setIsSettingsLoading(false);
    setDeleteSettingModal(null);
  };

  const filteredDomainSettings = selectedSubjectFilter === 'All'
    ? domainSettings
    : domainSettings.filter(s => s.subject === selectedSubjectFilter);

  return (
    <div className="space-y-6 relative">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Knowledge Base & Domain Administration</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">
            {currentSection === 'documents' 
              ? 'Review faculty material requests and monitor document vectorization status.' 
              : 'Manage operational vignette settings sampled during HOTS exam generation.'}
          </p>
        </div>

        {currentSection === 'documents' ? (
          <button 
            onClick={() => { setShowUploadModal(true); setSelectedFile(null); setUploadError(''); }} 
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
          >
            Direct Admin Upload
          </button>
        ) : (
          <button 
            onClick={() => { setShowAddSettingModal(true); setSettingActionError(''); }} 
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
          >
            + Add Operational Setting
          </button>
        )}
      </div>

      {/* Top-Level Mode Selector */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setCurrentSection('documents')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            currentSection === 'documents'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Knowledge Base Documents
        </button>
        <button
          onClick={() => setCurrentSection('settings')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            currentSection === 'settings'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Domain Vignette Settings
        </button>
      </div>

      {/* SECTION 1: DOCUMENT MANAGEMENT */}
      {currentSection === 'documents' && (
        <>
          <div className="flex gap-4 border-b border-slate-200 mb-6">
            <button onClick={() => handleTabChange('action')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'action' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Action Required ({actionRequired.length})
            </button>
            <button onClick={() => handleTabChange('active')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'active' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Active Knowledge Base ({activeFiles.length})
            </button>
            <button onClick={() => handleTabChange('archive')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'archive' ? 'border-slate-500 text-slate-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Archive ({archivedFiles.length})
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
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">BLEPP Subject</th>
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
                          <p className={`font-bold ${file.status === 'File Purged' || file.status === 'Archived' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{file.title}</p>
                          <p className="text-xs font-bold text-slate-500">{file.file_size_mb} MB • {new Date(file.created_at).toLocaleDateString()}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-slate-700">{file.faculty?.name || 'Admin Upload'}</p>
                          <p className="text-xs text-slate-500">{file.faculty?.email || 'System'}</p>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-xs font-bold whitespace-nowrap">
                            {file.subject || (file.tags && file.tags[0]) || 'General Reference'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            file.status === 'Approved & Indexed' ? 'bg-emerald-100 text-emerald-800' : 
                            file.status === 'Pending Admin Approval' ? 'bg-amber-100 text-amber-800' : 
                            file.status === 'Archived' ? 'bg-purple-100 text-purple-800' : 
                            file.status === 'File Purged' ? 'bg-slate-200 text-slate-500' : 
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {file.status === 'Processing' && <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></span>}
                            {file.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {/* EYE ICON: View File (Available on Action Needed and Active Files) */}
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

                            {/* NOTEBOOK ICON: View Details (Available across all tabs) */}
                            <button 
                              onClick={() => setViewDetailsModal(file)} 
                              className="text-slate-400 hover:text-indigo-600 transition-colors p-1" 
                              title="View Details"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                            </button>

                            {/* Pending Action Buttons (Approve / Reject) */}
                            {file.status === 'Pending Admin Approval' && (
                              <>
                                <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                <button 
                                  onClick={() => handleApproveAndProcess(file.id, file.file_path, file.subject || (file.tags && file.tags[0]) || 'General Reference', file.title)} 
                                  className="text-emerald-500 hover:text-emerald-700 transition-colors p-1" 
                                  title="Approve & Process"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button 
                                  onClick={() => setRejectModal(file.id)} 
                                  className="text-red-500 hover:text-red-700 transition-colors p-1" 
                                  title="Reject"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </>
                            )}

                            {/* Active Action Button (Archive & Purge) */}
                            {(file.status === 'Approved & Indexed' || file.status === 'Processing') && (
                              <>
                                <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                <button 
                                  onClick={() => {
                                    setDeleteModal({ id: file.id, title: file.title, path: file.file_path, status: file.status });
                                    setArchiveCountdown(5);
                                  }} 
                                  className="text-slate-400 hover:text-red-600 transition-colors p-1" 
                                  title="Archive Material & Drop Vectors"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
        </>
      )}

      {/* SECTION 2: DOMAIN VIGNETTE SETTINGS */}
      {currentSection === 'settings' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Filter by Domain:</span>
              <select 
                value={selectedSubjectFilter} 
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-500"
              >
                <option value="All">All BLEPP Domains ({domainSettings.length})</option>
                {BLEPP_SUBJECTS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj} ({domainSettings.filter(s => s.subject === subj).length})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 font-bold">
              Showing {filteredDomainSettings.length} active scenario contexts
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Setting / Operational Context</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Target Subject</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date Added</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {isSettingsLoading ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-500 font-bold">Loading domain settings...</td></tr>
                  ) : filteredDomainSettings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 font-bold">
                        No settings found for this domain. Add one to expand the AI's HOTS vignette variety.
                      </td>
                    </tr>
                  ) : (
                    filteredDomainSettings.map((setting) => (
                      <tr key={setting.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-800">{setting.setting_name}</p>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {setting.subject}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-bold text-slate-500">
                          {new Date(setting.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setDeleteSettingModal(setting);
                              setSettingDeleteCountdown(5);
                            }}
                            className="text-slate-400 hover:text-red-600 transition-colors p-1"
                            title="Remove Setting"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Domain Setting Modal */}
      {showAddSettingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800">Add Operational Vignette Setting</h3>
              <button onClick={() => setShowAddSettingModal(false)} className="text-slate-400 hover:text-slate-700">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddDomainSetting} className="space-y-4">
              {settingActionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 font-bold">
                  {settingActionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Target Subject / Domain
                </label>
                <select
                  value={newSettingSubject}
                  onChange={(e) => setNewSettingSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {BLEPP_SUBJECTS.map((subj) => (
                    <option key={subj} value={subj}>{subj}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Setting / Workplace Context Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tertiary Hospital Ward, Corporate HR Department"
                  value={newSettingName}
                  onChange={(e) => setNewSettingName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 font-semibold mt-1">
                  The AI pipeline will situate vignette scenarios in this specific environment when testing HOTS items.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddSettingModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSetting || !newSettingName.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmittingSetting ? 'Saving...' : 'Save Setting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors relative ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) setSelectedFile(e.dataTransfer.files[0]); }}
                >
                  <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg></div>
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

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Target BLEPP Subject
                  </label>
                  <select
                    value={adminUploadSubject}
                    onChange={(e) => setAdminUploadSubject(e.target.value)}
                    disabled={isUploading}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-blue-500"
                  >
                    {BLEPP_SUBJECTS.map((subj) => (
                      <option key={subj} value={subj}>{subj}</option>
                    ))}
                  </select>
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

      {/* Mandatory Archive & Purge Modal with 5s Timer */}
      {deleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Archive Material & Drop Vectors?</h3>
            <p className="text-sm text-slate-600 font-bold mb-4">
              Are you sure you want to archive <span className="text-slate-900 font-extrabold">{deleteModal.title}</span>?
            </p>
            <p className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-lg p-3 mb-6 text-left">
              This action permanently purges the physical file from cloud storage and drops all corresponding document embeddings from the vector database. Future mock exams will no longer sample this reference material.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setDeleteModal(null)} 
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={executeAdminArchive} 
                disabled={archiveCountdown > 0}
                className="min-w-[190px] px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
              >
                {archiveCountdown > 0 ? `Confirm in ${archiveCountdown}s` : 'Archive & Drop Vectors'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Domain Setting Deletion Modal with 5s Timer */}
      {deleteSettingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Vignette Setting?</h3>
            <p className="text-sm text-slate-600 font-bold mb-4">
              Delete setting <span className="text-slate-900 font-extrabold">&quot;{deleteSettingModal.setting_name}&quot;</span> for domain <span className="text-indigo-600 font-extrabold">{deleteSettingModal.subject}</span>?
            </p>
            <p className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-lg p-3 mb-6 text-left">
              This operational context will immediately be removed from the sampling pool for Higher-Order Thinking Skills (HOTS) question generation.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setDeleteSettingModal(null)} 
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={executeDeleteDomainSetting} 
                disabled={settingDeleteCountdown > 0}
                className="min-w-[170px] px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
              >
                {settingDeleteCountdown > 0 ? `Confirm in ${settingDeleteCountdown}s` : 'Confirm Deletion'}
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
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">BLEPP Subject</span>
                <span className="inline-block mt-1 px-2.5 py-1 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {viewDetailsModal.subject || (viewDetailsModal.tags && viewDetailsModal.tags[0]) || 'General Reference'}
                </span>
              </div>
              {(viewDetailsModal.status === 'Rejected' || viewDetailsModal.status === 'Deleted by Admin' || viewDetailsModal.status === 'File Purged' || viewDetailsModal.status === 'Archived') && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg mt-4">
                  <span className="block text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Status Note / Audit Reason</span>
                  <p className="text-sm font-bold text-red-800">{viewDetailsModal.reject_reason || 'Archived'}</p>
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
        isOpen={isLoading || isSettingsLoading} 
        message={loadingMessage} 
      />
    </div>
  );
}
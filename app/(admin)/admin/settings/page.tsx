'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  
  // Security Hook
  const { manageUsers, isLoading: isPermissionsLoading } = usePermissions();

  const [platformName, setPlatformName] = useState('DeepCore Prep');
  const [currentLogoUrl, setCurrentLogoUrl] = useState('/logo.png');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Security Redirection
  useEffect(() => {
    if (!isPermissionsLoading && !manageUsers) {
      router.push("/dashboard"); 
    }
  }, [isPermissionsLoading, manageUsers, router]);

  useEffect(() => {
    const fetchSettings = async () => {
      if (isPermissionsLoading || !manageUsers) return;

      const { data, error } = await supabase
        .from('Platform_Settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (!error && data) {
        setPlatformName(data.platform_name);
        if (data.logo_url) {
          setCurrentLogoUrl(data.logo_url);
        }
      }
      setIsLoading(false);
    };

    fetchSettings();
  }, [isPermissionsLoading, manageUsers]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        addToast("Logo file must be less than 2MB.", "error");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let newLogoUrl = currentLogoUrl;

      // 1. Upload new logo if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `platform_logo_${Date.now()}.${fileExt}`;
        const filePath = `logos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('brand_assets')
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('brand_assets')
          .getPublicUrl(filePath);

        newLogoUrl = publicUrlData.publicUrl;
      }

      // 2. Update Database
      const { error: updateError } = await supabase
        .from('Platform_Settings')
        .upsert({ 
          id: 1, 
          platform_name: platformName,
          logo_url: newLogoUrl,
          updated_at: new Date().toISOString()
        });

      if (updateError) throw updateError;

      // 3. Log to Audit Logs
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('AuditLogs').insert([{
          user_email: user.email,
          role: 'Admin',
          action: `Updated platform branding (Name: ${platformName})`,
          type: 'Security',
          severity: 'Info',
          ip_address: 'Internal',
          user_agent: navigator.userAgent
        }]);
      }

      setCurrentLogoUrl(newLogoUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      addToast("Platform branding updated successfully!", "success");

    } catch (error: any) {
      console.error("Save error:", error);
      addToast(`Failed to update settings: ${error.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isPermissionsLoading || !manageUsers) {
    return <div className="p-12 text-center text-slate-500 font-bold mt-20">Verifying security clearance...</div>;
  }

  return (
    <div className="space-y-6 relative max-w-4xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Platform Settings</h1>
        <p className="text-sm text-slate-500 mt-1 font-bold">Customize the visual branding and identity of the review center.</p>
      </div>

      {isLoading ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center font-bold text-slate-500">
          Loading platform settings...
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8 space-y-8">
            
            {/* Platform Name */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Organization / Review Center Name</label>
              <input 
                type="text" 
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                required
                disabled={isSaving}
                className="w-full max-w-md px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              />
              <p className="text-xs font-bold text-slate-500 mt-2">This name will appear in emails, dashboards, and automated AI prompts.</p>
            </div>

            <hr className="border-slate-100" />

            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-4">Platform Logo</label>
              
              <div className="flex flex-col md:flex-row items-start gap-8">
                {/* Current/Preview Image */}
                <div className="w-48 h-48 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center p-4 shrink-0 relative overflow-hidden">
                  <img 
                    src={previewUrl || currentLogoUrl} 
                    alt="Platform Logo" 
                    className="max-w-full max-h-full object-contain mix-blend-multiply"
                  />
                  {previewUrl && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">
                      NEW PENDING
                    </div>
                  )}
                </div>

                {/* Upload Controls */}
                <div className="flex-1 space-y-4">
                  <div 
                    className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-800">Click to upload new logo</p>
                    <p className="text-xs font-bold text-slate-500 mt-1">PNG, JPG, or SVG. Maximum file size 2MB.</p>
                  </div>
                  
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/svg+xml"
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                  />

                  {selectedFile && (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-100 p-3 rounded-lg">
                      <span className="text-xs font-bold text-blue-800 truncate pr-4">{selectedFile.name}</span>
                      <button 
                        type="button"
                        onClick={() => { setSelectedFile(null); setPreviewUrl(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="text-xs font-bold text-blue-600 hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          <div className="bg-slate-50 px-8 py-4 border-t border-slate-200 flex justify-end gap-3">
            <button 
              type="button"
              onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
              disabled={isSaving || !selectedFile}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Discard Changes
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Saving...
                </>
              ) : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}
      <FullScreenLoader 
        isOpen={isLoading || isSaving} 
        message="Loading settings..." 
      />
    </div>
  );
}
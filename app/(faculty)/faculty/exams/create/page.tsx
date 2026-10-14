'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';
import { useExamGeneration } from '@/hooks/useExamGeneration';

const TOS_TOPICS: Record<string, string[]> = {
  "Abnormal Psychology": [
    "A.1 Intro to Abnormal Psych and Clinical Assessment",
    "A.2 Anxiety, Obsessive-Compulsive, and Trauma-Related Disorders",
    "A.3 Depressive and Bipolar Disorders",
    "A.4 Schizophrenia Spectrum and Other Psychotic Disorders",
    "A.5 Personality Disorders"
  ],
  "Psychological Assessment": [
    "A.1 Principles of Psychological Testing",
    "A.2 Test Construction and Development",
    "A.3 Reliability and Validity",
    "A.4 Intelligence and Cognitive Assessment",
    "A.5 Personality Assessment"
  ],
  "Industrial-Organizational Psychology": [
    "A.1 Organizational Theories, Models and Concepts",
    "A.2 Recruitment, Selection and Placement",
    "A.3 Training and Development",
    "A.4 Performance Management",
    "A.5 Employee Relations and Organizational Change"
  ],
  "Developmental Psychology": [
    "A.1 Theories of Human Development",
    "A.2 Physical Development Across the Lifespan",
    "A.3 Cognitive Development",
    "A.4 Socio-emotional Development",
    "A.5 Atypical Development"
  ]
};

const BLOOM_LEVELS = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];

type CustomBlock = { 
  id: string; 
  topic: string; 
  customTopicInput: string; 
  bloom: string; 
  count: number;
  setting: string;
  customSettingInput: string;
};

type Cohort = { id: string; name: string };

const getSourceFromPath = (path: string) => path.split('/').pop() || path;

// Converts Local HTML input format -> Strict UTC string for the database
const localToUTC = (localString: string | null | undefined): string | null => {
  if (!localString) return null;
  const [datePart, timePart] = localString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const d = new Date(year, month - 1, day, hours, minutes);
  return d.toISOString();
};

export default function CreateExamPage() {
  const router = useRouter();
  const { addToast } = useToast();
  
  const { triggerGeneration, status: genStatus, message: genMessage } = useExamGeneration();

  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<{ [key: string]: boolean | string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State - Step 1 (Details)
  const [examTitle, setExamTitle] = useState('');
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [isCohortDropdownOpen, setIsCohortDropdownOpen] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [passingScorePercent, setPassingScorePercent] = useState<number>(75);
  const [timeLimit, setTimeLimit] = useState(60);
  
  // Attempt & Grading Rules
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [gradingLogic, setGradingLogic] = useState<'highest' | 'latest' | 'average'>('highest');
  const [closeAfterDeadline, setCloseAfterDeadline] = useState<boolean>(true);

  // Form State - Step 2 (Parameters)
  const [subject, setSubject] = useState('Abnormal Psychology');
  const [generationMode, setGenerationMode] = useState<'strict' | 'custom'>('strict');
  const [availableSettings, setAvailableSettings] = useState<string[]>([]);
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([
    { id: 'initial-1', topic: '', customTopicInput: '', bloom: '', count: 5, setting: '', customSettingInput: '' }
  ]);
  
  // Form State - Step 3 (Sources)
  const [availableMaterials, setAvailableMaterials] = useState<any[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [serverDownModal, setServerDownModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Watch for Generation Success to Auto-Redirect
  useEffect(() => {
    if (genStatus === 'SUCCESS') {
      addToast('Exam generated successfully! It is now pending validation.', 'success');
      router.push('/faculty/exams');
    } else if (genStatus === 'FAILURE') {
      addToast(genMessage || 'Generation failed to complete.', 'error');
      setIsSubmitting(false);
    }
  }, [genStatus, genMessage, router, addToast]);

  // Initialization: Fetch Cohorts & Indexed Materials
  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: cohortData } = await supabase
        .from('Cohort Teachers')
        .select('cohort_id, Cohorts(cohort_name)')
        .eq('teacher_id', user.id);
      
      if (cohortData) {
        setCohorts(cohortData.map((ct: any) => ({
          id: ct.cohort_id,
          name: ct.Cohorts.cohort_name
        })));
      }

      const { data: materialData } = await supabase
        .from('Material Requests')
        .select('id, title, file_name, file_path, file_size_mb, faculty:Users(name)')
        .in('status', ['Approved & Indexed']);
      
      if (materialData) {
        setAvailableMaterials(materialData);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch Domain Settings when subject changes
  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('Domain_Settings')
        .select('setting_name')
        .eq('subject', subject);
      
      if (!error && data) {
        setAvailableSettings(data.map((d: any) => d.setting_name));
      } else {
        setAvailableSettings([]);
      }
    };
    fetchSettings();
  }, [subject]);

  // Heartbeat verification
  const checkWorkerHeartbeat = async (): Promise<boolean> => {
    try {
      // 1. Primary check: Use the same telemetry endpoint as AdminOverviewPage
      try {
        const telRes = await fetch('/api/telemetry');
        if (telRes.ok) {
          const telData = await telRes.json();
          const workerStatus = telData.backendHealth?.aiWorker?.toLowerCase();
          if (workerStatus === 'operational') {
            console.log('[Heartbeat Verified via /api/telemetry]: Operational');
            return true;
          }
        }
      } catch (e) {
        console.warn('[/api/telemetry check bypassed, falling back to Supabase]:', e);
      }

      // 2. Secondary check: Query Worker_Health table directly
      const { data, error } = await supabase
        .from('Worker_Health')
        .select('*')
        .eq('worker_name', 'ai_celery_worker')
        .order('last_heartbeat', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[Worker_Health DB Error]:', error);
        return false;
      }

      if (!data) {
        console.warn('[Worker_Health]: No heartbeat record found.');
        return false;
      }

      // Case-insensitive status check
      const isStatusOk = data.status?.toLowerCase() === 'operational';
      if (!isStatusOk) {
        console.warn(`[Worker_Health Status Mismatch]: Expected operational, got "${data.status}"`);
        return false;
      }

      // Timestamp check with a 5-minute safety window for clock skew
      const lastBeatTime = new Date(data.last_heartbeat).getTime();
      const diffMinutes = (Date.now() - lastBeatTime) / (1000 * 60);

      console.log(`[Worker Heartbeat Verified]: Last pulse was ${diffMinutes.toFixed(1)} mins ago.`);
      return diffMinutes <= 5;
    } catch (err) {
      console.error('[Heartbeat Check Exception]:', err);
      return false;
    }
  };

  const strictItemCount = subject === 'Psychological Assessment' ? 130 : 100;
  const isFormLocked = isSubmitting || genStatus === 'PROCESSING';

  const filteredMaterials = availableMaterials.filter(m => {
    const query = searchQuery.toLowerCase();
    const uploaderName = m.faculty?.name || 'Admin Upload';
    return (
      m.title.toLowerCase().includes(query) || 
      m.file_name.toLowerCase().includes(query) ||
      uploaderName.toLowerCase().includes(query)
    );
  });

  const toggleCohortSelection = (cohortId: string) => {
    setSelectedCohorts(prev => prev.includes(cohortId) ? prev.filter(id => id !== cohortId) : [...prev, cohortId]);
    setErrors({...errors, cohort: false});
  };

  const handleAddBlock = () => setCustomBlocks([
    ...customBlocks, 
    { id: Date.now().toString(), topic: '', customTopicInput: '', bloom: '', count: 1, setting: '', customSettingInput: '' }
  ]);

  const handleRemoveBlock = (id: string) => customBlocks.length > 1 && setCustomBlocks(customBlocks.filter(b => b.id !== id));
  
  const updateBlock = (id: string, field: keyof CustomBlock, value: string | number) => {
    setCustomBlocks(customBlocks.map(b => b.id === id ? { ...b, [field]: value } : b));
  };
  
  const toggleMaterialSelection = (filePath: string) => {
    const sourceName = getSourceFromPath(filePath);
    setSelectedMaterials(prev => prev.includes(sourceName) ? prev.filter(p => p !== sourceName) : [...prev, sourceName]);
  };

  const handleNext = () => {
    let newErrors: { [key: string]: boolean } = {};

    if (currentStep === 1) {
      if (!examTitle) newErrors.title = true;
      if (selectedCohorts.length === 0) newErrors.cohort = true;
      if (!scheduleStart) newErrors.start = true;
      if (!scheduleEnd) newErrors.end = true;
      if (!timeLimit || timeLimit <= 0) newErrors.time = true;
      if (!maxAttempts || maxAttempts <= 0) newErrors.attempts = true;
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    
    if (currentStep === 2 && generationMode === 'custom') {
      const incompleteBlocks = customBlocks.some(b => 
        !b.topic || 
        (b.topic === 'Other' && !b.customTopicInput) || 
        !b.bloom ||
        (b.setting === 'Other' && !b.customSettingInput)
      );
      if (incompleteBlocks) {
        newErrors.customBlocks = true;
        setErrors(newErrors);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    setErrors({});
    setCurrentStep(prev => Math.min(prev + 1, 3));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = () => {
    setErrors({});
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerate = async () => {
    // 1. Single-click guard: Block duplicate requests
    if (isSubmitting || isFormLocked) return;

    if (selectedMaterials.length === 0) {
      setErrors({ materials: true });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    // 2. Pre-check worker heartbeat before committing to Supabase
    const isWorkerAlive = await checkWorkerHeartbeat();
    if (!isWorkerAlive) {
      setIsSubmitting(false);
      setServerDownModal(true);
      return;
    }

    const sessionUUID = crypto.randomUUID(); 
    
    const totalItems = generationMode === 'strict' 
      ? strictItemCount 
      : customBlocks.reduce((acc, block) => acc + block.count, 0);
    const exactPassingScore = Math.round(totalItems * (passingScorePercent / 100));

    const scheduleStartUTC = localToUTC(scheduleStart);
    const scheduleEndUTC = localToUTC(scheduleEnd);

    // 3. Insert parent record
    const { error: dbError } = await supabase.from('Exams').insert({
      exam_id: sessionUUID,
      exam_title: examTitle,
      exam_subject: subject,
      schedule_start: scheduleStartUTC, 
      schedule_end: scheduleEndUTC,
      passing_score: exactPassingScore,
      passing_percentage: passingScorePercent,
      references: selectedMaterials, 
      time_limit_mins: timeLimit,
      global_status: 'Generating',
      max_attempts: maxAttempts,
      close_after_deadline: closeAfterDeadline,
      grading_logic: gradingLogic
    });

    if (dbError) {
      setErrors({ database: `Failed to create exam record: ${dbError.message}` });
      setIsSubmitting(false);
      return;
    }

    // 4. Map cohorts
    const cohortPayload = selectedCohorts.map(cohortId => ({
      exam_id: sessionUUID,
      cohort_id: cohortId
    }));

    const { error: junctionError } = await supabase.from('Exam_Cohorts').insert(cohortPayload);
    
    if (junctionError) {
      setErrors({ database: `Failed to assign cohorts: ${junctionError.message}` });
      setIsSubmitting(false);
      return;
    }

    // 5. Audit log
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('Users')
        .select(`email, Roles ( role_name )`)
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
          action: `Created new exam: "${examTitle}" (${subject})`,
          type: 'AI Engine',
          severity: 'Info',
          ip_address: 'Internal',
          user_agent: navigator.userAgent
        }
      ]);
    }

    // Show progress modal
    setShowProgressModal(true);

    // 6. Trigger generation task
    if (generationMode === 'strict') {
      const blueprintMap: Record<string, string> = {
        "Abnormal Psychology": "1",
        "Industrial-Organizational Psychology": "2",
        "Psychological Assessment": "3",
        "Developmental Psychology": "4"
      };
      
      await triggerGeneration(
        'blueprint', 
        { 
          blueprint_id: blueprintMap[subject], 
          references: selectedMaterials 
        }, 
        sessionUUID
      );
    } else {
      const customSettingsPool = Array.from(new Set(
        customBlocks
          .map(b => b.setting === 'Other' ? b.customSettingInput.trim() : b.setting)
          .filter(Boolean)
      ));

      const finalBlocks = customBlocks.map(b => ({
        competency: b.topic === 'Other' ? b.customTopicInput : b.topic,
        bloom: b.bloom,
        count: b.count,
        setting: b.setting === 'Other' ? b.customSettingInput.trim() : (b.setting || undefined)
      }));
      
      await triggerGeneration(
        'custom_batch', 
        { 
          subject: subject,
          blocks: finalBlocks, 
          references: selectedMaterials,
          custom_settings: customSettingsPool.length > 0 ? customSettingsPool : undefined
        }, 
        sessionUUID
      );
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between bg-slate-100 p-4 rounded-xl border border-slate-200">
      <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'opacity-100' : 'opacity-50'}`}>
        <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-sm shadow-sm transition-colors ${currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'}`}>1</div>
        <span className="text-sm font-bold text-slate-800 hidden sm:inline">Details</span>
      </div>
      <div className={`flex-1 h-1 mx-4 rounded-full transition-colors ${currentStep >= 2 ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
      <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'opacity-100' : 'opacity-50'}`}>
        <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-sm shadow-sm transition-colors ${currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'}`}>2</div>
        <span className="text-sm font-bold text-slate-800 hidden sm:inline">Parameters</span>
      </div>
      <div className={`flex-1 h-1 mx-4 rounded-full transition-colors ${currentStep >= 3 ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
      <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'opacity-100' : 'opacity-50'}`}>
        <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-sm shadow-sm transition-colors ${currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'}`}>3</div>
        <span className="text-sm font-bold text-slate-800 hidden sm:inline">Sources</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto relative pb-24">
      <div className="flex items-center gap-3 mb-2">
        <button 
          onClick={() => router.push('/faculty/exams')} 
          disabled={isFormLocked}
          className="text-slate-500 hover:text-blue-600 font-bold text-sm flex items-center gap-1 disabled:opacity-50"
        >
          &larr; Back to Exam Management
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Create New Exam</h1>
        <p className="text-sm text-slate-500 mt-1 font-bold">Configure the AI parameters and select reference materials to generate a mock exam.</p>
      </div>

      {Object.values(errors).some(Boolean) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in fade-in duration-200">
          <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-red-800 font-bold">
            {typeof errors.database === 'string' ? errors.database : 'Please complete all highlighted fields before proceeding.'}
          </p>
        </div>
      )}

      {renderStepIndicator()}

      <div className="space-y-6">
        {/* STEP 1 */}
        {currentStep === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-bold text-slate-800 mb-6">1. General Exam Details</h2>
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className={`block text-sm font-bold mb-2 transition-colors ${errors.title ? 'text-red-600' : 'text-slate-700'}`}>Exam Title</label>
                  <input 
                    type="text" 
                    value={examTitle}
                    onChange={(e) => { setExamTitle(e.target.value); setErrors({...errors, title: false}); }}
                    placeholder="e.g. Midterm Coverage Quiz" 
                    disabled={isFormLocked}
                    className={`w-full px-4 py-3 border rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 transition-colors disabled:bg-slate-50 disabled:text-slate-500 ${errors.title ? 'border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'}`} 
                  />
                </div>
                
                <div className="relative">
                  <label className={`block text-sm font-bold mb-2 transition-colors ${errors.cohort ? 'text-red-600' : 'text-slate-700'}`}>Target Cohort(s)</label>
                  <div 
                    onClick={() => !isFormLocked && setIsCohortDropdownOpen(!isCohortDropdownOpen)}
                    className={`min-h-[46px] w-full px-3 py-2 border rounded-lg flex flex-wrap gap-2 items-center cursor-pointer bg-white transition-colors ${errors.cohort ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-slate-300 hover:border-blue-400'} ${isFormLocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                  >
                    {selectedCohorts.length === 0 ? (
                      <span className="text-sm font-bold text-slate-400 px-1">Select assigned cohorts...</span>
                    ) : (
                      selectedCohorts.map(id => {
                        const cohort = cohorts.find(c => c.id === id);
                        return (
                          <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold rounded-md z-10">
                            {cohort?.name}
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); toggleCohortSelection(id); }}
                              className="text-blue-500 hover:text-blue-800 bg-white rounded-full p-0.5 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </span>
                        );
                      })
                    )}
                    <div className="ml-auto px-1">
                      <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCohortDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>

                  {isCohortDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsCohortDropdownOpen(false)}></div>
                      <div className="absolute z-20 w-full mt-2 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto py-1 animate-in fade-in slide-in-from-top-2">
                        {cohorts.length === 0 ? (
                          <div className="p-4 text-sm text-slate-500 font-bold text-center">No active cohorts assigned to you.</div>
                        ) : (
                          cohorts.map(c => {
                            const isSelected = selectedCohorts.includes(c.id);
                            return (
                              <div 
                                key={c.id} 
                                onClick={() => toggleCohortSelection(c.id)}
                                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                                  {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className={`text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{c.name}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-bold mb-2 transition-colors ${errors.start ? 'text-red-600' : 'text-slate-700'}`}>Schedule Start</label>
                  <input 
                    type="datetime-local" 
                    value={scheduleStart}
                    onChange={(e) => { setScheduleStart(e.target.value); setErrors({...errors, start: false}); }}
                    disabled={isFormLocked}
                    className={`w-full px-4 py-3 border rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 transition-colors disabled:bg-slate-50 disabled:text-slate-500 ${errors.start ? 'border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'}`} 
                  />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-2 transition-colors ${errors.end ? 'text-red-600' : 'text-slate-700'}`}>Schedule End</label>
                  <input 
                    type="datetime-local" 
                    value={scheduleEnd}
                    onChange={(e) => { setScheduleEnd(e.target.value); setErrors({...errors, end: false}); }}
                    disabled={isFormLocked}
                    className={`w-full px-4 py-3 border rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 transition-colors disabled:bg-slate-50 disabled:text-slate-500 ${errors.end ? 'border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'}`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Passing Score (%)</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="1" 
                      max="100" 
                      step="1"
                      value={passingScorePercent}
                      onChange={(e) => setPassingScorePercent(Number(e.target.value))}
                      disabled={isFormLocked}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex items-center border border-slate-300 rounded-lg bg-white px-2 py-1.5 min-w-[75px] focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                      <input 
                        type="number" 
                        min="1" 
                        max="100"
                        value={passingScorePercent}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) setPassingScorePercent(Math.min(100, Math.max(1, val)));
                        }}
                        disabled={isFormLocked}
                        className="w-10 text-sm font-bold text-slate-900 bg-transparent text-right focus:outline-none"
                      />
                      <span className="text-sm font-bold text-slate-500 ml-1">%</span>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-amber-600 mt-2 leading-tight">
                    Note: The passing score ratio is hard-locked upon creation to preserve student analytics integrity.
                  </p>
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-2 transition-colors ${errors.time ? 'text-red-600' : 'text-slate-700'}`}>Time Limit (Minutes)</label>
                  <input 
                    type="number" min="1"
                    value={timeLimit}
                    onChange={(e) => { setTimeLimit(Number(e.target.value)); setErrors({...errors, time: false}); }}
                    disabled={isFormLocked}
                    className={`w-full px-4 py-3 border rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 transition-colors disabled:bg-slate-50 disabled:text-slate-500 ${errors.time ? 'border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'}`} 
                  />
                </div>
              </div>

              {/* Attempts & Grading Rules */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                <div>
                  <label className={`block text-sm font-bold mb-2 transition-colors ${errors.attempts ? 'text-red-600' : 'text-slate-700'}`}>Max Attempts Allowed</label>
                  <input 
                    type="number" min="1" max="10"
                    value={maxAttempts}
                    onChange={(e) => { setMaxAttempts(Number(e.target.value)); setErrors({...errors, attempts: false}); }}
                    disabled={isFormLocked}
                    className={`w-full px-4 py-3 border rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 transition-colors disabled:bg-slate-50 disabled:text-slate-500 ${errors.attempts ? 'border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'}`} 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Final Score Grading Logic</label>
                  <select 
                    value={gradingLogic}
                    onChange={(e) => setGradingLogic(e.target.value as any)}
                    disabled={isFormLocked}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="highest">Highest Attempt Score</option>
                    <option value="latest">Latest Attempt Score</option>
                    <option value="average">Average of All Attempts</option>
                  </select>
                </div>
                
                <div className="flex items-center mt-8">
                  <label className={`flex items-center gap-3 ${isFormLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      checked={closeAfterDeadline}
                      onChange={(e) => setCloseAfterDeadline(e.target.checked)}
                      disabled={isFormLocked}
                      className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed" 
                    />
                    <span className="text-sm font-bold text-slate-700">Close After Deadline</span>
                  </label>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* STEP 2 */}
        {currentStep === 2 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-bold text-slate-800 mb-6">2. AI Generation Parameters</h2>
            
            <div className="space-y-8">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Target Subject</label>
                <select 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isFormLocked}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {Object.keys(TOS_TOPICS).map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Generation Mode</label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className={`flex-1 flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${generationMode === 'strict' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'} ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input type="radio" name="generationMode" checked={generationMode === 'strict'} onChange={() => setGenerationMode('strict')} disabled={isFormLocked} className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:cursor-not-allowed" />
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-slate-800">Strict Board Exam Mode</span>
                      <span className="block text-xs font-bold text-slate-500 mt-0.5">TOS Compliant distribution</span>
                    </div>
                  </label>
                  <label className={`flex-1 flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${generationMode === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'} ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input type="radio" name="generationMode" checked={generationMode === 'custom'} onChange={() => setGenerationMode('custom')} disabled={isFormLocked} className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:cursor-not-allowed" />
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-slate-800">Custom Diagnostic Mode</span>
                      <span className="block text-xs font-bold text-slate-500 mt-0.5">Build your own custom payload & settings</span>
                    </div>
                  </label>
                </div>
              </div>

              {generationMode === 'strict' ? (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🔒</span>
                    <h3 className="font-bold text-slate-800 text-sm">System Locked Parameters</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 border border-slate-200 rounded-md">
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Items</span>
                      <span className="block text-lg font-bold text-slate-800">{strictItemCount} Items</span>
                    </div>
                    <div className="bg-white p-4 border border-slate-200 rounded-md md:col-span-2">
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cognitive Level (Bloom's Taxonomy)</span>
                      <span className="block text-sm font-bold text-slate-800">30% Easy, 40% Moderate, 30% Difficult</span>
                    </div>
                    <div className="bg-white p-4 border border-slate-200 rounded-md md:col-span-3">
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Topic Coverage</span>
                      <span className="block text-sm font-bold text-slate-800">Automatically sweeps across all competencies listed in the syllabus</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-6 space-y-6">
                  <div className="flex justify-between items-end border-b border-blue-200 pb-4">
                    <div>
                      <h3 className="font-bold text-blue-900">Custom Payload Builder</h3>
                      <p className="text-xs text-blue-700 font-bold mt-1">Configure competencies and target operational contexts for scenario generation.</p>
                    </div>
                    {errors.customBlocks && <span className="text-xs font-bold text-red-600 bg-red-100 px-3 py-1 rounded-md">Incomplete blocks</span>}
                  </div>
                  
                  {customBlocks.map((block, index) => (
                    <div key={block.id} className={`bg-white p-5 rounded-lg border relative ${errors.customBlocks && (!block.topic || !block.bloom || (block.topic === 'Other' && !block.customTopicInput) || (block.setting === 'Other' && !block.customSettingInput)) ? 'border-red-400 shadow-[0_0_0_1px_rgba(248,113,113,1)]' : 'border-slate-200 shadow-sm'}`}>
                      <div className="absolute top-3 left-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Block {index + 1}</div>
                      {customBlocks.length > 1 && (
                        <button type="button" onClick={() => handleRemoveBlock(block.id)} className="absolute top-3 right-4 text-slate-400 hover:text-red-500 font-bold text-xs transition-colors">
                          Remove
                        </button>
                      )}
                      
                      <div className="mt-6 space-y-4">
                        {/* Row 1: Topic, Bloom, Count */}
                        <div className="flex flex-col md:flex-row gap-5">
                          <div className="flex-1 space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Topic Filter (TOS)</label>
                            <select 
                              value={block.topic}
                              onChange={(e) => updateBlock(block.id, 'topic', e.target.value)}
                              disabled={isFormLocked}
                              className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              <option value="" disabled>Select a topic...</option>
                              {TOS_TOPICS[subject]?.map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="Other">Other (Type custom topic)...</option>
                            </select>
                            {block.topic === 'Other' && (
                              <div className="animate-in fade-in slide-in-from-top-1">
                                <input 
                                  type="text" 
                                  placeholder="Type your specific topic or competency..." 
                                  value={block.customTopicInput}
                                  onChange={(e) => updateBlock(block.id, 'customTopicInput', e.target.value)}
                                  disabled={isFormLocked}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className="w-full md:w-48">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Bloom's</label>
                            <select 
                              value={block.bloom}
                              onChange={(e) => updateBlock(block.id, 'bloom', e.target.value)}
                              disabled={isFormLocked}
                              className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              <option value="" disabled>Select level...</option>
                              {BLOOM_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                            </select>
                          </div>
                          
                          <div className="w-full md:w-32">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Item Count</label>
                            <input 
                              type="number" min="1" max="50"
                              value={block.count}
                              onChange={(e) => updateBlock(block.id, 'count', Number(e.target.value))}
                              disabled={isFormLocked}
                              className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center"
                            />
                          </div>
                        </div>

                        {/* Row 2: Operational Context / Domain Setting */}
                        <div className="pt-3 border-t border-slate-100">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Operational Context / Vignette Setting (Optional)
                          </label>
                          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <select 
                              value={block.setting}
                              onChange={(e) => updateBlock(block.id, 'setting', e.target.value)}
                              disabled={isFormLocked}
                              className="w-full sm:w-80 px-3 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 bg-white"
                            >
                              <option value="">Default (Random Database Setting)</option>
                              {availableSettings.map(s => <option key={s} value={s}>{s}</option>)}
                              <option value="Other">Other (Input custom setting)...</option>
                            </select>

                            {block.setting === 'Other' && (
                              <div className="flex-1 w-full animate-in fade-in slide-in-from-top-1">
                                <input 
                                  type="text" 
                                  placeholder="e.g. Inpatient Psychiatric Ward, BPO Helpdesk" 
                                  value={block.customSettingInput}
                                  onChange={(e) => updateBlock(block.id, 'customSettingInput', e.target.value)}
                                  disabled={isFormLocked}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 placeholder:font-normal"
                                />
                              </div>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-slate-400 mt-1">
                            Used to situate HOTS scenarios in realistic workplaces or clinical environments.
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    type="button" 
                    onClick={handleAddBlock} 
                    disabled={isFormLocked}
                    className="w-full py-3 border-2 border-dashed border-blue-300 text-blue-600 text-sm font-bold rounded-lg hover:bg-blue-100 hover:border-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Payload Block
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-bold text-slate-800 mb-6">3. Source References</h2>
            <p className={`text-sm font-bold mt-1 mb-6 transition-colors ${errors.materials ? 'text-red-600' : 'text-slate-500'}`}>
              Select the active knowledge base files the AI should use to craft the items.
            </p>
            
            <div className={`border rounded-xl bg-slate-50 overflow-hidden ${errors.materials ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-200'}`}>
              
              {selectedMaterials.length > 0 && (
                <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap gap-2">
                  {selectedMaterials.map(sourceName => {
                    const mat = availableMaterials.find(m => getSourceFromPath(m.file_path) === sourceName);
                    return (
                      <div key={sourceName} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
                        <span className="text-xs font-bold text-blue-800 max-w-[200px] truncate" title={mat?.title}>{mat?.title}</span>
                        <button 
                          type="button" 
                          onClick={() => toggleMaterialSelection(mat?.file_path || sourceName)}
                          className="text-blue-400 hover:text-blue-700 bg-white rounded-full p-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input 
                  type="text" 
                  placeholder="Search available materials by title or filename..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={isFormLocked}
                  className="w-full text-sm font-bold text-slate-900 focus:outline-none bg-transparent"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 bg-white">
                {availableMaterials.length === 0 ? (
                  <div className="p-8 text-center text-sm font-bold text-slate-500">No active materials found in the knowledge base.</div>
                ) : filteredMaterials.length === 0 ? (
                  <div className="p-8 text-center text-sm font-bold text-slate-500">No files match your search.</div>
                ) : (
                  filteredMaterials.map(mat => {
                    const sourceName = getSourceFromPath(mat.file_path);
                    const isSelected = selectedMaterials.includes(sourceName);
                    return (
                      <div 
                        key={mat.id}
                        onClick={() => !isFormLocked && toggleMaterialSelection(mat.file_path)}
                        className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'} ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {isSelected && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{mat.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-slate-500">{mat.file_size_mb} MB</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{mat.faculty?.name || 'Admin Upload'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM FIXED BAR */}
        <div className="fixed bottom-0 left-0 right-0 md:left-72 bg-white border-t border-slate-200 p-4 shadow-lg z-20">
          <div className="max-w-4xl mx-auto flex justify-between items-center gap-4">
            <div>
              {currentStep > 1 ? (
                <button type="button" onClick={handlePrev} disabled={isFormLocked} className="px-6 py-3 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">Previous Step</button>
              ) : (
                <button type="button" onClick={() => router.push('/faculty/exams')} disabled={isFormLocked} className="px-6 py-3 text-slate-500 text-sm font-bold rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">Cancel</button>
              )}
            </div>

            <div>
              {currentStep < 3 ? (
                <button type="button" onClick={handleNext} className="min-w-[140px] px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">Next Step</button>
              ) : (
                <button 
                  type="button" 
                  onClick={handleGenerate} 
                  disabled={isFormLocked} 
                  className={`min-w-[180px] px-8 py-3 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${isFormLocked ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {isFormLocked ? (
                    <><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Queuing...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022.547l-2.387.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg> Generate Exam</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- SERVER DOWN MODAL --- */}
      {serverDownModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Generation Server Offline</h3>
            <p className="text-sm text-slate-600 font-bold mb-6">
              The AI assessment engine is currently unreachable (no active worker heartbeat detected). Exam generation has been halted to prevent unpopulated records. Please try again shortly or contact the administrator.
            </p>
            <button 
              onClick={() => setServerDownModal(false)}
              className="w-full px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {/* --- BACKGROUND GENERATION PROGRESS POPUP --- */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing Exam Generation
                </h3>
                <span className="text-xs font-bold text-slate-400">Task ID active in Celery queue</span>
              </div>
              <button 
                onClick={() => router.push('/faculty/exams')} 
                className="text-slate-400 hover:text-slate-600 p-1"
                title="Close and return to dashboard"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg">
                <p className="text-sm font-bold text-blue-900">
                  {genMessage || 'Initiating document retrieval, calibration, and RAGAS evaluation...'}
                </p>
                <div className="w-full bg-blue-200/60 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div className="bg-blue-600 h-full w-2/5 animate-pulse rounded-full"></div>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                This generation is running independently in the background. You do not need to keep this window open. You can safely exit to your dashboard to review pending exams.
              </p>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => router.push('/faculty/exams')}
                className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
              >
                Go to Exam Management
              </button>
            </div>
          </div>
        </div>
      )}

      <FullScreenLoader 
        isOpen={isSubmitting && !showProgressModal && !serverDownModal} 
        message="Queuing exam generation engine..." 
      />
    </div>
  );
}
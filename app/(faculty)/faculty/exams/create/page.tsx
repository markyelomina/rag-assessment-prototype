'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastContext';

export default function CreateExamPage() {
  const router = useRouter();
  const { addToast } = useToast();
  
  // Wizard State
  const [currentStep, setCurrentStep] = useState(1);

  // Form State - Step 1
  const [examTitle, setExamTitle] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  // Form State - Step 2
  const [subject, setSubject] = useState('Abnormal Psychology');
  const [generationMode, setGenerationMode] = useState<'strict' | 'custom'>('strict');
  const [customItems, setCustomItems] = useState(30);
  const [customTopic, setCustomTopic] = useState('');
  const [selectedBlooms, setSelectedBlooms] = useState<string[]>([]);
  
  // Form State - Step 3
  const [materials, setMaterials] = useState([
    { id: 'mat1', title: 'Barlow Abnormal Psychology Textbook (PDF)', uploader: 'System Default', checked: true },
    { id: 'mat2', title: 'Kaplan Clinical Psychiatry Guide (PDF)', uploader: 'System Default', checked: true },
    { id: 'mat3', title: 'Gregory Psychological Testing (DOCX)', uploader: 'System Default', checked: false },
    { id: 'mat4', title: 'Week 2 Presentation Slides (PPTX)', uploader: 'Dr. Marquez', checked: false },
  ]);

  // Submission State
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const bloomLevels = [
    { level: 'Remembering', tip: 'Recall facts and basic concepts' }, 
    { level: 'Understanding', tip: 'Explain ideas or concepts' }, 
    { level: 'Applying', tip: 'Use information in new situations' }, 
    { level: 'Analyzing', tip: 'Draw connections among ideas' }, 
    { level: 'Evaluating', tip: 'Justify a stand or decision' }, 
    { level: 'Creating', tip: 'Produce new or original work' }
  ];

  const strictItemCount = subject === 'Psychological Assessment' ? 130 : 100;
  const isAllSelected = materials.every(mat => mat.checked);

  // Helper Functions
  const toggleMaterial = (id: string) => {
    setMaterials(materials.map(mat => 
      mat.id === id ? { ...mat, checked: !mat.checked } : mat
    ));
  };

  const toggleSelectAll = () => {
    const newState = !isAllSelected;
    setMaterials(materials.map(mat => ({ ...mat, checked: newState })));
  };

  const toggleBloom = (level: string) => {
    if (selectedBlooms.includes(level)) {
      setSelectedBlooms(selectedBlooms.filter(b => b !== level));
    } else {
      setSelectedBlooms([...selectedBlooms, level]);
    }
  };

  // Navigation Logic
  const handleNext = () => {
    setErrorMessage('');
    
    // Validate Step 1
    if (currentStep === 1) {
      if (!examTitle || !targetAudience || !dueDate) {
        setErrorMessage('Please fill out all general exam details before proceeding.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    
    // Validate Step 2
    if (currentStep === 2) {
      if (generationMode === 'custom' && selectedBlooms.length === 0) {
        setErrorMessage('You must select at least one Bloom\'s Taxonomy level in Custom Mode.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, 3));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = () => {
    setErrorMessage('');
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const selectedMatsCount = materials.filter(m => m.checked).length;
    if (selectedMatsCount === 0) {
      setErrorMessage('You must select at least one source reference material for the AI to read.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsGenerating(true);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      addToast('Exam configuration submitted successfully.', 'success');
      router.push('/faculty/exams');
    } catch (error: any) {
      setErrorMessage('The AI engine failed to generate the exam. Please check your parameters and try again.');
      setIsGenerating(false);
    } 
  };

  // UI Renderers
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
          disabled={isGenerating}
          className="text-slate-500 hover:text-blue-600 font-bold text-sm flex items-center gap-1 disabled:opacity-50"
        >
          &larr; Back to Exam Management
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Create New Exam</h1>
        <p className="text-sm text-slate-500 mt-1 font-bold">Configure the AI parameters and select reference materials to generate a new mock exam.</p>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in fade-in duration-200">
          <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-red-800 font-bold">{errorMessage}</p>
        </div>
      )}

      {renderStepIndicator()}

      <form onSubmit={handleGenerate} className="space-y-6">
        
        {/* STEP 1 */}
        {currentStep === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-bold text-slate-800 mb-6">1. General Exam Details</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Exam Title</label>
                <input 
                  type="text" 
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="e.g. Midterm Coverage Quiz" 
                  required
                  disabled={isGenerating}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" 
                />
              </div>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Target Audience or Cohort</label>
                  <input 
                    type="text" 
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g. PSY301" 
                    required
                    disabled={isGenerating}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" 
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Due Date</label>
                  <input 
                    type="date" 
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    disabled={isGenerating}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 disabled:bg-slate-50 disabled:text-slate-500" 
                  />
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
                  disabled={isGenerating}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="Abnormal Psychology">Abnormal Psychology</option>
                  <option value="Developmental Psychology">Developmental Psychology</option>
                  <option value="Industrial Organizational Psychology">Industrial Organizational Psychology</option>
                  <option value="Psychological Assessment">Psychological Assessment</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Generation Mode</label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className={`flex-1 flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${generationMode === 'strict' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'} ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input 
                      type="radio" 
                      name="generationMode" 
                      checked={generationMode === 'strict'}
                      onChange={() => setGenerationMode('strict')}
                      disabled={isGenerating}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:cursor-not-allowed" 
                    />
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-slate-800">Strict Board Exam Mode</span>
                      <span className="block text-xs font-bold text-slate-500 mt-0.5">TOS Compliant distribution</span>
                    </div>
                  </label>
                  <label className={`flex-1 flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${generationMode === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'} ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input 
                      type="radio" 
                      name="generationMode" 
                      checked={generationMode === 'custom'}
                      onChange={() => setGenerationMode('custom')}
                      disabled={isGenerating}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:cursor-not-allowed" 
                    />
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-slate-800">Custom Diagnostic Quiz Mode</span>
                      <span className="block text-xs font-bold text-slate-500 mt-0.5">Manual parameter control</span>
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
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 space-y-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Topic Filter</label>
                      <select 
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        disabled={isGenerating}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="">All Topics</option>
                        <option value="Topic A">Specific Topic A</option>
                        <option value="Topic B">Specific Topic B</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Total Item Count</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="150" 
                        value={customItems}
                        onChange={(e) => setCustomItems(Number(e.target.value))}
                        disabled={isGenerating}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Target Bloom's Taxonomy</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {bloomLevels.map(bloom => (
                        <label key={bloom.level} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors relative group ${selectedBlooms.includes(bloom.level) ? 'border-blue-500 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'} ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input 
                            type="checkbox" 
                            checked={selectedBlooms.includes(bloom.level)}
                            onChange={() => toggleBloom(bloom.level)}
                            disabled={isGenerating}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className={`ml-3 text-xs font-bold flex items-center gap-2 ${selectedBlooms.includes(bloom.level) ? 'text-blue-900' : 'text-slate-700'}`}>
                            {bloom.level}
                            <div className="text-slate-400 bg-slate-100 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">?</div>
                          </span>
                          <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block w-40 bg-slate-800 text-white text-[10px] rounded p-2 text-center shadow-lg z-10 font-bold">
                            {bloom.tip}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800">3. Source References</h2>
                <p className="text-sm text-slate-500 font-bold mt-1">Select the ingested textbooks the AI should use.</p>
              </div>
              <button 
                type="button" 
                onClick={toggleSelectAll}
                disabled={isGenerating}
                className="text-sm font-bold text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="space-y-3">
              {materials.map((mat) => (
                <label key={mat.id} className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${mat.checked ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-blue-300 hover:bg-slate-50'} ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={mat.checked}
                    onChange={() => toggleMaterial(mat.id)}
                    disabled={isGenerating}
                    className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className={`ml-4 text-sm font-bold flex-1 ${mat.checked ? 'text-blue-900' : 'text-slate-700'}`}>
                    {mat.title} <span className="text-xs text-slate-400 font-bold ml-2">(Uploaded by {mat.uploader})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 md:left-72 bg-white border-t border-slate-200 p-4 shadow-lg z-20 transition-all duration-300">
          <div className="max-w-4xl mx-auto flex justify-between items-center gap-4">
            <div>
              {currentStep > 1 ? (
                <button 
                  type="button"
                  onClick={handlePrev}
                  disabled={isGenerating}
                  className="px-6 py-3 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous Step
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={() => router.push('/faculty/exams')}
                  disabled={isGenerating}
                  className="px-6 py-3 text-slate-500 text-sm font-bold rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              )}
            </div>

            <div>
              {currentStep < 3 ? (
                <button 
                  type="button"
                  onClick={handleNext}
                  className="min-w-[140px] px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                >
                  Next Step
                </button>
              ) : (
                <button 
                  type="submit"
                  disabled={isGenerating}
                  className={`min-w-[180px] px-8 py-3 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${
                    isGenerating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022.547l-2.387.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                      Generate Exam
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const CORE_SUBJECTS = [
  "Abnormal Psychology",
  "Psychological Assessment",
  "Industrial Organizational Psychology",
  "Developmental Psychology"
];

export default function RoadmapPage() {
  const [currentDbPhase, setCurrentDbPhase] = useState<number>(1);
  const [expandedPhase, setExpandedPhase] = useState<number>(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Unified Progress Engine State
  const [progressStats, setProgressStats] = useState({
    diagnosticPassed: false,
    coreSubjectsPassed: [] as string[],
    adaptivePassedCount: 0,
    fullLengthPassed: false,
  });

  useEffect(() => {
    const fetchProgressAndEvaluate = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch current Roadmap Phase
      const { data: roadmapData } = await supabase
        .from('Roadmap Progress')
        .select('current_phase')
        .eq('student_id', user.id)
        .single();

      let dbPhase = roadmapData?.current_phase || 1;

      // 2. Fetch real student attempts with Title, Subject, and PASSING SCORE for the Progress Engine
      const { data: attempts, error: attemptsError } = await supabase
        .from('Student Attempts')
        .select(`
          attempt_id,
          final_score,
          completed_at,
          exam_id,
          exam:Exams!inner ( exam_title, exam_subject, global_status, grading_logic, passing_score )
        `)
        .eq('student_id', user.id)
        .eq('exam_status', 'completed')
        .neq('exam.global_status', 'Hidden');

      const stats = {
        diagnosticPassed: false,
        coreSubjectsPassed: new Set<string>(),
        adaptivePassedCount: 0,
        fullLengthPassed: false,
      };

      if (!attemptsError && attempts && attempts.length > 0) {
        // Group by exam_id to apply grading logic
        const groupedAttempts = attempts.reduce((acc, curr) => {
          if (!acc[curr.exam_id]) acc[curr.exam_id] = [];
          acc[curr.exam_id].push(curr);
          return acc;
        }, {} as Record<string, any[]>);

        Object.keys(groupedAttempts).forEach(examId => {
          const group = groupedAttempts[examId];
          group.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
          
          const examData = group[0].exam;
          const logic = examData?.grading_logic || 'highest';
          const title = (examData?.exam_title || '').toLowerCase();
          const subject = examData?.exam_subject || '';
          
          // Pull the dynamic passing score set by the teacher (fallback to 60 if missing)
          const passingTarget = examData?.passing_score || 60;
          
          let calculatedScore = 0;
          if (logic === 'highest') calculatedScore = Math.max(...group.map(a => a.final_score || 0));
          else if (logic === 'average') calculatedScore = group.reduce((s, a) => s + (a.final_score || 0), 0) / group.length;
          else calculatedScore = group[0].final_score || 0; // 'latest'

          // The Progress Engine Evaluator (Uses the specific exam's passing score)
          if (calculatedScore >= passingTarget) {
            if (title.includes('diagnostic')) {
              stats.diagnosticPassed = true;
            } else if (title.includes('full length') || title.includes('board simulation')) {
              stats.fullLengthPassed = true;
            } else if (CORE_SUBJECTS.includes(subject)) {
              stats.coreSubjectsPassed.add(subject);
            }
            
            // Count any non-diagnostic, non-full-length exam towards the adaptive pool
            if (!title.includes('diagnostic') && !title.includes('full length') && !title.includes('board simulation')) {
              stats.adaptivePassedCount++;
            }
          }
        });
      }

      const coreArray = Array.from(stats.coreSubjectsPassed);
      setProgressStats({
        diagnosticPassed: stats.diagnosticPassed,
        coreSubjectsPassed: coreArray,
        adaptivePassedCount: stats.adaptivePassedCount,
        fullLengthPassed: stats.fullLengthPassed,
      });

      // 3. Automatic Phase Progression Logic
      let updatedPhase = dbPhase;

      if (dbPhase === 1 && stats.diagnosticPassed) updatedPhase = 2;
      else if (dbPhase === 2 && coreArray.length >= 4) updatedPhase = 3;
      else if (dbPhase === 3 && stats.adaptivePassedCount >= 3) updatedPhase = 4;
      else if (dbPhase === 4 && stats.fullLengthPassed) updatedPhase = 5;

      if (updatedPhase > dbPhase) {
        await supabase
          .from('Roadmap Progress')
          .upsert({ 
            student_id: user.id, 
            current_phase: updatedPhase 
          }, { 
            onConflict: 'student_id' 
          });
          
        dbPhase = updatedPhase;
        setShowCelebration(true);
      }

      setCurrentDbPhase(dbPhase);
      setExpandedPhase(dbPhase);
      setIsLoading(false);
    };

    fetchProgressAndEvaluate();
  }, []);

  const baseSteps = [
    { step: 1, title: 'Diagnostic Baseline', description: 'Establish foundational knowledge metrics.', content: 'Your first objective is to take and pass the initial Diagnostic Assessment to map your starting knowledge.' },
    { step: 2, title: 'Core Subject Drills', description: 'Complete dedicated modules for all major board topics.', content: 'Focus on individual subjects. You must pass one assessment in each of the 4 core domains.' },
    { step: 3, title: 'Adaptive Simulation', description: 'Surpass the passing threshold on dynamic exams.', content: `Active Goal requires you to pass three dynamic exams. Current progress is ${progressStats.adaptivePassedCount} out of 3 completed.` },
    { step: 4, title: 'Full Length Board Simulation', description: 'Simulate the exact timing and constraints of the actual PRC exam.', content: 'You are ready for the final test. Take and pass the Full Length Board Simulation to get certified.' },
    { step: 5, title: 'PRC Board Readiness Certified', description: 'Final clearance badge achieved.', content: 'Congratulations. You have completed the entire roadmap and are certified ready for the PRC Board Exam.' },
  ];

  const roadmapSteps = baseSteps.map(step => ({
    ...step,
    completed: currentDbPhase > step.step,
    current: currentDbPhase === step.step,
    isLocked: step.step > currentDbPhase
  }));

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-slate-500 font-bold">Syncing roadmap progress...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative pb-24">
      <h1 className="text-2xl font-bold text-slate-800">Interactive Progress Roadmap</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6 font-bold">Monitor your milestone progression mapped directly against the official board exam syllabus.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        <div className="lg:col-span-2 bg-white p-8 md:p-12 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative ml-2">
            {roadmapSteps.map((step, index) => (
              <div 
                key={step.step} 
                className={`relative pl-12 pb-10 last:pb-0 ${step.isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer group'}`}
                onClick={() => {
                  if (!step.isLocked) setExpandedPhase(expandedPhase === step.step ? 0 : step.step);
                }}
              >
                {index !== roadmapSteps.length - 1 && (
                  <div className={`absolute left-[11px] top-8 bottom-0 w-0.5 ${step.completed ? 'bg-emerald-200' : 'bg-slate-200'}`}></div>
                )}
                
                <div className={`absolute left-0 top-1 h-6 w-6 rounded-full border-4 flex items-center justify-center transition-all ${
                  step.completed ? 'bg-emerald-500 border-emerald-200' : 
                  step.current ? 'bg-blue-600 border-blue-200 animate-pulse' : 
                  'bg-slate-200 border-slate-100 group-hover:border-slate-300'
                }`} />
                
                <div className="transition-all">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold uppercase tracking-wider ${step.completed ? 'text-emerald-600' : step.current ? 'text-blue-600' : 'text-slate-400'}`}>
                      Milestone Phase {step.step} {step.current && '(Active Target)'} {step.isLocked && '(Locked)'}
                    </span>
                    
                    {step.isLocked ? (
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ) : (
                      <svg className={`w-4 h-4 transition-transform ${expandedPhase === step.step ? 'rotate-180 text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center pr-4">
                    <h3 className={`text-lg font-bold mt-1 transition-colors ${step.isLocked ? 'text-slate-500' : 'text-slate-800 group-hover:text-blue-600'}`}>
                      {step.title}
                    </h3>
                  </div>
                  
                  <p className="text-sm text-slate-500 mt-1 max-w-lg leading-relaxed font-bold">{step.description}</p>
                  
                  {expandedPhase === step.step && !step.isLocked && (
                    <div className="mt-4 p-5 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-700 font-bold leading-relaxed shadow-inner animate-in fade-in slide-in-from-top-2">
                      {step.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* DYNAMIC SIDEBAR CHECKLIST */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-800 border-b border-slate-100 pb-2 mb-3">Roadmap Logic</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-bold">
              Passing any simulation unlocks the next phase. Failing items triggers automatic AI updates.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-800">Active Target Requirements</h3>
            <p className="text-sm text-slate-500 mt-2 font-bold">To clear Phase {currentDbPhase} you must achieve the following specific goals.</p>
            
            <ul className="mt-5 space-y-4 text-sm text-slate-600 font-bold">
              
              {currentDbPhase === 1 && (
                <li className="flex items-start gap-3">
                  <span className={progressStats.diagnosticPassed ? "text-emerald-500 mt-0.5" : "text-blue-500 mt-0.5"}>
                    {progressStats.diagnosticPassed ? '✓' : '●'}
                  </span> 
                  <span className={progressStats.diagnosticPassed ? 'text-emerald-700' : ''}>
                    Pass an exam titled "Diagnostic".
                  </span>
                </li>
              )}

              {currentDbPhase === 2 && CORE_SUBJECTS.map(subj => {
                const isPassed = progressStats.coreSubjectsPassed.includes(subj);
                return (
                  <li key={subj} className="flex items-start gap-3">
                    <span className={isPassed ? "text-emerald-500 mt-0.5" : "text-blue-500 mt-0.5"}>
                      {isPassed ? '✓' : '●'}
                    </span> 
                    <span className={isPassed ? 'text-emerald-700 line-through opacity-70' : ''}>
                      Pass {subj}
                    </span>
                  </li>
                );
              })}

              {currentDbPhase === 3 && (
                <>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 mt-0.5">●</span> 
                    Complete a minimum of 3 dynamic exams.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 mt-0.5">●</span> 
                    Achieve the designated passing score on each assessment.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 mt-0.5">●</span> 
                    Current Progress: <span className={progressStats.adaptivePassedCount >= 3 ? "text-emerald-600" : "text-amber-600"}>{progressStats.adaptivePassedCount} / 3</span>
                  </li>
                </>
              )}

              {currentDbPhase === 4 && (
                <li className="flex items-start gap-3">
                  <span className={progressStats.fullLengthPassed ? "text-emerald-500 mt-0.5" : "text-blue-500 mt-0.5"}>
                    {progressStats.fullLengthPassed ? '✓' : '●'}
                  </span> 
                  <span className={progressStats.fullLengthPassed ? 'text-emerald-700' : ''}>
                    Pass a "Full Length" or "Board Simulation" exam.
                  </span>
                </li>
              )}

              {currentDbPhase === 5 && (
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-0.5">✓</span> 
                  <span className="text-emerald-700">All requirements met. You are Board Ready.</span>
                </li>
              )}

            </ul>
          </div>
        </div>
      </div>

      {showCelebration && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center relative overflow-hidden animate-in zoom-in duration-300">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-blue-500"></div>
            
            <div className="text-6xl mb-4 animate-bounce mt-4">🎉</div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Phase Completed!</h2>
            <p className="text-slate-600 font-bold text-sm mb-8 leading-relaxed">
              Outstanding work. You have successfully cleared the requirements for Phase {currentDbPhase - 1} and unlocked your next milestone.
            </p>
            
            <button 
              onClick={() => setShowCelebration(false)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-md"
            >
              Continue Journey
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
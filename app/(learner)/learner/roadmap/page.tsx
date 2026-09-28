'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function RoadmapPage() {
  const [currentDbPhase, setCurrentDbPhase] = useState<number>(1);
  const [expandedPhase, setExpandedPhase] = useState<number>(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [passedExamsCount, setPassedExamsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

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

      // 2. Fetch real student attempts to dynamically evaluate Phase 3 progress
      // Graveyard Enforcer: Ignore 'Hidden' exams
      const { data: attempts, error: attemptsError } = await supabase
        .from('Student Attempts')
        .select(`
          attempt_id,
          final_score,
          completed_at,
          exam_id,
          exam:Exams!inner ( global_status, grading_logic )
        `)
        .eq('student_id', user.id)
        .eq('exam_status', 'completed')
        .neq('exam.global_status', 'Hidden');

      let validPassCount = 0;

      if (!attemptsError && attempts && attempts.length > 0) {
        // Group by exam_id to apply grading logic
        const groupedAttempts = attempts.reduce((acc, curr) => {
          if (!acc[curr.exam_id]) acc[curr.exam_id] = [];
          acc[curr.exam_id].push(curr);
          return acc;
        }, {} as Record<string, any[]>);

        Object.keys(groupedAttempts).forEach(examId => {
          const group = groupedAttempts[examId];
          // Sort by newest first to easily grab 'latest'
          group.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
          
          const logic = group[0].exam?.grading_logic || 'highest';
          let calculatedScore = 0;

          if (logic === 'highest') {
            calculatedScore = Math.max(...group.map(a => a.final_score || 0));
          } else if (logic === 'average') {
            const sum = group.reduce((s, a) => s + (a.final_score || 0), 0);
            calculatedScore = sum / group.length;
          } else {
            // 'latest'
            calculatedScore = group[0].final_score || 0;
          }

          // Check if this specific exam meets the 75% passing threshold
          if (calculatedScore >= 75) {
            validPassCount++;
          }
        });
      }

      setPassedExamsCount(validPassCount);

      // 3. Automatic Phase Progression Logic (If they hit the goal for Phase 3)
      if (dbPhase === 3 && validPassCount >= 3) {
        const { error: updateError } = await supabase
          .from('Roadmap Progress')
          .update({ current_phase: 4 })
          .eq('student_id', user.id);

        if (!updateError) {
          dbPhase = 4;
          setShowCelebration(true);
        }
      }

      setCurrentDbPhase(dbPhase);
      setExpandedPhase(dbPhase);
      setIsLoading(false);
    };

    fetchProgressAndEvaluate();
  }, []);

  const baseSteps = [
    { step: 1, title: 'Diagnostic Baseline', description: 'Establish foundational knowledge metrics.', content: 'You scored an average of 72 percent on your baseline diagnostic. Your strongest area was Psychological Assessment.' },
    { step: 2, title: 'Core Subject Drills', description: 'Complete dedicated modules for all major board topics.', content: 'All four core subject drills are completed. You are well prepared for the dynamic simulations.' },
    { step: 3, title: 'Adaptive Simulation', description: 'Surpass a passing threshold on dynamic exams.', content: `Active Goal requires you to score 75 percent or higher on three dynamic exams. Current progress is ${passedExamsCount} out of 3 completed.` },
    { step: 4, title: 'Full Length Board Simulation', description: 'Simulate the exact timing and constraints of the actual PRC exam.', content: 'This section is locked. Please clear Phase 3 to access the eight hour mock board simulation.' },
    { step: 5, title: 'PRC Board Readiness Certified', description: 'Final clearance badge achieved.', content: 'This section is locked. Achieve a passing mark on the Full Length Simulation to get certified.' },
  ];

  const roadmapSteps = baseSteps.map(step => ({
    ...step,
    completed: currentDbPhase > step.step,
    current: currentDbPhase === step.step
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
                className="relative pl-12 pb-10 last:pb-0 cursor-pointer group"
                onClick={() => setExpandedPhase(expandedPhase === step.step ? 0 : step.step)}
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
                      Milestone Phase {step.step} {step.current && '(Active Target)'}
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${expandedPhase === step.step ? 'rotate-180 text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  
                  <div className="flex justify-between items-center pr-4">
                    <h3 className="text-lg font-bold text-slate-800 mt-1 group-hover:text-blue-600 transition-colors">{step.title}</h3>
                  </div>
                  
                  <p className="text-sm text-slate-500 mt-1 max-w-lg leading-relaxed font-bold">{step.description}</p>
                  
                  {expandedPhase === step.step && (
                    <div className="mt-4 p-5 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-700 font-bold leading-relaxed shadow-inner">
                      {step.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-800 border-b border-slate-100 pb-2 mb-3">Roadmap Logic</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-bold">
              Passing any simulation unlocks the next phase. Failing items triggers automatic AI updates.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-800">Active Target Requirements</h3>
            <p className="text-sm text-slate-500 mt-2 font-bold">To clear Phase 3 you must achieve the following specific goals.</p>
            <ul className="mt-5 space-y-4 text-sm text-slate-600 font-bold">
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">●</span> 
                Complete a minimum of 3 dynamic exams.
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">●</span> 
                Secure a score of 75 percent or higher on each assessment.
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">●</span> 
                Current Progress: <span className={passedExamsCount >= 3 ? "text-emerald-600" : "text-amber-600"}>{passedExamsCount} / 3</span>
              </li>
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
              Outstanding work. You have successfully cleared the Adaptive Simulation phase by passing 3 rigorous assessments. You have unlocked the Full Length Board Simulation.
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
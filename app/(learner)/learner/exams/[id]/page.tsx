'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';

export default function LearnerExamDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const [examData, setExamData] = useState<any>(null);
  const [attemptsData, setAttemptsData] = useState<any[]>([]);

  useEffect(() => {
    const fetchDetails = async () => {
      const examId = params?.id as string;
      if (!examId) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addToast("Authentication required.", "error");
        router.push('/login');
        return;
      }

      // Fetch Exam Rules
      const { data: exam, error } = await supabase
        .from('Exams')
        .select('exam_id, exam_title, exam_subject, schedule_end, time_limit_mins, max_attempts, grading_logic, global_status, close_after_deadline')
        .eq('exam_id', examId)
        .single();

      if (error || !exam) {
        addToast('Failed to load exam details.', 'error');
        router.push('/learner/exams');
        return;
      }

      // Fetch Past Attempts for this specific student
      const { data: attempts } = await supabase
        .from('Student Attempts')
        .select('final_score')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .order('completed_at', { ascending: true });

      setExamData(exam);
      setAttemptsData(attempts || []);
      setIsLoading(false);
    };

    fetchDetails();
  }, [params, router, addToast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 space-y-4">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-sm text-slate-500 font-bold">Loading exam details...</p>
      </div>
    );
  }

  const attemptsCompleted = attemptsData.length;
  const maxAttempts = examData?.max_attempts || 1;
  const attemptsRemaining = Math.max(0, maxAttempts - attemptsCompleted);

  // Evaluate Retake Rules
  let allowRetake = true;
  let blockReason = "";

  if (examData?.global_status !== 'Active') {
    allowRetake = false;
    blockReason = "Exam is no longer active";
  } else if (examData?.close_after_deadline && examData?.schedule_end) {
    if (Date.now() > new Date(examData.schedule_end).getTime()) {
      allowRetake = false;
      blockReason = "Deadline has passed";
    }
  }
  if (attemptsCompleted >= maxAttempts) {
    allowRetake = false;
    blockReason = "Max attempts reached";
  }

  // Calculate current score if they have taken it at least once
  let calculatedFinalGrade = 0;
  if (attemptsCompleted > 0) {
    const scores = attemptsData.map(a => a.final_score || 0);
    if (examData?.grading_logic === 'highest') calculatedFinalGrade = Math.max(...scores);
    else if (examData?.grading_logic === 'latest') calculatedFinalGrade = scores[scores.length - 1];
    else if (examData?.grading_logic === 'average') calculatedFinalGrade = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  const gradingLogicLabel = examData?.grading_logic === 'highest' ? 'Highest Score' : examData?.grading_logic === 'latest' ? 'Latest Score' : 'Average Score';
  const deadlineDate = examData?.schedule_end ? new Date(examData.schedule_end) : null;
  const formattedDeadline = deadlineDate 
    ? `${deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${deadlineDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'No Closing Deadline';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 pt-6">
      
      <div className="flex items-center gap-2 text-sm mb-4">
        <button onClick={() => router.push('/learner/exams')} className="text-blue-600 hover:underline font-bold">Scheduled Mock Exams</button>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600 font-bold">Exam Details</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full">
        <div className="bg-slate-50 border-b border-slate-200 p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-800">
              {examData?.exam_title}
            </h2>
            <p className="text-slate-500 mt-3 text-sm font-bold">
              Review the exam details and your current progress below before starting.
            </p>
          </div>
          
          {attemptsCompleted > 0 && (
            <div className="bg-white border border-slate-200 px-6 py-3 rounded-xl shadow-sm text-center min-w-[140px]">
              <span className="text-3xl font-black text-blue-600 block leading-none">{calculatedFinalGrade}%</span>
              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mt-1 block">Current Final Score</span>
            </div>
          )}
        </div>

        <div className="p-8 md:p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Subject</h4>
              <p className="text-slate-800 font-bold text-lg">{examData?.exam_subject || 'General Comprehensive'}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Duration</h4>
              <p className="text-slate-800 font-bold text-lg">{examData?.time_limit_mins || 60} Minutes</p>
            </div>
            
            <div className="md:col-span-2 pt-6 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Deadline</h4>
              <p className="text-slate-800 font-bold text-lg">{formattedDeadline}</p>
            </div>

            <div className="md:col-span-2 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Attempt Limits</h4>
                <p className="text-slate-800 font-bold text-lg">{attemptsCompleted} / {maxAttempts} Attempts Completed</p>
                <p className="text-sm font-bold text-blue-600 mt-1">{attemptsRemaining} Attempts Remaining</p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Grading Rule</h4>
                <p className="text-slate-800 font-bold text-lg capitalize">{gradingLogicLabel}</p>
                <p className="text-sm font-bold text-slate-500 mt-1">Determines your final dashboard grade</p>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 flex justify-end">
            {allowRetake ? (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-lg"
              >
                Start Attempt {attemptsCompleted + 1}
              </button>
            ) : (
              <div className="w-full sm:w-auto px-8 py-4 bg-slate-100 text-slate-500 font-bold rounded-lg border border-slate-200 shadow-sm text-center cursor-not-allowed text-lg">
                Cannot Take Exam ({blockReason})
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800">
                Ready to begin?
              </h3>
            </div>
            <p className="text-sm text-slate-600 font-bold mb-6 pl-13">
              Once you start the examination, the timer cannot be paused.
              Ensure you have a stable connection and enough time to complete
              the entire simulation.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => router.push(`/learner/exams/${examData.exam_id}/take`)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
              >
                Confirm and Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
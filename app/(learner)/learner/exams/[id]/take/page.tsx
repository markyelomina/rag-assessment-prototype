'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LearnerActiveExamPage() {
  const router = useRouter();
  const params = useParams();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [examTitle, setExamTitle] = useState('Loading Exam...');
  const [timeLeft, setTimeLeft] = useState(0);

  const mockQuestions = [
    { id: 1, text: 'Which of the following is considered a negative symptom of schizophrenia?', options: ['Delusions', 'Hallucinations', 'Avolition', 'Disorganized speech'] },
    { id: 2, text: 'What is the primary difference between Bipolar I and Bipolar II?', options: ['Presence of major depressive episodes', 'Presence of a full manic episode', 'Age of onset', 'Response to lithium'] },
    { id: 3, text: 'Which brain structure is most heavily implicated in the consolidation of new explicit memories?', options: ['Amygdala', 'Hippocampus', 'Basal Ganglia', 'Cerebellum'] },
    { id: 4, text: 'Which therapeutic approach emphasizes unconditional positive regard?', options: ['Cognitive Behavioral Therapy', 'Psychoanalysis', 'Person-Centered Therapy', 'Gestalt Therapy'] },
    { id: 5, text: 'In experimental research, the variable that is manipulated by the researcher is known as the:', options: ['Dependent variable', 'Confounding variable', 'Control variable', 'Independent variable'] },
  ];

  useEffect(() => {
    const fetchExamDetails = async () => {
      const examId = params?.id as string; 
      if (!examId) return;

      const { data: exam, error } = await supabase
        .from('Exams')
        .select('exam_title, time_limit_mins')
        .eq('exam_id', examId)
        .single();

      if (error || !exam) {
        console.error("Failed to load exam details");
        setExamTitle('Error Loading Exam');
        return;
      }

      setExamTitle(exam.exam_title);
      
      const storageKey = `exam_endtime_${examId}`;
      const storedEndTime = sessionStorage.getItem(storageKey);
      
      let endTime: number;
      if (storedEndTime) {
        endTime = parseInt(storedEndTime, 10);
      } else {
        const durationMs = (exam.time_limit_mins || 60) * 60 * 1000;
        endTime = Date.now() + durationMs;
        sessionStorage.setItem(storageKey, endTime.toString());
      }

      const calculatedTimeLeft = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(calculatedTimeLeft);
      setIsLoading(false);
    };

    fetchExamDetails();
  }, [params]);

  useEffect(() => {
    if (isLoading || isSubmitting || showTimeUpModal) return;

    const examId = params?.id as string;
    const storageKey = `exam_endtime_${examId}`;

    const timerInterval = setInterval(() => {
      const storedEndTime = sessionStorage.getItem(storageKey);
      
      if (storedEndTime) {
        const endTime = parseInt(storedEndTime, 10);
        const newTimeLeft = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        
        if (newTimeLeft <= 0) {
          clearInterval(timerInterval);
          setTimeLeft(0);
          setShowTimeUpModal(true);
          setShowSubmitModal(false);
        } else {
          setTimeLeft(newTimeLeft);
        }
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [isLoading, isSubmitting, showTimeUpModal, params]);

  useEffect(() => {
    if (showTimeUpModal && !isSubmitting) {
      const autoSubmitTimer = setTimeout(() => {
        handleFinalSubmit();
      }, 5000); 
      
      return () => clearTimeout(autoSubmitTimer);
    }
  }, [showTimeUpModal, isSubmitting]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (option: string) => {
    setAnswers({
      ...answers,
      [mockQuestions[currentQuestionIndex].id]: option
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < mockQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setShowSubmitModal(false);
    setShowTimeUpModal(false);

    const examId = params?.id as string;
    sessionStorage.removeItem(`exam_endtime_${examId}`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      router.push('/learner/performance');
    } catch (error) {
      console.error('Failed to submit exam');
      setIsSubmitting(false);
    }
  };

  const currentQuestion = mockQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === mockQuestions.length - 1;
  const progressPercentage = ((currentQuestionIndex + 1) / mockQuestions.length) * 100;
  const isTimeLow = timeLeft > 0 && timeLeft < 300; 

  return (
    <div className="min-h-screen flex flex-col">
      
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="font-bold text-slate-800 text-lg">{examTitle}</h1>
          <p className="text-xs text-slate-500 font-bold">Do not refresh or close this browser window.</p>
        </div>
        
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold shadow-sm border ${
          timeLeft === 0 ? 'bg-red-600 border-red-700 text-white' :
          isTimeLow ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 
          'bg-slate-100 border-slate-200 text-slate-700'
        }`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatTime(timeLeft)}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col lg:flex-row gap-8">
        
        <div className="flex-1 flex flex-col">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Question {currentQuestionIndex + 1} of {mockQuestions.length}
              </span>
              <span className="text-xs font-bold text-blue-600">
                {Object.keys(answers).length} Answered
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-slate-800 mb-8 leading-relaxed">
              {currentQuestion.text}
            </h2>

            <div className="space-y-4 flex-1">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = answers[currentQuestion.id] === option;
                return (
                  <label 
                    key={idx} 
                    className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name={`question-${currentQuestion.id}`}
                      value={option}
                      checked={isSelected}
                      onChange={() => handleOptionSelect(option)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                    />
                    <span className={`ml-4 text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                      {option}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center mt-6">
            <button 
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className="px-6 py-3 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {isLastQuestion ? (
              <button 
                onClick={() => setShowSubmitModal(true)}
                className="px-8 py-3 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Finish and Submit
              </button>
            ) : (
              <button 
                onClick={handleNext}
                className="px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Next Question
              </button>
            )}
          </div>
        </div>

        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-24">
            <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b border-slate-100 pb-2">
              Question Navigator
            </h3>
            
            <div className="grid grid-cols-5 gap-2 mb-6">
              {mockQuestions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = currentQuestionIndex === idx;
                
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`h-10 w-10 rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-sm ${
                      isCurrent ? 'ring-2 ring-blue-600 bg-blue-50 text-blue-800' :
                      isAnswered ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-blue-600"></div>
                <span className="text-xs font-bold text-slate-600">Answered</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-slate-100 border border-slate-200"></div>
                <span className="text-xs font-bold text-slate-600">Not Answered</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-blue-50 ring-2 ring-blue-600"></div>
                <span className="text-xs font-bold text-slate-600">Current Question</span>
              </div>
            </div>

            <button 
              onClick={() => setShowSubmitModal(true)}
              className="w-full mt-6 py-2.5 bg-emerald-100 text-emerald-800 text-sm font-bold rounded-lg hover:bg-emerald-200 transition-colors"
            >
              Submit Exam Now
            </button>
          </div>
        </div>

      </main>

      {showSubmitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Submit Exam</h3>
            <p className="text-sm text-slate-600 font-bold mb-6">
              Are you sure you are ready to submit? You have answered {Object.keys(answers).length} out of {mockQuestions.length} questions. You cannot change your answers after submission.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
              >
                Return to Exam
              </button>
              <button 
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-sm"
              >
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}

      {showTimeUpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Time is Up!</h3>
            <p className="text-sm text-slate-600 font-bold mb-6">
              The allotted time for this exam has expired. Your current answers are being automatically submitted.
            </p>
            <button 
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              Acknowledge & Submit
            </button>
          </div>
        </div>
      )}
      
      {isSubmitting && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
           <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           <p className="text-slate-800 font-bold text-lg">Saving your answers</p>
           <p className="text-slate-500 font-bold text-sm mt-1">Please do not close the browser</p>
        </div>
      )}
    </div>
  );
}
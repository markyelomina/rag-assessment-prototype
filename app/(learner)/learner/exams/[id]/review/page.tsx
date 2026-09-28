'use client';

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/ToastContext";

interface ReviewItem {
  qNum: number;
  text: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  options: string[];
}

interface AttemptRecord {
  attemptId: string;
  score: number;
  status: string;
  items: ReviewItem[];
}

const normalizeForComparison = (str: string) => {
  return String(str || '')
    .replace(/^[\\"'“”\[\]]+|[\\"'“”\[\]]+$/g, '')
    .trim()
    .toLowerCase();
};

export default function ExamReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { addToast } = useToast();
  
  const [activeAttemptIndex, setActiveAttemptIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const [examTitle, setExamTitle] = useState("");
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);

  // Retake State Logic
  const [canRetake, setCanRetake] = useState(false);
  const [retakeMessage, setRetakeMessage] = useState("");

  useEffect(() => {
    const fetchExamAndResults = async () => {
      const examId = params?.id as string;
      if (!examId) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Fetch Exam Details & Rules
      const { data: examData, error: examError } = await supabase
        .from("Exams")
        .select("exam_title, global_status, max_attempts, close_after_deadline, schedule_end")
        .eq("exam_id", examId)
        .single();
        
      if (examError || !examData) {
        addToast("Failed to load exam details.", "error");
        router.push('/learner/performance');
        return;
      }

      // GRAVEYARD LOCKOUT: Reject access if the exam is Hidden
      if (examData.global_status === 'Hidden') {
        addToast("This exam's records are currently unavailable.", "error");
        router.push('/learner/performance');
        return;
      }

      setExamTitle(examData.exam_title);

      // 2. Fetch Attempts
      const { data: attemptsData, error: attemptsError } = await supabase
        .from("Student Attempts")
        .select(`
          attempt_id,
          final_score,
          exam_status,
          completed_at
        `)
        .eq("exam_id", examId)
        .eq("student_id", user.id)
        .order("completed_at", { ascending: true });

      if (attemptsError || !attemptsData || attemptsData.length === 0) {
        setIsLoading(false);
        return;
      }

      // 3. Evaluate Retake Eligibility based on new rules
      let allowRetake = true;
      let blockReason = "";

      if (examData.global_status !== 'Active') {
        allowRetake = false;
        blockReason = "Exam is no longer active";
      } else if (examData.close_after_deadline && examData.schedule_end) {
        const deadline = new Date(examData.schedule_end).getTime();
        if (Date.now() > deadline) {
          allowRetake = false;
          blockReason = "Deadline has passed";
        }
      }

      if (attemptsData.length >= (examData.max_attempts || 1)) {
        allowRetake = false;
        blockReason = "Max attempts reached";
      }

      setCanRetake(allowRetake);
      setRetakeMessage(blockReason);

      // 4. Load Review Data
      const formattedAttempts: AttemptRecord[] = await Promise.all(
        attemptsData.map(async (attempt) => {
          const { data: answersData } = await supabase
            .from("Student Answers")
            .select(`
              selected_option,
              is_correct,
              rag_feedback,
              "Mock Exam Items" ( question, correct_answer, rationale, options )
            `)
            .eq("attempt_id", attempt.attempt_id);

          const items: ReviewItem[] = (answersData || []).map((ans, idx) => {
            const rawMockItem = ans["Mock Exam Items"];
            const mockItem = Array.isArray(rawMockItem) ? rawMockItem[0] : rawMockItem;
            
            let parsedOptions: string[] = [];
            let mappedCorrectAnswer = String(mockItem?.correct_answer || "N/A").trim();
            
            try {
              let raw = mockItem?.options;
              while (typeof raw === 'string') {
                raw = JSON.parse(raw);
              }
              
              if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
                parsedOptions = Object.values(raw).map(opt => String(opt));
                if (raw[mappedCorrectAnswer.toUpperCase()]) {
                  mappedCorrectAnswer = String(raw[mappedCorrectAnswer.toUpperCase()]);
                }
              } else if (Array.isArray(raw)) {
                parsedOptions = raw.map(opt => String(opt));
                if (mappedCorrectAnswer.length === 1 && /^[A-Z]$/i.test(mappedCorrectAnswer)) {
                  const charIdx = mappedCorrectAnswer.toUpperCase().charCodeAt(0) - 65;
                  if (parsedOptions[charIdx]) mappedCorrectAnswer = parsedOptions[charIdx];
                }
              }
            } catch (e) {
              console.error("Failed to parse options for review", e);
            }

            const cleanCorrectAnswer = mappedCorrectAnswer.replace(/^["']|["']$/g, '').trim();
            const cleanStudentAnswer = String(ans.selected_option || "No Answer Selected").replace(/^["']|["']$/g, '').trim();

            return {
              qNum: idx + 1,
              text: mockItem?.question || "Question data unavailable",
              studentAnswer: cleanStudentAnswer,
              correctAnswer: cleanCorrectAnswer,
              isCorrect: ans.is_correct,
              explanation: mockItem?.rationale || ans.rag_feedback || "No explanation provided for this item.",
              options: parsedOptions,
            };
          });

          return {
            attemptId: attempt.attempt_id,
            score: attempt.final_score || 0,
            status: attempt.exam_status,
            items: items,
          };
        })
      );

      setAttempts(formattedAttempts);
      setActiveAttemptIndex(formattedAttempts.length > 0 ? formattedAttempts.length - 1 : 0);
      setIsLoading(false);
    };

    fetchExamAndResults();
  }, [params, router, addToast]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-slate-500 font-bold">Loading review dashboard...</p>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
        No completed attempts found for this exam.
      </div>
    );
  }

  const currentAttempt = attempts[activeAttemptIndex];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-2 text-sm mb-4">
        <button
          onClick={() => router.push('/learner/exams')}
          className="text-blue-600 hover:underline font-bold"
        >
          Scheduled Mock Exams
        </button>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600 font-bold">Post-Exam Analytics</span>
      </div>

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {examTitle} Results
          </h2>
          <p className="text-sm text-slate-500 font-bold mt-1">
            Review your absolute response accuracy metrics below.
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          {canRetake ? (
            <button
              onClick={() => router.push(`/learner/exams/${params?.id}/take`)}
              className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
            >
              Start New Attempt
            </button>
          ) : (
            <div 
              className="w-full md:w-auto px-6 py-3 bg-slate-100 text-slate-500 text-sm font-bold rounded-lg border border-slate-200 shadow-sm whitespace-nowrap cursor-not-allowed text-center"
            >
              Cannot Retake ({retakeMessage})
            </div>
          )}
          
          <div className="w-full md:w-auto bg-slate-50 border border-slate-200 p-4 rounded-lg text-center min-w-[140px]">
            <span className="text-3xl font-black text-blue-600 block">
              {currentAttempt.score}%
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Achieved Mark
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mt-8">
          <h3 className="font-bold text-slate-800 text-lg">
            Review Deck
          </h3>
          {attempts.length > 1 && (
            <div className="flex gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {attempts.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveAttemptIndex(idx)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                    activeAttemptIndex === idx 
                      ? "bg-white text-blue-700 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Attempt {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {currentAttempt.items.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-bold bg-white border border-slate-200 rounded-xl">
            No answer data could be loaded for this attempt.
          </div>
        ) : (
          <div className="grid gap-6">
            {currentAttempt.items.map((item) => (
              <div
                key={item.qNum}
                className={`p-6 border rounded-xl bg-white shadow-sm flex flex-col gap-3 border-l-4 transition-all ${
                  item.isCorrect ? "border-l-emerald-500" : "border-l-rose-500"
                }`}
              >
                <div className="flex justify-between items-center text-xs font-bold text-slate-400 mb-1">
                  <span className="uppercase tracking-wider">Question {item.qNum}</span>
                  <span
                    className={`px-2 py-1 rounded uppercase tracking-wider ${
                      item.isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {item.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                  </span>
                </div>
                
                <p className="text-base font-bold text-slate-800 leading-relaxed mb-2">
                  {item.text}
                </p>
                
                <div className="space-y-2">
                  {item.options.map((opt, i) => {
                    const isSelected = normalizeForComparison(opt) === normalizeForComparison(item.studentAnswer);
                    const isCorrect = normalizeForComparison(opt) === normalizeForComparison(item.correctAnswer);
                    
                    let baseStyle = "p-3 border rounded-lg text-sm font-bold flex justify-between items-center transition-colors ";
                    
                    if (isSelected && isCorrect) {
                      baseStyle += "bg-emerald-100 border-emerald-300 text-emerald-900";
                    } else if (isSelected && !isCorrect) {
                      baseStyle += "bg-rose-100 border-rose-300 text-rose-900";
                    } else if (!isSelected && isCorrect) {
                      baseStyle += "bg-emerald-50/50 border-emerald-300 text-emerald-800 border-dashed";
                    } else {
                      baseStyle += "bg-slate-50 border-slate-200 text-slate-600";
                    }

                    return (
                      <div key={i} className={baseStyle}>
                        <span>{opt}</span>
                        <div className="flex gap-2 text-[10px] uppercase tracking-wider shrink-0">
                          {isSelected && <span>(Your Answer)</span>}
                          {isCorrect && <span>(Correct Answer)</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg mt-3 flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">🧠</span>
                  <div>
                    <span className="block text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-1">
                      AI-Generated Rationale
                    </span>
                    <p className="text-sm text-blue-950 font-bold leading-relaxed">
                      {item.explanation}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
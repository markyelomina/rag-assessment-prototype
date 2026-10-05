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
  topic: string;
  citations: string;
}

interface AttemptRecord {
  attemptId: string;
  score: number;
  rawScore: number;
  maxScore: number;
  status: string;
  takenAt: string;
  items: ReviewItem[];
}

const normalizeForComparison = (str: string) => {
  return String(str || '')
    .replace(/^[\\"'“”\[\]]+|[\\"'“”\[\]]+$/g, '')
    .trim()
    .toLowerCase();
};

const formatAttemptDate = (isoString: string) => {
  if (!isoString) return 'Pending';
  const d = new Date(isoString);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
};

const formatCitations = (rawCitations: any): string => {
  if (!rawCitations) return 'No citation provided';

  let parsed: any = rawCitations;
  try {
    while (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
  } catch (e) {
    return String(rawCitations).replace(/^["']|["']$/g, '').trim();
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    if (typeof parsed === 'string') return parsed;
    return 'No citation provided';
  }

  const docMap: Record<string, Set<number>> = {};

  parsed.forEach((item: any) => {
    if (!item) return;
    let src = item.source || item.document || item.doc || 'Unknown Document';
    src = src.replace(/^\d+[-_]/, '').trim();

    if (!docMap[src]) {
      docMap[src] = new Set<number>();
    }

    if (item.page !== undefined && item.page !== null) {
      const pageNum = Number(item.page);
      if (!isNaN(pageNum)) {
        docMap[src].add(pageNum);
      }
    }
  });

  const formattedDocs = Object.keys(docMap).map((docName) => {
    const pages = Array.from(docMap[docName]).sort((a, b) => a - b);
    if (pages.length > 0) {
      return `${docName}, Pages: ${pages.join(', ')}`;
    }
    return docName;
  });

  return formattedDocs.join(' | ') || 'No citation provided';
};

export default function ExamReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { addToast } = useToast();
  
  const [activeAttemptIndex, setActiveAttemptIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'review' | 'diagnostics'>('review');
  const [isLoading, setIsLoading] = useState(true);
  
  const [examTitle, setExamTitle] = useState("");
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [gradingLogic, setGradingLogic] = useState("highest");
  const [passingScoreTarget, setPassingScoreTarget] = useState(75);

  const [canRetake, setCanRetake] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchExamAndResults = async () => {
      const examId = params?.id as string;
      if (!examId) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Fetch Exam Details
      const { data: examData, error: examError } = await supabase
        .from("Exams")
        .select("exam_title, global_status, max_attempts, close_after_deadline, schedule_end, grading_logic, passing_percentage, passing_score")
        .eq("exam_id", examId)
        .single();
        
      if (examError || !examData) {
        addToast("Failed to load exam details.", "error");
        router.push('/learner/performance');
        return;
      }

      if (examData.global_status === 'Hidden') {
        addToast("This exam's records are currently unavailable.", "error");
        router.push('/learner/performance');
        return;
      }

      setExamTitle(examData.exam_title);
      setMaxAttempts(examData.max_attempts || 1);
      setGradingLogic(examData.grading_logic || "highest");
      setPassingScoreTarget(examData.passing_percentage || examData.passing_score || 75);

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

      // 3. Evaluate Retake Eligibility
      let allowRetake = true;

      if (examData.global_status !== 'Active') {
        allowRetake = false;
      } else if (examData.close_after_deadline && examData.schedule_end) {
        const deadline = new Date(examData.schedule_end).getTime();
        if (Date.now() > deadline) {
          allowRetake = false;
        }
      }

      if (attemptsData.length >= (examData.max_attempts || 1)) {
        allowRetake = false;
      }

      setCanRetake(allowRetake);

      // 4. Load Detailed Review Data
      const formattedAttempts: AttemptRecord[] = await Promise.all(
        attemptsData.map(async (attempt) => {
          const { data: answersData } = await supabase
            .from("Student Answers")
            .select(`
              selected_option,
              is_correct,
              rag_feedback,
              "Mock Exam Items" ( question, correct_answer, rationale, options, competency, citations )
            `)
            .eq("attempt_id", attempt.attempt_id);

          const items: ReviewItem[] = (answersData || []).map((ans, idx) => {
            const rawMockItem = ans["Mock Exam Items"];
            const mockItem = Array.isArray(rawMockItem) ? rawMockItem[0] : rawMockItem;
            
            let parsedOptions: string[] = [];
            let mappedCorrectAnswer = String(mockItem?.correct_answer || "N/A").trim();
            
            try {
              let raw = mockItem?.options;
              while (typeof raw === 'string') raw = JSON.parse(raw);
              
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
              topic: mockItem?.competency || 'General Scope',
              citations: formatCitations(mockItem?.citations)
            };
          });

          return {
            attemptId: attempt.attempt_id,
            score: attempt.final_score || 0,
            rawScore: items.filter(i => i.isCorrect).length,
            maxScore: items.length,
            status: attempt.exam_status,
            takenAt: attempt.completed_at,
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
        <p className="text-sm text-slate-500 font-bold">Loading review dashboard...</p>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
        No completed attempts found for this exam.
      </div>
    );
  }

  // Final Grade Calculation
  let calculatedFinalGrade = 0;
  let finalRawScore = 0;
  let finalMaxScore = 0;

  if (attempts.length > 0) {
    if (gradingLogic === 'highest') {
      const bestAttempt = attempts.reduce((prev, current) => (prev.score > current.score) ? prev : current);
      calculatedFinalGrade = bestAttempt.score;
      finalRawScore = bestAttempt.rawScore;
      finalMaxScore = bestAttempt.maxScore;
    } else if (gradingLogic === 'latest') {
      const latestAttempt = attempts[attempts.length - 1];
      calculatedFinalGrade = latestAttempt.score;
      finalRawScore = latestAttempt.rawScore;
      finalMaxScore = latestAttempt.maxScore;
    } else if (gradingLogic === 'average') {
      calculatedFinalGrade = Math.round(attempts.reduce((sum, att) => sum + att.score, 0) / attempts.length);
      finalRawScore = Math.round(attempts.reduce((sum, att) => sum + att.rawScore, 0) / attempts.length);
      finalMaxScore = attempts[0]?.maxScore || 0;
    }
  }

  const isPassing = calculatedFinalGrade >= passingScoreTarget;
  const scoreBgClass = isPassing ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200';
  const scoreTextClass = isPassing ? 'text-emerald-700' : 'text-rose-700';
  const scoreDividerClass = isPassing ? 'border-emerald-200 text-emerald-600' : 'border-rose-200 text-rose-600';

  const gradingLogicLabel = gradingLogic === 'highest' ? 'Highest Score' : gradingLogic === 'latest' ? 'Latest Score' : 'Average Score';
  const currentAttempt = attempts[activeAttemptIndex];
  const attemptsLeft = Math.max(0, maxAttempts - attempts.length);

  // --- Dynamic Topic Diagnostics Processing ---
  const topicStatsMap: Record<string, { total: number, correct: number, sources: Set<string> }> = {};
  
  currentAttempt.items.forEach(item => {
    if (!topicStatsMap[item.topic]) {
      topicStatsMap[item.topic] = { total: 0, correct: 0, sources: new Set() };
    }
    topicStatsMap[item.topic].total += 1;
    if (item.isCorrect) topicStatsMap[item.topic].correct += 1;
    
    // Split combined citations if multiple are returned in one string
    if (item.citations && item.citations !== 'No citation provided') {
      item.citations.split(' | ').forEach(src => topicStatsMap[item.topic].sources.add(src));
    }
  });

  const diagnosticData = Object.keys(topicStatsMap).map(topic => {
    const stat = topicStatsMap[topic];
    const failed = stat.total - stat.correct;
    const failRate = stat.total > 0 ? (failed / stat.total) * 100 : 0;
    return {
      topic,
      total: stat.total,
      failed,
      correct: stat.correct,
      failRate,
      sources: Array.from(stat.sources)
    };
  }).sort((a, b) => b.failRate - a.failRate);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-2 text-sm mb-4">
        <button onClick={() => router.push('/learner/exams')} className="text-blue-600 hover:underline font-bold">Scheduled Mock Exams</button>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600 font-bold">Post-Exam Analytics</span>
      </div>

      {/* Top Header */}
      <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {examTitle} Results
          </h2>
          <p className="text-xs text-slate-500 font-bold mt-1">
            Grading Rule: <span className="text-blue-600 capitalize">{gradingLogicLabel}</span>
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <div className="flex flex-col items-center sm:items-end w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Attempts Remaining: {attemptsLeft}
            </span>
            {canRetake ? (
              <button
                onClick={() => router.push(`/learner/exams/${params?.id}`)}
                className="w-full sm:w-44 px-0 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm text-center whitespace-nowrap"
              >
                Start Attempt {attempts.length + 1}
              </button>
            ) : (
              <div className="w-full sm:w-44 px-0 py-2.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg border border-slate-200 shadow-sm text-center whitespace-nowrap cursor-not-allowed">
                Cannot Retake
              </div>
            )}
          </div>
          <div className={`w-full sm:w-auto border px-4 py-1.5 rounded-md text-center min-w-[100px] shadow-sm ${scoreBgClass}`}>
            <span className={`text-xl font-black leading-none block ${scoreTextClass}`}>
              {finalRawScore} / {finalMaxScore}
            </span>
            <span className={`text-[8px] uppercase font-bold tracking-wider mt-1 block border-t pt-1 ${scoreDividerClass}`}>
              Final Exam Grade
            </span>
          </div>
        </div>
      </div>

      {/* Shared Dropdown & Tabs Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 gap-4">
        <div className="flex bg-slate-200 p-1 rounded-lg w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('review')}
            className={`flex-1 sm:flex-none px-5 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'review' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Question Review Deck
          </button>
          <button 
            onClick={() => setActiveTab('diagnostics')}
            className={`flex-1 sm:flex-none px-5 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'diagnostics' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Topic Diagnostics
          </button>
        </div>

        {attempts.length > 0 && (
          <div className="relative min-w-[280px] w-full sm:w-auto">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 bg-white flex justify-between items-center transition-colors hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            >
              <span className="uppercase text-xs tracking-wider">
                ATTEMPT {activeAttemptIndex + 1}/{maxAttempts} (SUBMITTED {formatAttemptDate(currentAttempt.takenAt).toUpperCase()})
              </span>
              <svg className={`w-4 h-4 ml-2 transition-transform duration-200 text-slate-500 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)}></div>
                <div className="absolute right-0 z-20 w-full sm:w-[320px] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-2">
                  {attempts.map((att, idx) => {
                    const isSelected = activeAttemptIndex === idx;
                    return (
                      <div 
                        key={idx}
                        onClick={() => { setActiveAttemptIndex(idx); setIsDropdownOpen(false); }}
                        className={`flex justify-between items-center px-4 py-3 cursor-pointer transition-colors border-l-4 ${isSelected ? 'bg-blue-50 border-blue-600' : 'hover:bg-slate-50 border-transparent'}`}
                      >
                        <div>
                          <div className={`text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>Attempt {idx + 1}</div>
                          <div className={`text-xs font-bold mt-0.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>Submitted {formatAttemptDate(att.takenAt)}</div>
                        </div>
                        <div className={`px-2.5 py-1 rounded text-xs font-bold shrink-0 border ${isSelected ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-emerald-100 border-emerald-200 text-emerald-800'}`}>
                          {att.rawScore} / {att.maxScore}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 animate-in fade-in duration-500">
        
        {/* TAB 1: QUESTION REVIEW DECK */}
        {activeTab === 'review' && (
          <>
            {currentAttempt.items.length === 0 ? (
              <div className="p-12 text-center text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded-xl mt-4">
                No answer data could be loaded for this attempt.
              </div>
            ) : (
              <div className="grid gap-6 mt-4">
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
                        className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold ${
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
                            <div className="flex gap-2 text-[10px] uppercase tracking-wider font-bold shrink-0">
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
          </>
        )}

        {/* TAB 2: TOPIC DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div className="mt-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800">Your Competency Diagnostics</h3>
                <p className="text-sm text-slate-500 mt-1 font-bold">Topics from this attempt ranked by difficulty. Review the recommended sources to improve your mastery.</p>
              </div>
              
              <div className="divide-y divide-slate-100">
                {diagnosticData.length === 0 ? (
                  <div className="p-12 text-center text-sm font-bold text-slate-500">
                    No diagnostic data could be generated for this attempt.
                  </div>
                ) : (
                  diagnosticData.map((item, index) => {
                    const statusColor = item.failRate >= 50 ? 'rose' : item.failRate >= 30 ? 'amber' : 'emerald';
                    
                    return (
                      <div key={index} className="p-6 flex flex-col md:flex-row gap-6 hover:bg-slate-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-[10px] px-2.5 py-1 border rounded-md uppercase font-bold tracking-wider bg-${statusColor}-100 text-${statusColor}-700 border-${statusColor}-200`}>
                              {item.failRate >= 50 ? 'Critical Struggle' : item.failRate >= 30 ? 'Needs Review' : 'Mastered'}
                            </span>
                            <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">
                              {item.failed} / {item.total} Questions Missed
                            </span>
                          </div>
                          
                          <p className="text-base font-bold text-slate-800 leading-snug mb-4">{item.topic}</p>
                          
                          <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg">
                            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                              Recommended Study Sources
                            </span>
                            {item.sources.length > 0 ? (
                              <ul className="text-sm font-bold text-blue-950 list-none space-y-2">
                                {item.sources.map((src, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>{src}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm font-bold text-blue-950 italic">No specific sources tagged for this topic.</p>
                            )}
                          </div>
                        </div>

                        <div className="w-full md:w-64 shrink-0 flex items-center">
                          <div className="w-full">
                            <div className="flex justify-between mb-1.5">
                              <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Failure Rate</span>
                              <span className="text-[12px] font-bold text-slate-700">{item.failRate.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-1000 bg-${statusColor}-500`} 
                                style={{ width: `${item.failRate}%` }}
                              ></div>
                            </div>
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

      </div>
    </div>
  );
}
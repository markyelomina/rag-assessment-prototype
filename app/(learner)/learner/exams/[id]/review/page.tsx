'use client';

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ExamReviewPage() {
  const router = useRouter();
  const params = useParams();
  
  const [activeAttempt, setActiveAttempt] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [exam, setExam] = useState<any>(null);

  const reviewItemsAttempt1 = [
    {
      qNum: 1,
      text: "Which symptom is considered a negative symptom of schizophrenia?",
      studentAnswer: "Avolition",
      correctAnswer: "Avolition",
      isCorrect: true,
      explanation: "Avolition represents a restriction in the initiation and persistence of goal-directed behavior, a core negative dimension under DSM-5 parameters.",
    },
    {
      qNum: 2,
      text: "What is the primary feature of Panic Disorder?",
      studentAnswer: "Generalized worry",
      correctAnswer: "Recurrent unexpected panic attacks",
      isCorrect: false,
      explanation: "Panic disorder specifically requires recurrent, unexpected panic attacks followed by at least 1 month of persistent concern about additional attacks.",
    },
  ];

  const reviewItemsAttempt2 = [
    {
      qNum: 1,
      text: "What characterizes Borderline Personality Disorder?",
      studentAnswer: "Instability in relationships",
      correctAnswer: "Instability in relationships",
      isCorrect: true,
      explanation: "BPD is marked by a pervasive pattern of instability in interpersonal relationships, self image, and affects.",
    },
    {
      qNum: 2,
      text: "Which is a common compulsion in OCD?",
      studentAnswer: "Worrying about health",
      correctAnswer: "Repetitive hand washing",
      isCorrect: false,
      explanation: "Compulsions are repetitive behaviors like hand washing or mental acts that a person feels driven to perform.",
    },
  ];

  const currentReviewItems = activeAttempt === 1 ? reviewItemsAttempt1 : reviewItemsAttempt2;

  useEffect(() => {
    const fetchExam = async () => {
      const examId = params?.id;
      if (!examId) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: examData, error } = await supabase
        .from("Exams")
        .select(`
          exam_id,
          exam_title,
          attempts:"Student Attempts" ( exam_status, final_score )
        `)
        .eq('exam_id', examId)
        .single();

      if (error || !examData) {
        console.error("Error fetching exam details:", error.message);
        setIsLoading(false);
        return;
      }

      const studentAttempt = examData.attempts?.[0];
      let currentStatus = "Available";
      let displayScore = null;

      if (studentAttempt?.exam_status === "completed") {
        currentStatus = "Finished";
        displayScore = studentAttempt.final_score ? `${studentAttempt.final_score}%` : "N/A";
      } else if (studentAttempt?.exam_status === "in_progress") {
        currentStatus = "In Progress";
        displayScore = studentAttempt.final_score ? `${studentAttempt.final_score}%` : "N/A";
      }

      setExam({
        id: examData.exam_id,
        title: examData.exam_title,
        status: currentStatus,
        score: displayScore,
      });

      setIsLoading(false);
    };

    fetchExam();
  }, [params]);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500 font-bold">Loading review dashboard...</div>;
  }

  if (!exam) {
    return <div className="p-8 text-center text-slate-500 font-bold">Exam data could not be found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm mb-4">
        <button
          onClick={() => router.push('/learner/exams')}
          className="text-blue-600 hover:underline font-bold"
        >
          Mock Exams
        </button>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600 font-bold">Post-Exam Analytics</span>
      </div>

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {exam.title} Results
          </h2>
          <p className="text-sm text-slate-400 font-bold mt-1">
            Review your absolute response accuracy metrics below.
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4">
          {exam.status === "In Progress" && (
            <button
              onClick={() => router.push(`/learner/exams/${exam.id}/take`)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
            >
              Start Next Attempt
            </button>
          )}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-center min-w-[140px]">
            <span className="text-3xl font-black text-blue-600 block">
              {exam.score}
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Achieved Mark
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h3 className="font-bold text-slate-700 text-lg">
            Review Deck
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveAttempt(1)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeAttempt === 1 ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              Attempt 1
            </button>
            <button
              onClick={() => setActiveAttempt(2)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeAttempt === 2 ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              Attempt 2
            </button>
          </div>
        </div>

        {currentReviewItems.map((item) => (
          <div
            key={item.qNum}
            className={`p-6 border rounded-xl bg-white shadow-sm flex flex-col gap-3 border-l-4 ${item.isCorrect ? "border-l-emerald-500" : "border-l-rose-500"}`}
          >
            <div className="flex justify-between items-center text-xs font-bold text-slate-400">
              <span>Item Attempt {item.qNum}</span>
              <span
                className={
                  item.isCorrect ? "text-emerald-600" : "text-rose-600"
                }
              >
                {item.isCorrect ? "✓ Correct" : "✗ Incorrect"}
              </span>
            </div>
            <p className="text-base font-bold text-slate-800">{item.text}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold mt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <span className="text-slate-400 block mb-1">
                  Your Submission:
                </span>
                <span
                  className={
                    item.isCorrect ? "text-emerald-700" : "text-rose-700"
                  }
                >
                  {item.studentAnswer}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <span className="text-slate-400 block mb-1">
                  Valid Blueprint Answer:
                </span>
                <span className="text-emerald-700">{item.correctAnswer}</span>
              </div>
            </div>
            <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg mt-2 text-xs font-bold text-blue-950">
              <span className="block text-blue-700 mb-1">
                🤖 AI-Generated Answer Explanation:
              </span>
              <p className="leading-relaxed">{item.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
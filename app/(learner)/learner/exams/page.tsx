"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface ScheduledExam {
  id: string;
  title: string;
  scope: string;
  rules: string;
  duration: string;
  status: string;
  score: string | null;
  accent: string;
}

export default function ScheduledExamsPage() {
  const router = useRouter();

  const [selectedExam, setSelectedExam] = useState<null | string>(null);
  const [viewingDashboard, setViewingDashboard] = useState<null | string>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [scheduledExamsList, setScheduledExamsList] = useState<ScheduledExam[]>(
    [],
  );

  const reviewItemsAttempt1 = [
    {
      qNum: 1,
      text: "Which symptom is considered a negative symptom of schizophrenia?",
      studentAnswer: "Avolition",
      correctAnswer: "Avolition",
      isCorrect: true,
      explanation:
        "Avolition represents a restriction in the initiation and persistence of goal-directed behavior, a core negative dimension under DSM-5 parameters.",
    },
    {
      qNum: 2,
      text: "What is the primary feature of Panic Disorder?",
      studentAnswer: "Generalized worry",
      correctAnswer: "Recurrent unexpected panic attacks",
      isCorrect: false,
      explanation:
        "Panic disorder specifically requires recurrent, unexpected panic attacks followed by at least 1 month of persistent concern about additional attacks.",
    },
  ];

  const reviewItemsAttempt2 = [
    {
      qNum: 1,
      text: "What characterizes Borderline Personality Disorder?",
      studentAnswer: "Instability in relationships",
      correctAnswer: "Instability in relationships",
      isCorrect: true,
      explanation:
        "BPD is marked by a pervasive pattern of instability in interpersonal relationships, self image, and affects.",
    },
    {
      qNum: 2,
      text: "Which is a common compulsion in OCD?",
      studentAnswer: "Worrying about health",
      correctAnswer: "Repetitive hand washing",
      isCorrect: false,
      explanation:
        "Compulsions are repetitive behaviors like hand washing or mental acts that a person feels driven to perform.",
    },
  ];

  const currentReviewItems =
    activeAttempt === 1 ? reviewItemsAttempt1 : reviewItemsAttempt2;

  useEffect(() => {
    const fetchExams = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: exams, error } = await supabase
        .from("Exams")
        .select(
          `
          exam_id,
          exam_title,
          exam_subject,
          schedule_start,
          time_limit_mins,
          attempts:"Student Attempts" ( exam_status, final_score )
        `,
        )
        .order("schedule_start", { ascending: true });

      if (error) {
        console.error("Error fetching exams:", error.message);
        setIsLoading(false);
        return;
      }

      const accentColors = [
        "bg-blue-500",
        "bg-emerald-500",
        "bg-purple-500",
        "bg-rose-500",
      ];

      const formattedExams = exams.map((exam: any, index: number) => {
        const studentAttempt = exam.attempts?.[0];
        const examDate = new Date(exam.schedule_start);

        let currentStatus = "Available";
        let displayScore = null;

        if (studentAttempt?.exam_status === "completed") {
          currentStatus = "Finished";
          // Format the numeric score to a percentage string
          displayScore = studentAttempt.final_score
            ? `${studentAttempt.final_score}%`
            : "N/A";
        } else if (studentAttempt?.exam_status === "in_progress") {
          // New state for attempted but not concluded exams
          currentStatus = "In Progress";
          displayScore = studentAttempt.final_score ? `${studentAttempt.final_score}%` : "N/A";
        }

        return {
          id: exam.exam_id,
          title: exam.exam_title,
          scope: exam.exam_subject || "Comprehensive Coverage",
          rules: `Specific Time ${examDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${examDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
          duration: `${exam.time_limit_mins || 60} minutes`,
          status: currentStatus,
          score: displayScore,
          accent: accentColors[index % accentColors.length], // Loops through the colors automatically
        };
      });

      setScheduledExamsList(formattedExams);
      setIsLoading(false);
    };

    fetchExams();
  }, []);

  if (viewingDashboard !== null) {
    const exam = scheduledExamsList.find((e) => e.id === viewingDashboard);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm mb-4">
          <button
            onClick={() => setViewingDashboard(null)}
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
              {exam?.title} Results
            </h2>
            <p className="text-sm text-slate-400 font-bold mt-1">
              Review your absolute response accuracy metrics below.
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* 1. Dynamic Retake Button */}
            {exam?.status === "In Progress" && (
              <button
                onClick={() => {
                  setViewingDashboard(null); // Close dashboard
                  setSelectedExam(exam.id); // Open start confirmation modal
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
              >
                Start Next Attempt
              </button>
            )}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-center min-w-[140px]">
            <span className="text-3xl font-black text-blue-600 block">
              {exam?.score}
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

  if (selectedExam !== null) {
    const examDetails = scheduledExamsList.find((e) => e.id === selectedExam);
    return (
      <div className="space-y-6 relative">
        <div className="flex items-center gap-2 text-sm mb-4">
          <button
            onClick={() => setSelectedExam(null)}
            className="text-blue-600 hover:underline font-bold"
          >
            Scheduled Mock Exams
          </button>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600 font-bold">Exam Details</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full max-w-4xl">
          <div className="bg-slate-50 border-b border-slate-200 p-8 md:p-10">
            <h2 className="text-3xl font-bold text-slate-800">
              {examDetails?.title}
            </h2>
            <p className="text-slate-500 mt-3 text-sm font-bold">
              Review the details below before starting your attempt.
            </p>
          </div>

          <div className="p-8 md:p-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Exam Scope
                </h4>
                <p className="text-slate-800 font-bold text-lg">
                  {examDetails?.scope}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Duration
                </h4>
                <p className="text-slate-800 font-bold text-lg">
                  {examDetails?.duration}
                </p>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Scheduling Rules
                </h4>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-blue-600 text-2xl">🕒</span>
                  <p className="text-slate-800 font-bold text-lg">
                    {examDetails?.rules}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowConfirmModal(true)}
                className="px-8 py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-lg"
              >
                Start Mock Exam
              </button>
            </div>
          </div>
        </div>

        {showConfirmModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
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
                  onClick={() => router.push(`/learner/exams/${examDetails?.id}/take`)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">
        Scheduled Mock Exams
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6 font-bold">
        Select an available block to launch a simulator environment or explore
        historical dashboards.
      </p>

      {isLoading ? (
        <div className="p-8 text-center text-slate-500 font-bold">
          Loading your scheduled exams...
        </div>
      ) : scheduledExamsList.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-bold">
          No exams are currently available for your account.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full">
          {scheduledExamsList.map((exam) => (
            <div
              key={exam.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col relative"
            >
              <div className={`h-1.5 w-full ${exam.accent}`}></div>

              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg text-slate-800 leading-snug pr-3">
                      {exam.title}
                    </h3>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${
                        exam.status === "Available"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {exam.status === "Finished" || exam.status === "In Progress"
                        ? `Score: ${exam.score}`
                        : exam.status}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Scope
                  </p>
                  <p className="text-sm text-slate-700 font-bold mb-4">
                    {exam.scope}
                  </p>

                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Schedule
                  </p>
                  <p className="text-sm text-slate-700 font-bold">
                    {exam.rules}
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100">
                  {exam.status === "Available" ? (
                    <button
                      onClick={() => setSelectedExam(exam.id)}
                      className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      Take Exam
                    </button>
                  ) : exam.status === "In Progress" ? (
                    <button
                      onClick={() => setViewingDashboard(exam.id)}
                      className="w-full py-2.5 bg-amber-50 text-amber-700 border border-amber-200 text-sm font-bold rounded-lg hover:bg-amber-100 transition-colors shadow-sm"
                    >
                      Review & Retake
                    </button>
                  ) : (
                    <button
                      onClick={() => setViewingDashboard(exam.id)}
                      className="w-full py-2.5 bg-slate-100 text-slate-700 border border-slate-200 text-sm font-bold rounded-lg hover:bg-slate-200 transition-colors shadow-sm"
                    >
                      View Performance Summary
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

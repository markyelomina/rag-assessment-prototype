"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Skeleton from "@/components/ui/Skeleton";

interface ScheduledExam {
  id: string;
  title: string;
  subject: string;
  deadline: string;
  schedule_start: string;
  duration: string;
  status: string;
  score: string | null;
  accent: string;
  timeLimit: number;
}

export default function ScheduledExamsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [scheduledExamsList, setScheduledExamsList] = useState<ScheduledExam[]>([]);

  useEffect(() => {
    const fetchExams = async () => {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Fetch the student's cohort_id from the Users table
      const { data: userData, error: userError } = await supabase
        .from("Users")
        .select("cohort_id")
        .eq("user_id", user.id)
        .single();

      if (userError || !userData?.cohort_id) {
        console.error("Error fetching user cohort:", userError?.message);
        setIsLoading(false);
        return;
      }

      const studentCohortId = userData.cohort_id;

      // 2. Find all exam IDs linked to this student's cohort
      const { data: cohortExams, error: cohortExamsError } = await supabase
        .from("Exam_Cohorts")
        .select("exam_id")
        .eq("cohort_id", studentCohortId);

      if (cohortExamsError) {
        console.error("Error fetching cohort exams:", cohortExamsError.message);
        setIsLoading(false);
        return;
      }

      const examIds = cohortExams?.map((ce) => ce.exam_id) || [];

      if (examIds.length === 0) {
        setScheduledExamsList([]);
        setIsLoading(false);
        return;
      }

      // 3. Fetch deployed exams
      const { data: exams, error: examsError } = await supabase
        .from("Exams")
        .select(`
          exam_id,
          exam_title,
          exam_subject,
          schedule_start,
          schedule_end,
          time_limit_mins,
          global_status,
          close_after_deadline,
          max_attempts,
          attempts:"Student Attempts" ( exam_status, final_score, student_id )
        `)
        .in("exam_id", examIds)
        .in("global_status", ["Active", "Inactive"]) 
        .order("schedule_start", { ascending: true });

      if (examsError) {
        console.error("Error fetching exams:", examsError.message);
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
        const myAttempts = exam.attempts?.filter((att: any) => att.student_id === user.id) || [];
        const attemptCount = myAttempts.length;
        const maxAttempts = exam.max_attempts || 1;

        const startDate = new Date(exam.schedule_start);
        const endDate = exam.schedule_end ? new Date(exam.schedule_end) : null;
        const now = new Date();

        let currentStatus = "Available";
        let displayScore = "N/A";

        if (attemptCount > 0) {
          const scores = myAttempts.map((a: any) => a.final_score).filter((s: any) => s !== null);
          if (scores.length > 0) displayScore = `${Math.max(...scores)}%`;
        }

        if (attemptCount >= maxAttempts) {
          currentStatus = "Finished";
        } else if (exam.global_status === "Inactive" || (endDate && exam.close_after_deadline && now > endDate)) {
          currentStatus = "Closed";
        } else if (now < startDate) {
          currentStatus = "Upcoming";
        } else if (attemptCount > 0 && attemptCount < maxAttempts) {
          currentStatus = "Retake Available";
        }

        return {
          id: exam.exam_id,
          title: exam.exam_title,
          subject: exam.exam_subject || "General Comprehensive",
          schedule_start: exam.schedule_start,
          deadline: endDate 
            ? `${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            : "No Closing Deadline",
          duration: `${exam.time_limit_mins || 60} minutes`,
          status: currentStatus,
          score: displayScore,
          accent: accentColors[index % accentColors.length],
          timeLimit: exam.time_limit_mins || 60,
        };
      });

      setScheduledExamsList(formattedExams);
      setIsLoading(false);
    };

    fetchExams();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">
        Scheduled Mock Exams
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6 font-bold">
        Select an available block to view exam details, launch a simulation, or explore historical dashboards.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full">
          {[1, 2, 3].map((key) => (
            <div
              key={key}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col relative h-[320px]"
            >
              <Skeleton className="h-1.5 w-full rounded-none bg-slate-300" />
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Skeleton className="h-3 w-12 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-5" />
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : scheduledExamsList.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
          No active exams are currently available for your account.
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
                        exam.status === "Available" || exam.status === "Retake Available"
                          ? "bg-blue-100 text-blue-800"
                          : exam.status === "Upcoming"
                          ? "bg-slate-100 text-slate-600"
                          : exam.status === "Closed"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {exam.status === "Finished" || exam.status === "Retake Available"
                        ? `Score: ${exam.score}`
                        : exam.status}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Subject
                  </p>
                  <p className="text-sm text-slate-700 font-bold mb-4">
                    {exam.subject}
                  </p>

                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Deadline
                  </p>
                  <p className="text-sm text-slate-700 font-bold">
                    {exam.deadline}
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100">
                  {exam.status === "Available" ? (
                    <button
                      onClick={() => router.push(`/learner/exams/${exam.id}`)}
                      className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      View Details & Take Exam
                    </button>
                  ) : exam.status === "Retake Available" ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => router.push(`/learner/exams/${exam.id}/review`)}
                        className="flex-1 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 text-sm font-bold rounded-lg hover:bg-amber-100 transition-colors shadow-sm"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => router.push(`/learner/exams/${exam.id}`)}
                        className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        Retake
                      </button>
                    </div>
                  ) : exam.status === "Upcoming" ? (
                    <button
                      disabled
                      className="w-full py-2.5 bg-slate-50 text-slate-400 border border-slate-200 text-sm font-bold rounded-lg cursor-not-allowed"
                    >
                      Starts {new Date(exam.schedule_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/learner/exams/${exam.id}/review`)}
                      className={`w-full py-2.5 text-sm font-bold rounded-lg transition-colors shadow-sm ${
                        exam.status === "Closed" 
                          ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                          : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                      }`}
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
'use client';

interface ScheduleItem {
  id?: string;
  task: string;
  day: string;
  date: string;
  time: string;
  status: string;
  references: string[];
  passingScore: number;         
  highestScore: number | null;  
  goalMet: boolean | null; 
}

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LearnerCalendarPage() {
  const router = useRouter();

  const [weeklySchedule, setWeeklySchedule] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);

  useEffect(() => {
    const fetchSchedule = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Query Exams and join attempts, including passing_percentage
      const { data: exams, error } = await supabase
        .from('Exams')
        .select(`
          exam_id,
          exam_title,
          schedule_start,
          schedule_end,
          references,
          max_attempts,
          close_after_deadline,
          global_status,
          passing_score,
          passing_percentage,
          attempts:"Student Attempts" ( attempt_id, final_score )
        `)
        .neq('global_status', 'Hidden')
        .order('schedule_start', { ascending: true });

      if (error) {
        console.error("Error fetching schedule:", error.message);
        setIsLoading(false);
        return;
      }

      // Format the raw database data to match UI requirements
      const formattedSchedule = exams.map((exam) => {
        const examDate = new Date(exam.schedule_start);
        const examEndDate = exam.schedule_end ? new Date(exam.schedule_end) : null;
        const now = new Date();
        
        const attempts = exam.attempts || [];
        const attemptCount = exam.attempts?.length || 0;
        const maxAttempts = exam.max_attempts || 1;
        
        // Use passing_percentage if available, otherwise fallback to passing_score or 75
        const targetPercentage = exam.passing_percentage || exam.passing_score || 75;

        // Find their best score out of all attempts
        let highestScore = null;
        if (attemptCount > 0) {
          highestScore = Math.max(...attempts.map((a: any) => a.final_score || 0));
        }
        
        // Determine the dynamic status based on attempt/deadline rules
        let currentStatus = 'Upcoming';
        
        if (attemptCount >= maxAttempts) {
          currentStatus = 'Completed';
        } else if (examEndDate && exam.close_after_deadline && now > examEndDate) {
          currentStatus = 'Closed';
        } else if (now >= examDate) {
          currentStatus = 'Pending';
        }

        // Evaluate if the goal was met (comparing score percentage against target percentage)
        let goalMet: boolean | null = null;
        if (currentStatus === 'Completed') {
          goalMet = highestScore !== null && highestScore >= targetPercentage;
        } else if (currentStatus === 'Closed') {
          goalMet = false; 
        }

        let parsedRefs = ['Standard Syllabus Guide'];
        if (exam.references && Array.isArray(exam.references) && exam.references.length > 0) {
          parsedRefs = exam.references;
        }

        return {
          id: exam.exam_id,
          task: exam.exam_title,
          day: examDate.toLocaleDateString('en-US', { weekday: 'long' }),
          date: examDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
          time: examDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          status: currentStatus,
          references: parsedRefs,
          passingScore: targetPercentage,
          highestScore,
          goalMet
        };
      });

      setWeeklySchedule(formattedSchedule);
      setIsLoading(false);
    };

    fetchSchedule();
  }, []);

  const today = new Date();
  const currentMonthName = today.toLocaleString('en-US', { month: 'long' });
  const currentYear = today.getFullYear();
  
  const daysInMonth = new Date(currentYear, today.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, today.getMonth(), 1).getDay();

  const examDaysMap = new Map<number, string>();

  weeklySchedule
    .filter(schedule => schedule.date.includes(currentMonthName))
    .forEach(schedule => {
      const match = schedule.date.match(/\d+/);
      if (match) {
        const day = parseInt(match[0]);
        const existingStatus = examDaysMap.get(day);

        if (schedule.status === 'Closed') {
          examDaysMap.set(day, 'Closed'); 
        } else if ((schedule.status === 'Pending' || schedule.status === 'Upcoming') && existingStatus !== 'Closed') {
          examDaysMap.set(day, 'Pending'); 
        } else if (!existingStatus) {
          examDaysMap.set(day, 'Completed'); 
        }
      }
    });

  const missedExams = weeklySchedule.filter(
    (exam) => exam.status === 'Closed' && exam.id && !dismissedNotifications.includes(exam.id)
  );

  return (
    <div className="space-y-6">

      {missedExams.length > 0 && (
        <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {missedExams.map((exam) => (
            <div key={exam.id} className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-sm font-bold">You missed an exam: {exam.task}</p>
                  <p className="text-xs text-rose-600 font-bold mt-0.5">This closed on {exam.day}, {exam.date} at {exam.time}.</p>
                </div>
              </div>
              <button 
                onClick={() => exam.id && setDismissedNotifications(prev => [...prev, exam.id!])} 
                className="px-4 py-2 bg-white text-rose-600 text-xs font-bold rounded-lg border border-rose-200 hover:bg-rose-100 transition-colors whitespace-nowrap shadow-sm w-full md:w-auto"
              >
                Dismiss Alert
              </button>
            </div>
          ))}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800">Weekly Activity</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6 font-bold">View your upcoming mock exams, mandatory simulations, and mapped source reference parameters.</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
              Syncing calendar data...
            </div>
          ) : weeklySchedule.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
              No scheduled activities found.
            </div>
          ) : (
            weeklySchedule.map((schedule, idx) => (
              <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{schedule.task}</h3>
                    <p className="text-sm text-slate-500 mt-1">Scheduled for {schedule.day}, {schedule.date} at {schedule.time}</p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                    schedule.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 
                    schedule.status === 'Pending' ? 'bg-blue-100 text-blue-800' : 
                    schedule.status === 'Closed' ? 'bg-rose-100 text-rose-800' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {schedule.status}
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Required Review References:</span>
                  <div className="flex flex-wrap gap-2">
                    {schedule.references.map((ref, rIdx) => (
                      <span key={rIdx} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200">
                        {ref}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
                  {schedule.status === 'Completed' && (
                    <button onClick={() => router.push('/learner/performance')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors shadow-sm">
                      View Performance Dashboard
                    </button>
                  )}
                  {schedule.status === 'Pending' && (
                    <button onClick={() => router.push('/learner/exams')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                      Open Exam Selection
                    </button>
                  )}
                  {schedule.status === 'Closed' && (
                    <button disabled className="px-4 py-2 bg-rose-50 text-rose-400 border border-rose-100 text-xs font-bold rounded-lg cursor-not-allowed">
                      Exam Closed
                    </button>
                  )}
                  {schedule.status === 'Upcoming' && (
                    <button disabled className="px-4 py-2 bg-slate-50 text-slate-400 border border-slate-100 text-xs font-bold rounded-lg cursor-not-allowed">
                      Locked Until Scheduled Time
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">{currentMonthName} {currentYear} Schedule</h3>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
              <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm font-bold text-slate-700">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="p-1.5"></div>
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dayStatus = examDaysMap.get(day);
                let highlightClass = 'hover:bg-slate-100 text-slate-700';
                
                if (dayStatus === 'Closed') {
                  highlightClass = 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-200 ring-offset-1';
                } else if (dayStatus === 'Pending') {
                  highlightClass = 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200 ring-offset-1';
                } else if (dayStatus === 'Completed') {
                  highlightClass = 'bg-slate-400 text-white shadow-sm ring-2 ring-slate-200 ring-offset-1';
                }

                return (
                  <div 
                    key={day} 
                    className={`p-1.5 rounded-md flex items-center justify-center h-8 w-8 mx-auto font-bold transition-all ${highlightClass}`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Weekly Goals Tracker</h3>
            <ul className="space-y-3 text-sm text-slate-600 font-bold">
              {weeklySchedule.length === 0 && !isLoading ? (
                <li className="text-slate-400 text-xs italic">No scheduled exams this week.</li>
              ) : (
                weeklySchedule.map((exam, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    {exam.goalMet === true ? (
                      <span className="text-emerald-500 mt-0.5">✓</span>
                    ) : exam.goalMet === false ? (
                      <span className="text-rose-400 mt-0.5">✗</span>
                    ) : (
                      <span className="text-blue-500 mt-0.5">○</span>
                    )}
                    <span className={exam.goalMet !== null ? 'line-through text-slate-400' : 'text-slate-600'}>
                      Score {exam.passingScore}% or higher on {exam.task}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
            <h3 className="font-bold text-blue-800 mb-2">Study Tip</h3>
            <p className="text-sm text-blue-900 leading-relaxed font-bold">Consistency is important. Make sure to log in every day to keep your review habits intact and monitor new mock exam schedules.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
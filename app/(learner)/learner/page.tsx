'use client';

interface ScheduleItem {
  id?: string;
  task: string;
  day: string;
  date: string;
  time: string;
  status: string;
  references: string[];
}

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LearnerCalendarPage() {
  const router = useRouter();

  const [weeklySchedule, setWeeklySchedule] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Query Exams and join the logged-in user's specific attempts
      const { data: exams, error } = await supabase
        .from('Exams')
        .select(`
          exam_id,
          exam_title,
          schedule_start,
          references,
          attempts:"Student Attempts" ( exam_status )
        `)
        .order('schedule_start', { ascending: true });

      if (error) {
        console.error("Error fetching schedule:", error.message);
        setIsLoading(false);
        return;
      }

      // Format the raw database data to match UI requirements
      const formattedSchedule = exams.map((exam) => {
        const examDate = new Date(exam.schedule_start);
        const now = new Date();
        
        // Check if the student has an existing attempt record
        const studentAttempt = exam.attempts?.[0];
        
        // Determine the dynamic status
        let currentStatus = 'Upcoming';
        if (studentAttempt?.exam_status === 'completed') {
          currentStatus = 'Completed';
        } else if (examDate <= now) {
          currentStatus = 'Pending';
        }

        return {
          id: exam.exam_id,
          task: exam.exam_title,
          day: examDate.toLocaleDateString('en-US', { weekday: 'long' }),
          date: examDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
          time: examDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          status: currentStatus,
          references: exam.references || ['Standard Syllabus Guide'] // Fallback if no references exist
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

  const examDaysThisMonth = weeklySchedule
    .filter(schedule => schedule.date.includes(currentMonthName))
    .map(schedule => {
      const match = schedule.date.match(/\d+/);
      return match ? parseInt(match[0]) : null;
    });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Weekly Activity</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6 font-bold">View your upcoming mock exams, mandatory simulations, and mapped source reference parameters.</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {weeklySchedule.map((schedule, idx) => (
            <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{schedule.task}</h3>
                  <p className="text-sm text-slate-500 mt-1">Scheduled for {schedule.day}, {schedule.date} at {schedule.time}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  schedule.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 
                  schedule.status === 'Pending' ? 'bg-blue-100 text-blue-800' : 
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
                  <button onClick={() => router.push('/learner/exams')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors shadow-sm">
                    View Post Exam Dashboard
                  </button>
                )}
                {schedule.status === 'Pending' && (
                  <button onClick={() => router.push('/learner/exams')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                    Open Exam Selection
                  </button>
                )}
                {schedule.status === 'Upcoming' && (
                  <button disabled className="px-4 py-2 bg-slate-50 text-slate-400 border border-slate-100 text-xs font-bold rounded-lg cursor-not-allowed">
                    Locked Until Scheduled Time
                  </button>
                )}
              </div>
            </div>
          ))}
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
                const isExamDate = examDaysThisMonth.includes(day);
                return (
                  <div 
                    key={day} 
                    className={`p-1.5 rounded-md flex items-center justify-center h-8 w-8 mx-auto ${
                      isExamDate 
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200 ring-offset-1' 
                        : 'hover:bg-slate-100'
                    }`}
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
              
              {weeklySchedule.length === 0 ? (
                <li className="text-slate-400 text-xs italic">No scheduled exams this week.</li>
              ) : (
                weeklySchedule.map((exam, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    
                    {/* Dynamic Icon */}
                    {exam.status === 'Completed' ? (
                      <span className="text-emerald-500 mt-0.5">✓</span>
                    ) : exam.status === 'Pending' ? (
                      <span className="text-blue-500 mt-0.5">○</span>
                    ) : (
                      <span className="text-slate-300 mt-0.5">○</span>
                    )}
                    
                    {/* Dynamic Text with strikethrough for completed items */}
                    <span className={exam.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-600'}>
                      {exam.status === 'Completed' 
                        ? `Complete the ${exam.task}.` 
                        : `Prepare for the upcoming ${exam.task}.`}
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
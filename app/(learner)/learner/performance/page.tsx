'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabaseClient';

export default function UnifiedPerformancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('latest');
  const [isLoading, setIsLoading] = useState(true);

  const [historicalAttempts, setHistoricalAttempts] = useState<any[]>([]);
  const [stats, setStats] = useState({ completed: 0, average: 0 });
  const [latestExam, setLatestExam] = useState<any>(null);

  useEffect(() => {
    const fetchPerformanceData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch all completed attempts and join the associated Exam details
      const { data: attempts, error } = await supabase
        .from('Student Attempts')
        .select(`
          attempt_id,
          final_score,
          completed_at,
          exam:Exams ( exam_title )
        `)
        .eq('student_id', user.id)
        .eq('exam_status', 'completed')
        .order('completed_at', { ascending: false }); // Newest first

      if (error || !attempts || attempts.length === 0) {
        setIsLoading(false);
        return;
      }

      // 1. Map the History Matrix Data
      const formattedHistory = attempts.map((attempt: any) => {
        const dateObj = new Date(attempt.completed_at || Date.now());
        return {
          id: attempt.attempt_id.substring(0, 8).toUpperCase(), // Shorten UUID for display
          name: attempt.exam?.exam_title || 'Unknown Exam',
          score: `${attempt.final_score}%`,
          rawScore: attempt.final_score,
          date: dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          status: attempt.final_score >= 75 ? 'Passed' : 'Needs Review' // Dynamic pass/fail logic
        };
      });

      // 2. Calculate the Top-Level Stats
      const totalScore = formattedHistory.reduce((acc, curr) => acc + (curr.rawScore || 0), 0);
      const avg = Math.round(totalScore / formattedHistory.length);

      // 3. Extract the Most Recent Exam for the "Latest Summary" tab
      const mostRecent = formattedHistory[0];

      setHistoricalAttempts(formattedHistory);
      setStats({ completed: formattedHistory.length, average: avg });
      setLatestExam({
        examName: mostRecent.name,
        completionDate: mostRecent.date,
        scoreBreakdown: { correct: mostRecent.rawScore, incorrect: 100 - mostRecent.rawScore, total: 100 },
        // Hardcoded for now until ai_summary column and question-level tracking is added
        aiRagFeedback: 'Data synchronization in progress. Your performance indicates an excellent grasp of clinical diagnostic criteria...',
        radarData: [
          { subject: 'Personality', score: 88, fullMark: 100 },
          { subject: 'Abnormal Psych', score: 74, fullMark: 100 },
          { subject: 'Industrial', score: 62, fullMark: 100 },
          { subject: 'Assessment', score: 80, fullMark: 100 },
        ]
      });

      setIsLoading(false);
    };

    fetchPerformanceData();
  }, []);

  const performanceStats = {
    examsCompleted: 8,
    averageScore: '76.5%',
    globalRank: 'Top 12%',
    recentExams: [
      { id: 'EX902', name: 'Comprehensive Mock Exam Area A', score: '82%', date: 'July 8, 2026', status: 'Passed' },
      { id: 'EX884', name: 'Abnormal Psychology Specialized Drill', score: '71%', date: 'July 2, 2026', status: 'Passed' },
      { id: 'EX851', name: 'Theories of Personality Diagnostic', score: '64%', date: 'June 25, 2026', status: 'Needs Review' },
    ]
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Performance Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Review your latest analytics and track your historical progress.</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('latest')}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'latest' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Latest Summary
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Historical History
          </button>
        </div>
      </div>

      {activeTab === 'latest' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-100">
              Analyzing historical data...
            </div>
          ) : !latestExam ? (
            <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-100">
              No exam history found. Complete a simulation to generate your AI analytics.
            </div>
          ) : (
            
            /* 2. Your existing dashboard, safely using the ? operator */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h3 className="font-bold text-2xl text-slate-800">{latestExam?.examName}</h3>
                    <p className="text-sm text-slate-400 mt-1 font-bold">Attempt evaluated on {latestExam?.completionDate}</p>
                  </div>
                  <div className="text-left md:text-right bg-slate-50 p-4 rounded-lg min-w-[140px]">
                    <span className="text-3xl font-black text-emerald-600">{latestExam?.scoreBreakdown?.correct}%</span>
                    <p className="text-xs font-bold text-slate-500 mt-1">{latestExam?.scoreBreakdown?.correct} correct out of {latestExam?.scoreBreakdown?.total}</p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-8 rounded-xl">
                  <h4 className="text-base font-bold text-blue-800 flex items-center gap-2 mb-3">
                    <span className="text-xl">🤖</span> AI Feedback
                  </h4>
                  <p className="text-sm text-blue-950 leading-relaxed font-bold">
                    {latestExam?.aiRagFeedback}
                  </p>
                </div>
              </div>

              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 h-80 flex flex-col">
                  <h4 className="font-bold text-base text-slate-700 mb-2">Competency Radar</h4>
                  <div className="flex-1 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={latestExam?.radarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Score" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.5} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-8 rounded-xl">
                  <h4 className="text-base font-bold text-amber-800 mb-2">Action Plan</h4>
                  <p className="text-sm text-amber-900 leading-relaxed mb-6 font-bold">Based on your summary, prioritize targeted resources before taking another simulation.</p>
                  <button 
                    onClick={() => router.push('/learner/exams')}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                  >
                    View Available Mock Exams
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Simulations Completed</span>
              <p className="text-4xl font-bold text-slate-800 mt-2">{stats.completed}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average Score</span>
              <p className="text-4xl font-bold text-blue-600 mt-2">{stats.average}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estimated Standing</span>
              <p className="text-4xl font-bold text-emerald-600 mt-2">{performanceStats.globalRank}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-base text-slate-700">Exam History Matrix</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                    <th className="p-4">Simulation ID</th>
                    <th className="p-4">Exam Title</th>
                    <th className="p-4">Score</th>
                    <th className="p-4">Date Completed</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {historicalAttempts.map((exam) => (
                    <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono text-xs text-slate-400">{exam.id}</td>
                      <td className="p-4 font-bold text-slate-800">{exam.name}</td>
                      <td className="p-4 font-bold text-slate-700">{exam.score}</td>
                      <td className="p-4 text-slate-500 font-bold">{exam.date}</td>
                      <td className="p-4">
                        <span className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${exam.status === 'Passed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {exam.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
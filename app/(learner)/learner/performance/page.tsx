'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabaseClient';

export default function UnifiedPerformancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('history');
  const [isLoading, setIsLoading] = useState(true);

  const [historicalAttempts, setHistoricalAttempts] = useState<any[]>([]);
  const [stats, setStats] = useState({ completed: 0, average: 0 });
  const [cohortRank, setCohortRank] = useState<string>('Calculating...');
  const [latestExam, setLatestExam] = useState<any>(null);

  useEffect(() => {
    const fetchPerformanceData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();

      // 1. Fetch the student's cohort
      const { data: userData } = await supabase.from('Users').select('cohort_id').eq('user_id', user.id).single();
      const studentCohortId = userData?.cohort_id;

      // 2. Fetch ONLY the current student's completed attempts WITH their exact answers
      const { data: attempts, error: attemptsError } = await supabase
        .from('Student Attempts')
        .select(`
          attempt_id, 
          final_score, 
          completed_at, 
          exam_id,
          "Student Answers" (is_correct)
        `)
        .eq('student_id', user.id)
        .eq('exam_status', 'completed')
        .order('completed_at', { ascending: false });

      if (attemptsError) {
        setIsLoading(false);
        setCohortRank("N/A");
        return;
      }

      const attemptedExamIds = attempts?.map(a => a.exam_id) || [];

      // 3. Fetch exams assigned to their current cohort
      let cohortExamIds: string[] = [];
      if (studentCohortId) {
        const { data: cohortExams } = await supabase.from('Exam_Cohorts').select('exam_id').eq('cohort_id', studentCohortId);
        cohortExamIds = cohortExams?.map(ce => ce.exam_id) || [];
      }

      // 4. MERGE: Combine exams they took historically + exams currently assigned to them
      const relevantExamIds = [...new Set([...attemptedExamIds, ...cohortExamIds])];

      if (relevantExamIds.length === 0) {
        setIsLoading(false);
        setCohortRank("N/A");
        return;
      }

      // 5. Fetch ONLY relevant exams with dynamic passing metrics
      const { data: allExams } = await supabase
        .from('Exams')
        .select('exam_id, exam_title, exam_subject, schedule_start, schedule_end, close_after_deadline, global_status, grading_logic, passing_score, passing_percentage')
        .in('exam_id', relevantExamIds)
        .neq('global_status', 'Hidden');

      // Group student's attempts by exam_id
      const groupedAttempts: Record<string, any[]> = {};
      if (attempts) {
        attempts.forEach(a => {
          if (!groupedAttempts[a.exam_id]) groupedAttempts[a.exam_id] = [];
          groupedAttempts[a.exam_id].push(a);
        });
      }

      // 6. Build the consolidated history
      const consolidatedHistory: any[] = [];
      const requiredExams = (allExams || []).filter(e => 
        cohortExamIds.includes(e.exam_id) && e.schedule_end && e.close_after_deadline && now > new Date(e.schedule_end)
      );

      (allExams || []).forEach(exam => {
        const group = groupedAttempts[exam.exam_id];
        const targetScore = exam.passing_percentage || exam.passing_score || 75;

        if (group && group.length > 0) {
          const latestAttempt = group[0]; 
          const logic = exam.grading_logic || 'highest';

          let finalCalculatedScore = 0;
          if (logic === 'highest') {
            finalCalculatedScore = Math.max(...group.map(a => a.final_score || 0));
          } else if (logic === 'average') {
            const sum = group.reduce((acc, a) => acc + (a.final_score || 0), 0);
            finalCalculatedScore = Math.round(sum / group.length);
          } else {
            finalCalculatedScore = latestAttempt.final_score || 0; 
          }

          // Dynamically calculate exact correct/incorrect from the answers array
          let correctCount = 0;
          let totalItems = 100;
          if (latestAttempt["Student Answers"] && latestAttempt["Student Answers"].length > 0) {
            totalItems = latestAttempt["Student Answers"].length;
            correctCount = latestAttempt["Student Answers"].filter((a: any) => a.is_correct).length;
          } else {
            correctCount = Math.round((finalCalculatedScore / 100) * totalItems);
          }
          const incorrectCount = totalItems - correctCount;

          const dateObj = new Date(latestAttempt.completed_at || Date.now());
          
          consolidatedHistory.push({
            id: latestAttempt.attempt_id,
            examId: exam.exam_id,
            name: exam.exam_title || 'Unknown Exam',
            subject: exam.exam_subject || 'General Assessment',
            score: `${finalCalculatedScore}%`,
            rawScore: finalCalculatedScore,
            date: dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            status: finalCalculatedScore >= targetScore ? 'Passed' : 'Needs Review',
            attemptsCount: group.length,
            gradingLogic: logic,
            targetScore,
            itemStats: { correct: correctCount, incorrect: incorrectCount, total: totalItems }
          });
        } else {
          const isRequiredAndMissed = requiredExams.some(re => re.exam_id === exam.exam_id);
          if (isRequiredAndMissed) {
            const examEndDate = new Date(exam.schedule_end);
            consolidatedHistory.push({
              id: `missed-${exam.exam_id}`,
              examId: exam.exam_id,
              name: exam.exam_title || 'Unknown Exam',
              subject: exam.exam_subject || 'General Assessment',
              score: '0%',
              rawScore: 0, 
              date: examEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
              status: 'Missed',
              attemptsCount: 0,
              gradingLogic: exam.grading_logic || 'highest',
              targetScore: targetScore,
              itemStats: { correct: 0, incorrect: 0, total: 0 }
            });
          }
        }
      });

      consolidatedHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (consolidatedHistory.length === 0) {
        setIsLoading(false);
        setCohortRank("N/A");
        return;
      }

      // 7. Calculate Top-Level Stats
      const totalScore = consolidatedHistory.reduce((acc, curr) => acc + (curr.rawScore || 0), 0);
      const avg = Math.round(totalScore / consolidatedHistory.length);

      // 8. Dynamically build Radar Chart
      const subjectAverages: Record<string, { total: number; count: number }> = {};
      consolidatedHistory.forEach((h) => {
        if (!subjectAverages[h.subject]) subjectAverages[h.subject] = { total: 0, count: 0 };
        subjectAverages[h.subject].total += h.rawScore;
        subjectAverages[h.subject].count += 1;
      });

      // ---> NEW: Removed the text truncation so full subjects display correctly
      const dynamicRadarData = Object.keys(subjectAverages).map(subj => ({
        subject: subj, 
        score: Math.round(subjectAverages[subj].total / subjectAverages[subj].count),
        fullMark: 100
      }));

      // Find the student's best and worst subject for dynamic feedback
      let bestSubject = { name: 'General', score: -1 };
      let worstSubject = { name: 'General', score: 101 };
      
      dynamicRadarData.forEach(d => {
        if (d.score > bestSubject.score) bestSubject = { name: d.subject, score: d.score };
        if (d.score < worstSubject.score) worstSubject = { name: d.subject, score: d.score };
      });

      if (dynamicRadarData.length === 1) {
        dynamicRadarData.push({ subject: 'Logic', score: avg, fullMark: 100 }, { subject: 'Retention', score: avg, fullMark: 100 });
      } else if (dynamicRadarData.length === 2) {
        dynamicRadarData.push({ subject: 'Retention', score: avg, fullMark: 100 });
      }

      const mostRecent = consolidatedHistory[0];

      // 9. Dynamic AI Feedback utilizing the Radar and Passing Thresholds
      let dynamicFeedback = "";
      if (avg >= 90) {
        dynamicFeedback = `Outstanding performance! Your historical average of ${avg}% shows deep mastery. You are particularly strong in ${bestSubject.name}. Keep up the excellent retention strategies.`;
      } else if (avg >= mostRecent.targetScore) {
        dynamicFeedback = `Solid performance with an average of ${avg}%. You have a good grasp of most concepts, but targeted review in ${worstSubject.name} will push you to full mastery.`;
      } else {
        dynamicFeedback = `Your performance indicates some fundamental gaps. Falling below the passing threshold of ${mostRecent.targetScore}% means it is highly recommended to review the core study materials for ${worstSubject.name}.`;
      }

      const dynamicActionPlan = `Based on your overall metrics, your priority should be reviewing reference materials related to ${worstSubject.name} before attempting another simulation.`;

      setHistoricalAttempts(consolidatedHistory);
      setStats({ completed: consolidatedHistory.length, average: avg });
      setLatestExam({
        examName: mostRecent.name,
        completionDate: mostRecent.date,
        scoreBreakdown: mostRecent.itemStats,
        aiRagFeedback: dynamicFeedback,
        actionPlan: dynamicActionPlan,
        radarData: dynamicRadarData
      });

      // 10. Calculate Cohort Standing securely applying grading logic
      let calculatedRank = "N/A";
      
      if (studentCohortId) {
        const { data: cohortUsers } = await supabase.from('Users').select('user_id').eq('cohort_id', studentCohortId);
        const cohortUserIds = cohortUsers?.map(u => u.user_id) || [];

        if (cohortUserIds.length > 0) {
          const { data: cohortAttempts } = await supabase
            .from('Student Attempts')
            .select('student_id, final_score, exam_id, completed_at, exam:Exams!inner (global_status, grading_logic)')
            .in('student_id', cohortUserIds)
            .eq('exam_status', 'completed')
            .neq('exam.global_status', 'Hidden')
            .order('completed_at', { ascending: false });

          const studentAverages: Record<string, { total: number; count: number }> = {};
          cohortUserIds.forEach(id => studentAverages[id] = { total: 0, count: 0 });

          const studentExamGroups: Record<string, Record<string, any[]>> = {};
          if (cohortAttempts) {
            cohortAttempts.forEach(ca => {
              if (!studentExamGroups[ca.student_id]) studentExamGroups[ca.student_id] = {};
              if (!studentExamGroups[ca.student_id][ca.exam_id]) studentExamGroups[ca.student_id][ca.exam_id] = [];
              studentExamGroups[ca.student_id][ca.exam_id].push(ca);
            });
          }

          Object.keys(studentExamGroups).forEach(studentId => {
            const examsForStudent = studentExamGroups[studentId];
            Object.keys(examsForStudent).forEach(examId => {
              const attemptsForExam = examsForStudent[examId];
              const logic = attemptsForExam[0].exam?.grading_logic || 'highest';
              
              let score = 0;
              if (logic === 'highest') score = Math.max(...attemptsForExam.map(a => a.final_score || 0));
              else if (logic === 'average') {
                const sum = attemptsForExam.reduce((s, a) => s + (a.final_score || 0), 0);
                score = sum / attemptsForExam.length;
              } else score = attemptsForExam[0].final_score || 0; 

              studentAverages[studentId].total += score;
              studentAverages[studentId].count += 1;
            });
          });

          cohortUserIds.forEach(studentId => {
            const examsForStudent = studentExamGroups[studentId] || {};
            requiredExams.forEach(reqExam => {
              if (!examsForStudent[reqExam.exam_id]) {
                studentAverages[studentId].total += 0;
                studentAverages[studentId].count += 1;
              }
            });
          });

          const rankList = Object.keys(studentAverages).map(sid => ({
            id: sid,
            avg: studentAverages[sid].count > 0 ? (studentAverages[sid].total / studentAverages[sid].count) : 0
          })).sort((a, b) => b.avg - a.avg);

          const myRankIndex = rankList.findIndex(r => r.id === user.id);
          if (myRankIndex !== -1) {
            const myRank = myRankIndex + 1;
            const totalStudents = rankList.length;
            
            if (totalStudents > 1) {
              const percentile = Math.ceil((myRank / totalStudents) * 100);
              if (percentile <= 10) calculatedRank = "Top 10%";
              else if (percentile <= 25) calculatedRank = "Top 25%";
              else if (percentile <= 50) calculatedRank = "Top 50%";
              else calculatedRank = `Rank ${myRank} of ${totalStudents}`;
            } else {
              calculatedRank = "Top 1%"; 
            }
          }
        }
      }
      
      setCohortRank(calculatedRank);
      setIsLoading(false);
    };

    fetchPerformanceData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Performance Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Review your latest analytics and track your historical progress.</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Historical History
          </button>
          <button 
            onClick={() => setActiveTab('latest')}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'latest' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Latest Summary
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h3 className="font-bold text-2xl text-slate-800">{latestExam?.examName}</h3>
                    <p className="text-sm text-slate-400 mt-1 font-bold">Attempt evaluated on {latestExam?.completionDate}</p>
                  </div>
                  <div className="text-left md:text-right bg-slate-50 p-4 rounded-lg min-w-[140px]">
                    <span className="text-3xl font-black text-emerald-600">
                      {Math.round((latestExam?.scoreBreakdown?.correct / latestExam?.scoreBreakdown?.total) * 100) || 0}%
                    </span>
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
                  <p className="text-sm text-amber-900 leading-relaxed mb-6 font-bold">
                    {latestExam?.actionPlan}
                  </p>
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
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Evaluated Exams</span>
              <p className="text-4xl font-bold text-slate-800 mt-2">{stats.completed}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Average</span>
              <p className="text-4xl font-bold text-blue-600 mt-2">{stats.average}%</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estimated Standing</span>
              <p className="text-4xl font-bold text-emerald-600 mt-2">{cohortRank}</p>
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
                    <th className="p-4">Exam Title</th>
                    <th className="p-4">Final Score</th>
                    <th className="p-4">Date Evaluated</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {historicalAttempts.map((exam) => (
                    <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-800">
                        {exam.name}
                        {exam.attemptsCount > 1 && <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{exam.attemptsCount} Attempts ({exam.gradingLogic})</span>}
                      </td>
                      <td className="p-4 font-bold text-slate-700">{exam.score}</td>
                      <td className="p-4 text-slate-500 font-bold">{exam.date}</td>
                      <td className="p-4">
                        <span className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                          exam.status === 'Passed' ? 'bg-emerald-50 text-emerald-700' : 
                          exam.status === 'Missed' ? 'bg-rose-50 text-rose-700' : 
                          'bg-amber-50 text-amber-700'
                        }`}>
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
      <FullScreenLoader 
        isOpen={isLoading} 
        message="Loading performance data..." 
      />
    </div>
  );
}
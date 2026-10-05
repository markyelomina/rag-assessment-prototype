'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';

interface CohortBreakdown {
  cohortName: string;
  total: number;
  failed: number;
  failRate: number;
}

interface ItemAnalysis {
  topic: string;
  failRateNum: number;
  failedAttempts: number;
  totalAttempts: number;
  cohortBreakdown: CohortBreakdown[];
}

export default function FacultyAnalyticsPage() {
  const { addToast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [cohortData, setCohortData] = useState<any[]>([]);
  const [itemAnalysis, setItemAnalysis] = useState<ItemAnalysis[]>([]);
  const [cohortStudents, setCohortStudents] = useState<any[]>([]);

  const [sortKey, setSortKey] = useState<'cohort' | 'averageScoreNum' | 'completionRateNum'>('averageScoreNum');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const studentsPerPage = 5;

  useEffect(() => {
    const fetchAssignedCohorts = async () => {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getUser();
        const teacherId = sessionData?.user?.id;

        if (!teacherId) return;

        const { data: assignedCohorts, error } = await supabase
          .from('Cohort Teachers')
          .select(`
            cohort_id,
            Cohorts (
              cohort_name,
              Users (
                user_id,
                role_id,
                "Student Attempts" (
                  final_score
                )
              )
            )
          `)
          .eq('teacher_id', teacherId);

        if (error) throw error;

        // 1. Process Cohorts & Calculate Threshold Statuses
        const formattedCohorts = assignedCohorts?.map(record => {
          const cohortData = (record as any).Cohorts;
          const students = cohortData.Users?.filter((u: any) => u.role_id === 1) || [];
          
          let totalScore = 0;
          let totalAttempts = 0;
          let studentsWithAttempts = 0;

          students.forEach((student: any) => {
            const attempts = student["Student Attempts"] || [];
            if (attempts.length > 0) {
              studentsWithAttempts++;
              attempts.forEach((attempt: any) => {
                totalScore += (attempt.final_score || 0);
                totalAttempts++;
              });
            }
          });

          const avgScore = totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0;
          const completionRate = students.length > 0 ? Math.round((studentsWithAttempts / students.length) * 100) : 0;

          let status = 'Needs Attention';
          if (avgScore >= 85 && completionRate >= 80) status = 'Excellent';
          else if (avgScore >= 70 && completionRate >= 50) status = 'On Track';
          else if (avgScore < 60 || completionRate < 30) status = 'At Risk';

          return {
            id: (record as any).cohort_id,
            cohort: cohortData.cohort_name,
            averageScoreNum: avgScore,
            completionRateNum: completionRate,
            status: status
          };
        }) || [];

        setCohortData(formattedCohorts);

        // 2. Process Dynamic Topic Analytics with Latest Attempt Isolation
        const cohortIds = assignedCohorts?.map(c => c.cohort_id) || [];
        if (cohortIds.length > 0) {
          const { data: examLinks } = await supabase.from('Exam_Cohorts').select('exam_id').in('cohort_id', cohortIds);
          const examIds = [...new Set(examLinks?.map(el => el.exam_id) || [])];

          if (examIds.length > 0) {
             const studentCohortMap = new Map();
             assignedCohorts?.forEach((c: any) => {
               c.Cohorts.Users?.forEach((u: any) => {
                 studentCohortMap.set(u.user_id, c.Cohorts.cohort_name);
               });
             });

             // Fetch attempts ordered by newest first
             const { data: attempts } = await supabase
               .from('Student Attempts')
               .select('attempt_id, student_id, exam_id, completed_at')
               .in('exam_id', examIds)
               .order('completed_at', { ascending: false });

             // Filter to ONLY the latest attempt per student per exam
             const latestAttemptsMap = new Map();
             const attemptCohortMap = new Map();

             attempts?.forEach(a => {
                const uniqueKey = `${a.student_id}_${a.exam_id}`;
                if (!latestAttemptsMap.has(uniqueKey)) {
                   latestAttemptsMap.set(uniqueKey, a.attempt_id);
                   attemptCohortMap.set(a.attempt_id, studentCohortMap.get(a.student_id) || 'Unknown Cohort');
                }
             });

             const validAttemptIds = Array.from(latestAttemptsMap.values());

             const { data: questions } = await supabase.from('Mock Exam Items').select('id, competency').in('exam_session_id', examIds);
             
             if (questions && questions.length > 0 && validAttemptIds.length > 0) {
                const questionMap = new Map(questions.map(q => [q.id, q.competency || 'General Topic']));
                const qIds = questions.map(q => q.id);

                const { data: answers } = await supabase
                  .from('Student Answers')
                  .select('question_id, is_correct, attempt_id')
                  .in('question_id', qIds);

                if (answers && answers.length > 0) {
                   const topicStats: Record<string, { total: number, correct: number, cohorts: Record<string, { total: number, correct: number }> }> = {};
                   
                   answers.forEach(ans => {
                      // Reject any answer that doesn't belong to the student's LATEST attempt
                      if (!validAttemptIds.includes(ans.attempt_id)) return;

                      const topic = questionMap.get(ans.question_id) || 'Unknown';
                      const cohortName = attemptCohortMap.get(ans.attempt_id) || 'Unknown Cohort';

                      if (!topicStats[topic]) topicStats[topic] = { total: 0, correct: 0, cohorts: {} };
                      if (!topicStats[topic].cohorts[cohortName]) topicStats[topic].cohorts[cohortName] = { total: 0, correct: 0 };

                      topicStats[topic].total += 1;
                      topicStats[topic].cohorts[cohortName].total += 1;

                      if (ans.is_correct) {
                        topicStats[topic].correct += 1;
                        topicStats[topic].cohorts[cohortName].correct += 1;
                      }
                   });

                   const analysis = Object.entries(topicStats)
                      .map(([topic, stats]) => {
                         const failedCount = stats.total - stats.correct;
                         const failRate = stats.total > 0 ? (failedCount / stats.total) * 100 : 0;
                         
                         const breakdown = Object.entries(stats.cohorts).map(([cName, cStats]) => {
                           const cFailed = cStats.total - cStats.correct;
                           return {
                             cohortName: cName,
                             total: cStats.total,
                             failed: cFailed,
                             failRate: cStats.total > 0 ? (cFailed / cStats.total) * 100 : 0
                           };
                         }).sort((a, b) => b.failRate - a.failRate);

                         return {
                            topic,
                            failRateNum: failRate,
                            failedAttempts: failedCount,
                            totalAttempts: stats.total,
                            cohortBreakdown: breakdown
                         };
                      })
                      .filter(t => t.failRateNum > 0) // Hide topics with 0% failure rate (Fully Mastered)
                      .sort((a, b) => b.failRateNum - a.failRateNum); // Rank highest failure rate first

                   setItemAnalysis(analysis);
                }
             }
          }
        }

      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignedCohorts();
  }, []);

  const handleExportGrades = async () => {
    setIsExporting(true);
    addToast('Preparing grade export...', 'info');

    try {
      const cohortIds = cohortData.map(c => c.id);
      if (cohortIds.length === 0) throw new Error("No cohorts assigned.");

      const { data: students, error } = await supabase
        .from('Users')
        .select(`
          name,
          Cohorts (cohort_name),
          "Student Attempts" (final_score)
        `)
        .in('cohort_id', cohortIds)
        .eq('role_id', 1);

      if (error) throw error;

      const csvRows = ['Cohort,Student Name,Average Grade (%)'];
      
      students?.forEach((student: any) => {
        const cohortName = student.Cohorts?.cohort_name || 'Unassigned';
        const attempts = student["Student Attempts"] || [];
        let avg = 'N/A';
        
        if (attempts.length > 0) {
          const total = attempts.reduce((sum: number, a: any) => sum + (a.final_score || 0), 0);
          avg = Math.round(total / attempts.length).toString();
        }
        
        csvRows.push(`"${cohortName}","${student.name}","${avg}"`);
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Faculty_Cohort_Grades_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      
      addToast('Export downloaded successfully.', 'success');
    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Failed to export grades', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExpand = async (cohortId: string) => {
    if (expandedCohort === cohortId) {
      setExpandedCohort(null);
      return;
    } 
    
    setExpandedCohort(cohortId);
    setRosterSearch('');
    setRosterPage(1);
    setIsLoadingRoster(true);

    try {
      const { data: students, error } = await supabase
        .from('Users')
        .select(`
          user_id,
          name,
          "Student Attempts" (
          final_score)`)
        .eq('cohort_id', cohortId)
        .eq('role_id', 1);

      if (error) throw error;

      const formattedStudents = students?.map((student: any) => {
        const attempts = student["Student Attempts"] || [];
        let avgGrade = 0;

        if (attempts.length > 0) {
          const total = attempts.reduce((sum: number, attempt: any) => sum + (attempt.final_score || 0), 0);
          avgGrade = Math.round(total / attempts.length);
        }

        return{
          id: student.user_id,
          name: student.name,
          grade: attempts.length > 0 ? avgGrade : 'N/A'
        };
      }) || [];

      setCohortStudents(formattedStudents);
    } catch (error) {
      console.error('Error fetching roster:', error);
    } finally {
      setIsLoadingRoster(false);
    }
  };

  const handleSort = (key: 'cohort' | 'averageScoreNum' | 'completionRateNum') => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case 'Excellent': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'On Track': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'At Risk': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-amber-100 text-amber-800 border-amber-200'; 
    }
  };

  const sortedCohorts = [...cohortData].sort((a, b) => {
    if (a[sortKey] < b[sortKey]) return sortDirection === 'asc' ? -1 : 1;
    if (a[sortKey] > b[sortKey]) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredRoster = cohortStudents.filter(student => 
    student.name.toLowerCase().includes(rosterSearch.toLowerCase())
  );
  
  const indexOfLastStudent = rosterPage * studentsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;
  const currentRosterStudents = filteredRoster.slice(indexOfFirstStudent, indexOfLastStudent);
  const totalRosterPages = Math.ceil(filteredRoster.length / studentsPerPage);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Student Analytics and Grades</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl font-bold">Inspect overall cohort performance, view item discrimination analysis, and export class grades.</p>
        </div>
        <button 
          onClick={handleExportGrades}
          disabled={isExporting || cohortData.length === 0}
          className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <svg className="animate-spin h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          )}
          Export Cohort Grades
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200">
          <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-slate-500 font-bold">Fetching cohort analytics...</p>
        </div>
      ) : cohortData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-500 font-bold">You are not currently assigned to any active cohorts.</p>
        </div>
      ) : (
        <>
          {/* Top Section: Visual Comparison & Roster */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            
            {/* Visual Cohort Comparison */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
              <h3 className="font-bold text-slate-700 mb-4">Visual Cohort Comparison</h3>
              <div className="flex-1 w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cohortData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="cohort" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} domain={[0, 100]} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
                    <Bar dataKey="averageScoreNum" name="Average Score (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completionRateNum" name="Completion Rate (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cohort Performance Roster */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[400px]">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-700">Cohort Performance Roster</h3>
                <span className="text-xs font-bold text-slate-400">Click a row to view students</span>
              </div>
              <div className="overflow-y-auto scrollbar-hide flex-1">
                <table className="w-full text-left border-collapse relative">
                  <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_#e2e8f0] z-10">
                    <tr>
                      <th 
                        className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-800 transition-colors"
                        onClick={() => handleSort('cohort')}
                      >
                        Cohort Name {sortKey === 'cohort' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-800 transition-colors"
                        onClick={() => handleSort('averageScoreNum')}
                      >
                        Avg Score {sortKey === 'averageScoreNum' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-800 transition-colors"
                        onClick={() => handleSort('completionRateNum')}
                      >
                        Completion {sortKey === 'completionRateNum' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {sortedCohorts.map((record) => (
                      <React.Fragment key={record.id}>
                        <tr onClick={() => toggleExpand(record.id)} className={`transition-colors cursor-pointer ${expandedCohort === record.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-4"><p className="font-bold text-slate-800">{record.cohort}</p></td>
                          <td className="p-4"><p className="font-bold text-slate-800">{record.averageScoreNum}%</p></td>
                          <td className="p-4"><p className="font-bold text-slate-800">{record.completionRateNum}%</p></td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-1 border rounded-md text-[10px] font-bold uppercase tracking-wider ${getStatusBadgeStyles(record.status)}`}>
                              {record.status}
                            </span>
                          </td>
                        </tr>
                        
                        {expandedCohort === record.id && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td colSpan={4} className="p-6 shadow-inner">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-bold uppercase text-slate-500">Student Roster Details</h4>
                                <input 
                                  type="text" 
                                  placeholder="Search roster" 
                                  value={rosterSearch}
                                  onChange={(e) => { setRosterSearch(e.target.value); setRosterPage(1); }}
                                  className="w-48 text-xs font-bold px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white" 
                                />
                              </div>
                              
                              {isLoadingRoster ? (
                                <div className="py-6 text-center text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded">Loading student roster...</div>
                              ) : currentRosterStudents.length === 0 ? (
                                <div className="py-6 text-center text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded">No students enrolled in this cohort yet.</div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                  {currentRosterStudents.map(student => (
                                    <div key={student.id} className="bg-white border border-slate-200 p-3 rounded text-sm font-bold flex justify-between items-center shadow-sm">
                                      <span className="text-slate-700">{student.name}</span>
                                      <span className={`${typeof student.grade === 'number' ? (student.grade >= 75 ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'}`}>
                                        {typeof student.grade === 'number' ? `${student.grade}%` : student.grade}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isLoadingRoster && currentRosterStudents.length > 0 && (
                                <div className="flex justify-between items-center text-xs font-bold text-slate-500 pt-2 border-t border-slate-200">
                                  <span>Showing {indexOfFirstStudent + 1} to {Math.min(indexOfLastStudent, filteredRoster.length)} of {filteredRoster.length} students</span>
                                  <div className="flex gap-1.5">
                                    <button 
                                      onClick={() => setRosterPage(prev => Math.max(prev - 1, 1))}
                                      disabled={rosterPage === 1}
                                      className={`px-2.5 py-1 border rounded shadow-sm transition-colors ${rosterPage === 1 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                                    >Prev</button>
                                    <button 
                                      onClick={() => setRosterPage(prev => Math.min(prev + 1, totalRosterPages))}
                                      disabled={rosterPage === totalRosterPages || totalRosterPages === 0}
                                      className={`px-2.5 py-1 border rounded shadow-sm transition-colors ${rosterPage === totalRosterPages || totalRosterPages === 0 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                                    >Next</button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bottom Section: Full Width Competency Diagnostics with Interactive Drilldown */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">Competency Diagnostics</h3>
              <p className="text-sm text-slate-500 mt-1 font-bold">Topic mastery ranked by active failure rate based on the latest student attempts.</p>
            </div>
            
            <div className="divide-y divide-slate-100">
              {itemAnalysis.length === 0 ? (
                <div className="p-12 text-center text-sm font-bold text-slate-500">
                  No failures detected in current student attempts.
                </div>
              ) : (
                itemAnalysis.map((item, index) => {
                  const isExpanded = expandedTopic === item.topic;
                  
                  return (
                    <div key={index} className="flex flex-col">
                      {/* Main Topic Row */}
                      <div 
                        onClick={() => setExpandedTopic(isExpanded ? null : item.topic)}
                        className={`p-6 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6 ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-[10px] px-2.5 py-1 border rounded-md uppercase font-bold tracking-wider ${
                              item.failRateNum >= 50 ? 'bg-rose-100 text-rose-700 border-rose-200' : 
                              item.failRateNum >= 30 ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {item.failRateNum >= 50 ? 'Critical Struggle' : item.failRateNum >= 30 ? 'Needs Review' : 'Minor Gaps'}
                            </span>
                            <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">
                              {item.failedAttempts} / {item.totalAttempts} Attempts Failed
                            </span>
                          </div>
                          <p className="text-base font-bold text-slate-800 leading-snug">{item.topic}</p>
                        </div>
                        
                        <div className="w-full md:w-64 shrink-0 flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex justify-between mb-1.5">
                              <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Failure Rate</span>
                              <span className="text-[12px] font-bold text-slate-700">{item.failRateNum.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div 
                                className="h-full bg-rose-400 transition-all duration-1000" 
                                style={{ width: `${item.failRateNum}%` }}
                              ></div>
                            </div>
                          </div>
                          <svg className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </div>

                      {/* Expanded Cohort Breakdown Pane */}
                      {isExpanded && (
                        <div className="bg-slate-50 border-t border-slate-200 p-6 shadow-inner">
                          <h4 className="text-xs font-bold uppercase text-slate-500 mb-4">Specific Cohort Performance on this Topic</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {item.cohortBreakdown.length === 0 ? (
                              <p className="text-sm font-bold text-slate-400 italic">No cohort breakdown available.</p>
                            ) : (
                              item.cohortBreakdown.map((cohort, cIdx) => (
                                <div key={cIdx} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-rose-400"></div>
                                  <div className="pl-3">
                                    <p className="text-sm font-bold text-slate-800 truncate mb-1" title={cohort.cohortName}>{cohort.cohortName}</p>
                                    <div className="flex items-end justify-between mt-3">
                                      <div>
                                        <span className="block text-2xl font-black text-slate-700 leading-none">{cohort.failRate.toFixed(0)}%</span>
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Fail Rate</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="block text-sm font-bold text-slate-600 leading-none">{cohort.failed}/{cohort.total}</span>
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Missed</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
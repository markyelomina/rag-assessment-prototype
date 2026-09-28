'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { supabase } from '@/lib/supabaseClient';

export default function FacultyAnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  
  const [cohortData, setCohortData] = useState<any[]>([]);
  const [itemAnalysis, setItemAnalysis] = useState<any[]>([]);
  const [cohortStudents, setCohortStudents] = useState<any[]>([]);

  const [sortKey, setSortKey] = useState<'cohort' | 'averageScoreNum' | 'completionRateNum'>('averageScoreNum');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);

  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const studentsPerPage = 4;

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
              account_status,
              Users (
                role_id,
                "Student Attempts" (
                  final_score
                )
              )
            )
          `)
          .eq('teacher_id', teacherId);

        if (error) throw error;

        // 3. Process the nested data to calculate real averages
        const formattedCohorts = assignedCohorts?.map(record => {
          const cohortData = (record as any).Cohorts;
          
          // Filter to only include Learners (role_id === 1)
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

          const avgScore = totalAttempts > 0 
            ? Math.round(totalScore / totalAttempts) 
            : 0;

          const completionRate = students.length > 0 
            ? Math.round((studentsWithAttempts / students.length) * 100) 
            : 0;

          return {
            id: (record as any).cohort_id,
            cohort: cohortData.cohort_name,
            averageScoreNum: avgScore,
            completionRateNum: completionRate,
            status: cohortData.account_status === 'Active' ? 'On Track' : 'Needs Attention'
          };
        }) || [];

        setCohortData(formattedCohorts);

        // TODO: Fetch real item analysis for exam questions 
        setItemAnalysis([
          { id: 'Q 402', exam: 'Midterm Coverage Quiz', topic: 'Neurotransmitters', failedBy: '65%' },
          { id: 'Q 411', exam: 'Midterm Coverage Quiz', topic: 'Brain Anatomy', failedBy: '42%' },
        ]);

      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignedCohorts();
  }, []);

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
        const attempts = student.student_attempts || [];
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Student Analytics and Grades</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl font-bold">Inspect overall cohort performance view item discrimination analysis and export class grades.</p>
        </div>
        <button className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
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
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80 mb-6 flex flex-col">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-fit">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Cohort Performance Roster</h3>
                <span className="text-xs font-bold text-slate-400">Click a row to view student details</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-slate-200">
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
                        Average Score {sortKey === 'averageScoreNum' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-800 transition-colors"
                        onClick={() => handleSort('completionRateNum')}
                      >
                        Completion Rate {sortKey === 'completionRateNum' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {sortedCohorts.map((record) => (
                      <React.Fragment key={record.id}>
                        <tr onClick={() => toggleExpand(record.id)} className={`transition-colors cursor-pointer ${expandedCohort === record.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-4">
                            <p className="font-bold text-slate-800">{record.cohort}</p>
                          </td>
                          <td className="p-4">
                            <p className="font-bold text-slate-800">{record.averageScoreNum}%</p>
                          </td>
                          <td className="p-4">
                            <p className="font-bold text-slate-800">{record.completionRateNum}%</p>
                          </td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              record.status === 'On Track' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                        </tr>
                        
                        {expandedCohort === record.id && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td colSpan={4} className="p-6">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-bold uppercase text-slate-500">Student Roster Details</h4>
                                <input 
                                  type="text" 
                                  placeholder="Search roster" 
                                  value={rosterSearch}
                                  onChange={(e) => { setRosterSearch(e.target.value); setRosterPage(1); }}
                                  className="w-48 text-xs font-bold px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" 
                                />
                              </div>
                              
                              {isLoadingRoster ? (
                                <div className="py-6 text-center text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded">
                                  Loading student roster...
                                </div>
                              ) : currentRosterStudents.length === 0 ? (
                                <div className="py-6 text-center text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded">
                                  No students enrolled in this cohort yet.
                                </div>
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
                                    >
                                      Prev
                                    </button>
                                    <button 
                                      onClick={() => setRosterPage(prev => Math.min(prev + 1, totalRosterPages))}
                                      disabled={rosterPage === totalRosterPages || totalRosterPages === 0}
                                      className={`px-2.5 py-1 border rounded shadow-sm transition-colors ${rosterPage === totalRosterPages || totalRosterPages === 0 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                                    >
                                      Next
                                    </button>
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

            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-bold text-slate-700">Item Discrimination</h3>
                  <p className="text-xs text-slate-500 mt-1 font-bold">Questions frequently failed by students.</p>
                </div>
                <div className="p-2">
                  <ul className="flex flex-col">
                    {itemAnalysis.map(item => (
                      <li key={item.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Failed by {item.failedBy}</span>
                          <span className="text-xs font-bold text-slate-400">{item.id}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 mb-1">{item.topic}</p>
                        <p className="text-xs font-bold text-slate-500 mb-1">{item.exam}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl">
                <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-3">
                  <span className="text-lg">🤖</span> AI Instructional Suggestion
                </h4>
                <p className="text-xs text-blue-950 leading-relaxed font-bold mb-4">
                  Students are struggling heavily with Neurotransmitters and Motivation Theories. Consider uploading supplementary reading materials or generating a targeted diagnostic drill for these specific topics.
                </p>
                <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                  Generate Targeted Drill
                </button>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
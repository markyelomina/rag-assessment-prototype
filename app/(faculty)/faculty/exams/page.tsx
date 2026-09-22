'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { supabase } from '@/lib/supabaseClient';

interface FacultyExam {
  id: string;
  title: string;
  target: string;
  items: number;
  status: string;
  dueDate: string;
  color: string;
}

export default function FacultyExamsPage() {
  const router = useRouter();
  const [selectedExam, setSelectedExam] = useState<null | string>(null);
  const [examTab, setExamTab] = useState('settings');
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  
  const [examSearchQuery, setExamSearchQuery] = useState('');
  const debouncedExamSearch = useDebounce(examSearchQuery, 300);
  const [examStatusFilter, setExamStatusFilter] = useState('All');
  
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [questionToReject, setQuestionToReject] = useState<null | number>(null);

  const [studentSearch, setStudentSearch] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch, 300);
  const [studentStatusFilter, setStudentStatusFilter] = useState('All');

  const [isLoading, setIsLoading] = useState(true);

  const [exams, setExams] = useState<FacultyExam[]>([]);

  const aiQuestions = [
    { id: 1, topic: 'Schizophrenia Spectrum', question: 'Which symptom is considered a negative symptom of schizophrenia?', options: ['Delusions', 'Hallucinations', 'Avolition', 'Disorganized speech'], answer: 'Avolition', confidence: 'High', citation: 'Derived from Abnormal_Psych_DSM5_Guidelines.pdf, Page 42' },
    { id: 2, topic: 'Bipolar Disorders', question: 'What is the primary difference between Bipolar I and Bipolar II?', options: ['Presence of major depressive episodes', 'Presence of a full manic episode', 'Age of onset', 'Response to lithium'], answer: 'Presence of a full manic episode', confidence: 'High', citation: 'Derived from Abnormal_Psych_DSM5_Guidelines.pdf, Page 58' },
  ];

  const questionAnalytics = [
    { id: 1, question: 'Which of the following is a primary function of the amygdala?', options: [{ text: 'Memory consolidation', count: 12, percent: 15 }, { text: 'Emotional processing', count: 56, percent: 70, isCorrect: true }, { text: 'Motor control', count: 8, percent: 10 }, { text: 'Language comprehension', count: 4, percent: 5 }] },
    { id: 2, question: 'What characterizes the preoperational stage of cognitive development?', options: [{ text: 'Abstract reasoning', count: 5, percent: 6 }, { text: 'Object permanence', count: 15, percent: 19 }, { text: 'Symbolic thinking', count: 50, percent: 62, isCorrect: true }, { text: 'Conservation', count: 10, percent: 13 }] },
  ];

  const allStudentAnalytics = [
    { id: 101, name: 'Juan Santos', status: 'Completed', takenAt: 'July 15, 2026 10:30 AM', grade: '28/30 (93%)' },
    { id: 102, name: 'Ana Reyes', status: 'Completed', takenAt: 'July 16, 2026 02:15 PM', grade: '22/30 (73%)' },
    { id: 103, name: 'Luis Cruz', status: 'Not Taken', takenAt: 'Pending', grade: 'Pending' },
    { id: 104, name: 'Miguel Torres', status: 'Completed', takenAt: 'July 16, 2026 04:20 PM', grade: '25/30 (83%)' },
    { id: 105, name: 'Sofia Garcia', status: 'Completed', takenAt: 'July 17, 2026 09:10 AM', grade: '29/30 (97%)' },
    { id: 106, name: 'Diego Flores', status: 'Not Taken', takenAt: 'Pending', grade: 'Pending' },
    { id: 107, name: 'Carmen Villanueva', status: 'Completed', takenAt: 'July 17, 2026 11:45 AM', grade: '20/30 (67%)' },
  ];

  useEffect(() => {
    const fetchFacultyExams = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: dbExams, error } = await supabase
        .from('Exams')
        .select(`
          exam_id,
          exam_title,
          exam_subject,
          schedule_start,
          global_status,
          references
        `)
        //.eq('created_by', user.id) // Assuming faculty can only see exams they created, otherwise remove the eq filter to see all exams
        .order('schedule_start', { ascending: false });

      if (error) {
        console.error("Error fetching faculty exams:", error.message);
        setIsLoading(false);
        return;
      }

      const accentColors = ['bg-emerald-500', 'bg-amber-500', 'bg-slate-500', 'bg-blue-500'];

      const formattedExams = dbExams.map((exam: any, index: number) => {
        const dueDateObj = new Date(exam.schedule_start);
        
        // Calculate items based on references or default to 0 if we haven't built the Questions table yet
        const totalItems = Array.isArray(exam.references) ? exam.references.length * 10 : 0; 
        
        // Map database status to UI status
        const uiStatus = exam.global_status || 'Pending';

        return {
          id: exam.exam_id,
          title: exam.exam_title,
          target: exam.exam_subject || 'Comprehensive',
          items: totalItems, 
          status: uiStatus,
          dueDate: dueDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          color: accentColors[index % accentColors.length]
        };
      });

      setExams(formattedExams);
      setIsLoading(false);
    };

    fetchFacultyExams();
  }, []);

  const getStatusBadge = (status: string) => {
    if (status === 'Active') return <span className="shrink-0 px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    if (status === 'Pending') return <span className="shrink-0 px-2 py-1 bg-amber-100 text-amber-800 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    return <span className="shrink-0 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
  };

  const getActionLabel = (status: string) => {
    if (status === 'Pending') return 'Review Questions';
    if (status === 'Inactive') return 'View Results';
    return 'Manage Exam';
  };

  const toggleQuestionSelection = (id: number) => {
    if (selectedQuestions.includes(id)) {
      setSelectedQuestions(selectedQuestions.filter(qId => qId !== id));
    } else {
      setSelectedQuestions([...selectedQuestions, id]);
    }
  };

  const selectAllHighConfidence = () => {
    const highConfIds = aiQuestions.filter(q => q.confidence === 'High').map(q => q.id);
    setSelectedQuestions(highConfIds);
  };

  const confirmRejection = (id: number) => {
    setQuestionToReject(id);
    setShowRejectModal(true);
  };

  const currentExam = exams.find(e => e.id === selectedExam);

  const filteredExams = exams.filter(exam => {
    const matchesSearch = exam.title.toLowerCase().includes(debouncedExamSearch.toLowerCase()) || exam.target.toLowerCase().includes(debouncedExamSearch.toLowerCase());
    const matchesStatus = examStatusFilter === 'All' || exam.status === examStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredStudents = allStudentAnalytics.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(debouncedStudentSearch.toLowerCase());
    const matchesStatus = studentStatusFilter === 'All' || student.status === studentStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const {
    currentPage: studentPage,
    totalPages: totalStudentPages,
    currentItems: currentStudents,
    indexOfFirstItem: indexOfFirstStudent,
    indexOfLastItem: indexOfLastStudent,
    totalItems: totalStudents,
    nextPage,
    prevPage,
    resetPage
  } = usePagination(filteredStudents, 5);

  const handleStudentSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStudentSearch(e.target.value);
    resetPage();
  };

  const handleStudentStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStudentStatusFilter(e.target.value);
    resetPage();
  };

  if (selectedExam !== null && currentExam) {
    return (
      <div className="space-y-6 relative">
        <div className="flex items-center gap-2 text-sm mb-4">
          <button onClick={() => setSelectedExam(null)} className="text-blue-600 hover:underline font-bold">Exams</button>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600 font-bold">{currentExam.title}</span>
        </div>

        <div className="bg-slate-900 text-white rounded-t-xl flex gap-8 px-8 pt-5 border-b border-slate-700 overflow-x-auto">
          <button 
            onClick={() => setExamTab('settings')} 
            className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap ${examTab === 'settings' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Exam Settings
          </button>
          
          {currentExam.status === 'Inactive' ? (
             <button 
             onClick={() => setExamTab('question_analytics')} 
             className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap ${examTab === 'question_analytics' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
           >
             Question Analytics
           </button>
          ) : (
            <button 
              onClick={() => {
                if (currentExam.status !== 'Active') setExamTab('questions');
              }} 
              className={`pb-4 border-b-2 text-sm font-bold flex items-center gap-2 whitespace-nowrap ${examTab === 'questions' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'} ${currentExam.status === 'Active' ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={currentExam.status === 'Active' ? 'Questions are locked while the exam is active.' : ''}
            >
              {currentExam.status === 'Active' && <span>🔒</span>}
              Question Validation
            </button>
          )}

          <button 
            onClick={() => { setExamTab('analytics'); resetPage(); }} 
            className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap ${examTab === 'analytics' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Student Analytics
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-b-xl p-8 shadow-sm min-h-[500px]">
          
          {examTab === 'settings' && (
             <div className="max-w-3xl">
               <h2 className="text-xl font-bold text-slate-800 mb-2">Edit Exam Details</h2>
               <p className="text-sm text-slate-500 mb-8 font-bold">Manage availability, due dates, and general settings for this assessment.</p>
               
               <div className="space-y-6">
                 <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">Assessment Title</label>
                   <input type="text" defaultValue={currentExam.title} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                 </div>
 
                 <div className="flex flex-col md:flex-row gap-6">
                   <div className="flex-1">
                     <label className="block text-sm font-bold text-slate-700 mb-2">Target Audience</label>
                     <input type="text" defaultValue={currentExam.target} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                   <div className="flex-1">
                     <label className="block text-sm font-bold text-slate-700 mb-2">Due Date</label>
                     <input type="date" defaultValue={currentExam.dueDate} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                 </div>
                 
                 <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">Exam Status</label>
                   <select defaultValue={currentExam.status} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white">
                     <option value="Active">Active (Available for learners to take)</option>
                     <option value="Pending">Pending (Questions need checking and validation)</option>
                     <option value="Inactive">Inactive / Finished (Deadline passed)</option>
                   </select>
                 </div>
 
                 <div className="pt-6 border-t border-slate-100 mt-6">
                   <button className="px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                     Save Changes
                   </button>
                 </div>
               </div>
             </div>
          )}

          {examTab === 'question_analytics' && (
             <div>
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                 <div>
                   <h2 className="text-xl font-bold text-slate-800">Question Analytics</h2>
                   <p className="text-sm text-slate-500 font-bold mt-1">Review the answer selection breakdown for each question.</p>
                 </div>
               </div>
               <div className="space-y-8">
                 {questionAnalytics.map(qa => (
                   <div key={qa.id} className="p-6 border border-slate-200 rounded-xl bg-white shadow-sm">
                      <p className="text-lg font-bold text-slate-900 mb-6">{qa.question}</p>
                      <div className="space-y-4">
                         {qa.options.map((opt, idx) => (
                           <div key={idx} className="relative w-full bg-slate-100 rounded-lg h-12 flex items-center px-4 overflow-hidden">
                             <div 
                               className={`absolute left-0 top-0 h-full ${opt.isCorrect ? 'bg-emerald-200' : 'bg-slate-300'} opacity-50`} 
                               style={{ width: `${opt.percent}%` }}
                             ></div>
                             <div className="relative z-10 flex justify-between w-full text-sm font-bold text-slate-800">
                               <span>{opt.text} {opt.isCorrect && <span className="text-emerald-700 ml-2">(Correct)</span>}</span>
                               <span>{opt.count} students ({opt.percent}%)</span>
                             </div>
                           </div>
                         ))}
                      </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {examTab === 'questions' && (
            currentExam.status === 'Active' ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h3 className="text-xl font-bold text-slate-800">Validation Locked</h3>
                <p className="text-sm text-slate-500 font-bold mt-2 max-w-md">
                  This exam is currently active. The question validation process is locked because students may already be taking the assessment. Change the status to Pending to unlock.
                </p>
              </div>
            ) : (
              <div>
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                   <div>
                     <h2 className="text-xl font-bold text-slate-800">Pending Question Validations</h2>
                     <p className="text-sm text-slate-500 font-bold mt-1">Review AI generated items before deploying to students.</p>
                   </div>
                   <div className="flex gap-3 w-full md:w-auto">
                     <button onClick={selectAllHighConfidence} className="flex-1 md:flex-none px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                       Select High Confidence
                     </button>
                     <button className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50" disabled={selectedQuestions.length === 0}>
                       Batch Approve ({selectedQuestions.length})
                     </button>
                   </div>
                 </div>
                 
                 <div className="space-y-6">
                   {aiQuestions.map((q) => (
                     <div key={q.id} className={`p-6 border rounded-xl transition-colors ${selectedQuestions.includes(q.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                       <div className="flex justify-between items-start mb-4">
                         <div className="flex items-center gap-3">
                           <input 
                             type="checkbox" 
                             checked={selectedQuestions.includes(q.id)}
                             onChange={() => toggleQuestionSelection(q.id)}
                             className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                           />
                           <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{q.topic}</span>
                         </div>
                         <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${q.confidence === 'High' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                           {q.confidence} Confidence
                         </span>
                       </div>
 
                       <div className="mb-5 ml-8">
                         <p className="text-lg font-bold text-slate-900 mb-2">{q.question}</p>
                         <div className="bg-slate-100 border border-slate-200 p-3 rounded-md flex items-start gap-2">
                           <span className="text-lg">📚</span>
                           <p className="text-xs text-slate-600 font-bold leading-relaxed">{q.citation}</p>
                         </div>
                       </div>
                       
                       <div className="space-y-3 mb-6 ml-8">
                         {q.options.map((opt, idx) => (
                           <div key={idx} className={`p-4 border rounded-lg text-sm font-bold ${opt === q.answer ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-white border-slate-200 text-slate-600'}`}>
                             {opt} {opt === q.answer && <span className="ml-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">(Correct Answer)</span>}
                           </div>
                         ))}
                       </div>
                       
                       <div className="flex flex-wrap gap-3 pt-5 border-t border-slate-200 ml-8">
                         <button className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
                           Approve
                         </button>
                         <button className="px-5 py-2.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors shadow-sm">
                           Edit Manually
                         </button>
                         
                         <div className="relative group ml-auto flex items-center">
                           <button className="px-5 py-2.5 border border-purple-300 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-50 transition-colors shadow-sm flex items-center gap-1.5 mr-3">
                             <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                             Regenerate
                           </button>
                         </div>
 
                         <div className="relative group flex items-center">
                           <button onClick={() => confirmRejection(q.id)} className="px-5 py-2.5 bg-red-100 text-red-700 text-xs font-bold rounded-lg hover:bg-red-200 transition-colors shadow-sm">
                             Reject
                           </button>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            )
          )}

          {examTab === 'analytics' && (
            <div>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Student Analytics</h2>
                  <p className="text-sm text-slate-500 font-bold mt-1">Review student progress and completion grades for this assessment.</p>
                </div>
                <button className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export to CSV
                </button>
              </div>

              <div className="bg-slate-50 p-4 border border-slate-200 border-b-0 rounded-t-lg flex flex-col md:flex-row gap-4">
                <input 
                  type="text" 
                  placeholder="Search student name..." 
                  value={studentSearch}
                  onChange={handleStudentSearch}
                  className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select 
                  value={studentStatusFilter}
                  onChange={handleStudentStatusChange}
                  className="px-3 py-2 border border-slate-300 rounded text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Not Taken">Not Taken</option>
                </select>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-b-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date and Time Taken</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Grade</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {currentStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-sm font-bold text-slate-500">No students match your filter criteria.</td>
                      </tr>
                    ) : (
                      currentStudents.map(student => (
                        <tr key={student.id} className="hover:bg-slate-50 transition-colors bg-white">
                          <td className="p-4 font-bold text-slate-800">{student.name}</td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${student.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-500">{student.takenAt}</td>
                          <td className="p-4 font-bold text-slate-700">{student.grade}</td>
                          <td className="p-4 text-right flex gap-3 justify-end">
                            <button disabled={student.status !== 'Completed'} className={`text-xs font-bold ${student.status === 'Completed' ? 'text-blue-600 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}>
                              View Answers
                            </button>
                            <button disabled={student.status !== 'Completed'} className={`text-xs font-bold ${student.status === 'Completed' ? 'text-red-600 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}>
                              Reset Attempt
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                
                <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-500">
                  <span>Showing {filteredStudents.length > 0 ? indexOfFirstStudent + 1 : 0} to {Math.min(indexOfLastStudent, filteredStudents.length)} of {totalStudents} students</span>
                  <div className="flex gap-1.5">
                    <button 
                      onClick={prevPage}
                      disabled={studentPage === 1}
                      className={`px-3 py-1.5 border rounded shadow-sm transition-colors ${studentPage === 1 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      Prev
                    </button>
                    <button 
                      onClick={nextPage}
                      disabled={studentPage === totalStudentPages || totalStudentPages === 0}
                      className={`px-3 py-1.5 border rounded shadow-sm transition-colors ${studentPage === totalStudentPages || totalStudentPages === 0 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {showRejectModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Reject Item?</h3>
              </div>
              <p className="text-sm text-slate-600 font-bold mb-6 pl-13">
                Are you sure you want to discard this question? The system will automatically generate a new item to replace it.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors"
                >
                  Yes, Reject & Replace
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Exam Management</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Create, monitor, and validate mock exams for your cohorts.</p>
        </div>
        <button 
          onClick={() => router.push('/faculty/exams/create')}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
        >
          + Create New Exam
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 mb-2">
        <div className="flex-1 relative">
          <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="Search by title or target audience" 
            value={examSearchQuery}
            onChange={(e) => setExamSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="w-full sm:w-48">
          <select 
            value={examStatusFilter}
            onChange={(e) => setExamStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
      
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
          Loading exam data...
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full">
        {filteredExams.map((exam) => (
          <div 
            key={exam.id} 
            className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col relative"
          >
            <div className={`h-1.5 w-full ${exam.color}`}></div>
            
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg text-slate-800 leading-snug pr-3">{exam.title}</h3>
                  {getStatusBadge(exam.status)}
                </div>
                
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Target Scope</p>
                <p className="text-sm text-slate-700 font-bold mb-4">{exam.target}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Due Date</p>
                    <p className="text-sm text-slate-700 font-bold">{exam.dueDate}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Items</p>
                    <p className="text-sm text-slate-700 font-bold">{exam.items}</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-5 border-t border-slate-100">
                <button 
                  onClick={() => { setSelectedExam(exam.id); setExamTab('settings'); }}
                  className={`w-full py-2.5 text-sm font-bold rounded-lg transition-colors shadow-sm ${
                    exam.status === 'Pending' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {getActionLabel(exam.status)}
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredExams.length === 0 && (
          <div className="col-span-full p-8 text-center text-sm font-bold text-slate-500 bg-white rounded-xl border border-slate-200">
            No exams match your search criteria.
          </div>
        )}
      </div>
      )}
    </div>
  );
}
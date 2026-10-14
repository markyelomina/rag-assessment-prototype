'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface DashboardExam {
  id: string;
  title: string;
  target: string;
  items: number;
  status: string;
  dueDate: string;
}

export default function FacultyDashboardPage() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [facultyName, setFacultyName] = useState<string>('Instructor');
  const [examsList, setExamsList] = useState<DashboardExam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [dashboardStats, setDashboardStats] = useState({
    totalExams: 0,
    activeExams: 0,
    pendingReviews: 0,
    overallCompletion: '92%' // Placeholder 
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      // 1. Get the active authenticated session
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setIsLoading(false);
        return;
      }

      // 2. Fetch Profile, Exams (with items count), and Assigned Cohort Students
      const [profileResponse, examsResponse, cohortsResponse] = await Promise.all([
        supabase
          .from('Users')
          .select('name')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('Exams')
          .select(`
            exam_id, 
            exam_title, 
            exam_subject, 
            schedule_start, 
            global_status, 
            references,
            "Mock Exam Items" ( exam_session_id )
          `)
          //.eq('created_by', user.id)
          .order('schedule_start', { ascending: false }),
        supabase
          .from('Cohort Teachers')
          .select(`
            Cohorts (
              Users (
                role_id,
                "Student Attempts" (
                  exam_id
                )
              )
            )
          `)
          .eq('teacher_id', user.id)
      ]);

      if (cohortsResponse.error) {
        console.error("COHORTS QUERY FAILED:", cohortsResponse.error);
      }

      if (profileResponse.data?.name) {
        setFacultyName(profileResponse.data.name.split(' ')[0]);
      }

      let activeCount = 0;
      let pendingCount = 0;
      let activeExamIds: string[] = [];
      let formattedExams: DashboardExam[] = [];

      if (examsResponse.data) {
        formattedExams = examsResponse.data.map((exam: any) => {
          const dueDateObj = new Date(exam.schedule_start);
          
          // Count items dynamically from the Mock Exam Items table
          const totalItems = exam['Mock Exam Items']?.length || 0;
          const status = exam.global_status || 'Pending';

          if (status === 'Active') {
            activeCount++;
            activeExamIds.push(exam.exam_id); // Store ID for the completion calculation
          }
          if (status === 'Pending') pendingCount++;

          return {
            id: exam.exam_id,
            title: exam.exam_title,
            target: exam.exam_subject || 'Comprehensive',
            items: totalItems,
            status: status,
            dueDate: dueDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          };
        });

        setExamsList(formattedExams);
      }

      // Calculate Overall Completion % dynamically
      let completionText = 'N/A';
      
      if (cohortsResponse.data && activeExamIds.length > 0) {
        // Flatten all students across all assigned cohorts
        const allStudents = cohortsResponse.data.flatMap(record => {
          const cohortData = (record as any).Cohorts;
          return (cohortData?.Users || []).filter((u: any) => u.role_id === 1);
        });

        if (allStudents.length > 0) {
          let completedAllCount = 0;

          // Check if each student has an attempt logged for every active exam
          allStudents.forEach(student => {
            const attempts = student['Student Attempts'] || [];
            const studentExamIds = attempts.map((a: any) => a.exam_id);
            
            const hasCompletedAll = activeExamIds.every(id => studentExamIds.includes(id));
            if (hasCompletedAll) completedAllCount++;
          });

          completionText = Math.round((completedAllCount / allStudents.length) * 100) + '%';
        } else {
          completionText = '0%'; // Teacher has cohorts, but no students are enrolled yet
        }
      } else if (activeExamIds.length === 0) {
        completionText = '100%'; // If there are 0 active exams, they are 100% caught up
      }

      setDashboardStats({
        totalExams: formattedExams.length,
        activeExams: activeCount,
        pendingReviews: pendingCount,
        overallCompletion: completionText
      });

      setIsLoading(false);
    };

    fetchDashboardData();
  }, []);

  const getStatusBadge = (status: string) => {
    if (status === 'Active') return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    if (status === 'Pending') return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    return <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
  };

  const getActionLabel = (status: string) => {
    if (status === 'Pending') return 'Review Questions';
    if (status === 'Inactive') return 'View Results';
    return 'Edit Settings';
  };

  const getActionRoute = (status: string, examId: string) => {
    if (status === 'Pending') return `/faculty/exams?examId=${examId}&view=review`;
    if (status === 'Inactive') return `/faculty/exams?examId=${examId}&view=results`;
    return `/faculty/exams?examId=${examId}&view=edit`; // Default for Active
  };

  if (isLoading) {
    return (
      <FullScreenLoader 
        isOpen={isLoading} 
        message="Loading dashboard overview..." 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome Back, {facultyName}</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Here is a summary of your upcoming exams and pending validations for this week.</p>
        </div>
        <button 
          onClick={() => {setIsNavigating(true);  router.push('/faculty/exams/create')}}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
        >
          + Create New Exam
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div 
          onClick={() => router.push('/faculty/exams')}
          className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-blue-600 transition-colors">Total Exams</span>
          <p className="text-4xl font-bold text-slate-800 mt-2 group-hover:text-blue-700 transition-colors">{dashboardStats.totalExams}</p>
        </div>
        <div 
          onClick={() => router.push('/faculty/exams')}
          className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all group"
        >
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-emerald-600 transition-colors">Active Exams</span>
          <p className="text-4xl font-bold text-emerald-600 mt-2 group-hover:text-emerald-700 transition-colors">{dashboardStats.activeExams}</p>
        </div>
        <div 
          onClick={() => router.push('/faculty/exams')}
          className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center cursor-pointer hover:shadow-md hover:border-amber-200 transition-all group"
        >
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-amber-600 transition-colors">Pending Validations</span>
          <p className="text-4xl font-bold text-amber-600 mt-2 group-hover:text-amber-700 transition-colors">{dashboardStats.pendingReviews}</p>
        </div>
        <div 
          onClick={() => router.push('/faculty/analytics')}
          className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider group-hover:text-blue-800 transition-colors">Overall Completion</span>
          <p className="text-4xl font-bold text-blue-700 mt-2 group-hover:text-blue-800 transition-colors">{dashboardStats.overallCompletion}</p>
          <p className="text-[10px] text-slate-500 mt-2 font-bold leading-tight">Calculated as the percentage of enrolled students who have submitted all active exams. Adding new exams adjusts this metric dynamically.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mt-8">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-base text-slate-700">Exam Overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                <th className="p-6">Exam Title</th>
                <th className="p-6">Target Audience</th>
                <th className="p-6">Items</th>
                <th className="p-6 cursor-pointer hover:text-slate-700 transition-colors group">
                  <div className="flex items-center gap-1">
                    Status
                    <svg className="w-3 h-3 text-slate-300 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  </div>
                </th>
                <th className="p-6 cursor-pointer hover:text-slate-700 transition-colors group">
                  <div className="flex items-center gap-1">
                    Due Date
                    <svg className="w-3 h-3 text-slate-300 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  </div>
                </th>
                <th className="p-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {examsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-bold">
                    You haven't created any exams yet.
                  </td>
                </tr>
              ) : (
                examsList.map((exam) => (
                  <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-800">{exam.title}</td>
                    <td className="p-6 font-bold text-slate-500">{exam.target}</td>
                    <td className="p-6 font-bold text-slate-700">{exam.items}</td>
                    <td className="p-6">{getStatusBadge(exam.status)}</td>
                    <td className="p-6 font-bold text-slate-600">{exam.dueDate}</td>
                    <td className="p-6">
                      <button 
                        onClick={() => router.push(getActionRoute(exam.status, exam.id))}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        {getActionLabel(exam.status)}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <FullScreenLoader 
    isOpen={isNavigating} 
    message="Loading exam creation page..." 
  />
    </div>
  );
}
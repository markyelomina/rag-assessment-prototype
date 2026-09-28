'use client';

import React, { useState, useEffect, useRef } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { usePagination } from '@/hooks/usePagination';
import { supabase } from '@/lib/supabaseClient';

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface Cohort {
  id: string;
  name: string;
  description: string;
  color: string;
  account_status: string;
  dateRange: string;
  start_date: string;
  end_date: string;
  teachers: Teacher[];
  students: Student[];
}

export default function AdminCohortsPage() {
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [cohortTab, setCohortTab] = useState('active');
  const [isLoading, setIsLoading] = useState(true);

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignTeacherModal, setShowAssignTeacherModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Form State
  const [cohortName, setCohortName] = useState('');
  const [cohortDesc, setCohortDesc] = useState('');
  const [cohortStart, setCohortStart] = useState('');
  const [cohortEnd, setCohortEnd] = useState('');
  const [batchEmails, setBatchEmails] = useState('');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [allUsersDB, setAllUsersDB] = useState<any[]>([]); // Cache for assigning
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCohortsData = async () => {
    setIsLoading(true);
    
    // Fetch Cohorts, Users, and the new junction table
    const [cohortsRes, usersRes, teachersRes] = await Promise.all([
      supabase.from('Cohorts').select('*').order('created_at', { ascending: false }),
      supabase.from('Users').select('user_id, name, email, role_id, cohort_id'),
      supabase.from('Cohort Teachers').select('*')
    ]);

    if (cohortsRes.error) {
      console.error("Error fetching cohorts:", cohortsRes.error);
      setIsLoading(false);
      return;
    }

    const allUsers = usersRes.data || [];
    setAllUsersDB(allUsers);
    const junctionData = teachersRes.data || [];
    const colors = ['bg-indigo-500', 'bg-teal-500', 'bg-blue-500', 'bg-emerald-500', 'bg-violet-500'];

    const mappedCohorts = cohortsRes.data.map((cohort: any, index: number) => {
      // Find Students (role 1, matching cohort_id)
      const enrolledStudents = allUsers
        .filter(u => u.role_id === 1 && u.cohort_id === cohort.cohort_id)
        .map(u => ({ id: u.user_id, name: u.name, email: u.email || 'No email' }));

      // Find Teachers (role 2, using the junction table)
      const assignedTeacherIds = junctionData
        .filter(ct => ct.cohort_id === cohort.cohort_id)
        .map(ct => ct.teacher_id);
        
      const assignedTeachers = allUsers
        .filter(u => u.role_id === 2 && assignedTeacherIds.includes(u.user_id))
        .map(u => ({ id: u.user_id, name: u.name, email: u.email || 'No email' }));

      let displayDate = 'TBD';
      let rawStart = '';
      let rawEnd = '';
      
      if (cohort.start_date && cohort.end_date) {
        rawStart = cohort.start_date.substring(0, 7); // "YYYY-MM"
        rawEnd = cohort.end_date.substring(0, 7);
        const start = new Date(cohort.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const end = new Date(cohort.end_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        displayDate = `${start} to ${end}`;
      }

      return {
        id: cohort.cohort_id,
        name: cohort.cohort_name,
        description: cohort.description || 'No description provided.',
        color: colors[index % colors.length],
        account_status: cohort.account_status,
        dateRange: displayDate,
        start_date: rawStart,
        end_date: rawEnd,
        teachers: assignedTeachers, 
        students: enrolledStudents
      };
    });

    setCohorts(mappedCohorts);
    setIsLoading(false);
  };

  const logWorkspaceAction = async (actionDesc: string, severity: string = 'Info') => {
      const { data: sessionData } = await supabase.auth.getUser();
      await supabase.from('AuditLogs').insert([{
        user_email: sessionData?.user?.email || 'Unknown Admin',
        role: 'Admin',
        action: actionDesc,
        type: 'Workspace Management',
        severity,
        ip_address: 'Internal',
        user_agent: navigator.userAgent
      }]);
    };

  useEffect(() => {
    fetchCohortsData();
  }, []);

  const handleCreateCohortSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const calculatedStatus = cohortEnd < currentYearMonth ? 'Archived' : 'Active';

    const { error } = await supabase
      .from('Cohorts')
      .insert([{
        cohort_name: cohortName,
        description: cohortDesc,
        start_date: `${cohortStart}-01`, 
        end_date: `${cohortEnd}-01`,
        account_status: calculatedStatus 
      }]);

    if (!error) {
      await logWorkspaceAction(`Created new cohort: ${cohortName} (${calculatedStatus})`);
      await fetchCohortsData();
      closeModals();
    }
    setIsSubmitting(false);
  };

  const handleEditCohortSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const calculatedStatus = cohortEnd < currentYearMonth ? 'Archived' : 'Active';

    const { error } = await supabase
      .from('Cohorts')
      .update({
        cohort_name: cohortName,
        description: cohortDesc,
        start_date: `${cohortStart}-01`, 
        end_date: `${cohortEnd}-01`,
        account_status: calculatedStatus 
      })
      .eq('cohort_id', selectedCohort);

    if (!error) {
      await logWorkspaceAction(`Updated cohort details for: ${cohortName}`);
      await fetchCohortsData();
      setShowEditModal(false);
    }
    setIsSubmitting(false);
  };

  // --- Workspace Actions ---
  const handleAssignTeacher = async (teacherId: string) => {
    await supabase.from('Cohort Teachers').insert([{ cohort_id: selectedCohort, teacher_id: teacherId }]);
    await logWorkspaceAction(`Assigned teacher ID ${teacherId} to cohort ID ${selectedCohort}`);
    fetchCohortsData();
  };

  const handleRemoveTeacher = async (teacherId: string) => {
    await supabase.from('Cohort Teachers').delete().eq('cohort_id', selectedCohort).eq('teacher_id', teacherId);
    await logWorkspaceAction(`Removed teacher ID ${teacherId} from cohort ID ${selectedCohort}`, 'Warning');
    fetchCohortsData();
  };

  const handleAddStudent = async (studentId: string) => {
    await supabase.from('Users').update({ cohort_id: selectedCohort }).eq('user_id', studentId);
    await logWorkspaceAction(`Manually enrolled student ID ${studentId} into cohort ID ${selectedCohort}`);
    fetchCohortsData();
  };

  const handleRemoveStudent = async (studentId: string) => {
    await supabase.from('Users').update({ cohort_id: null }).eq('user_id', studentId);
    await logWorkspaceAction(`Removed student ID ${studentId} from cohort`, 'Warning');
    fetchCohortsData();
  };

  const handleBatchImport = async () => {
    setIsSubmitting(true);
    const emailList = batchEmails.split(/[,\n]+/).map(e => e.trim()).filter(e => e !== '');
    
    // Find matching students in the database
    const studentsToUpdate = allUsersDB.filter(u => u.role_id === 1 && emailList.includes(u.email));
    const userIds = studentsToUpdate.map(u => u.user_id);

    if (userIds.length > 0) {
      await supabase.from('Users').update({ cohort_id: selectedCohort }).in('user_id', userIds);
      await logWorkspaceAction(`Batch assigned ${userIds.length} students to cohort ID ${selectedCohort}`);
      await fetchCohortsData();
    }
    
    setShowBatchModal(false);
    setBatchEmails('');
    setIsSubmitting(false);
  };

  const openEditModal = (cohort: Cohort) => {
    setCohortName(cohort.name);
    setCohortDesc(cohort.description);
    setCohortStart(cohort.start_date);
    setCohortEnd(cohort.end_date);
    setShowEditModal(true);
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setCohortName('');
    setCohortDesc('');
    setCohortStart('');
    setCohortEnd('');
  };

  const currentCohort = cohorts.find(c => c.id === selectedCohort);

  const filteredStudents = currentCohort?.students.filter(student =>
    student.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
    student.email.toLowerCase().includes(studentSearch.toLowerCase())
  ) || [];

  const {
    currentPage, totalPages, currentItems: currentStudents,
    indexOfFirstItem: indexOfFirstStudent, indexOfLastItem: indexOfLastStudent, totalItems, nextPage, prevPage, resetPage
  } = usePagination(filteredStudents, 5);

  const displayedCohorts = cohorts.filter(c => 
    cohortTab === 'active' ? c.account_status === 'Active' : c.account_status === 'Archived'
  );

  // Available users for assignment dropdowns
  const availableTeachers = allUsersDB.filter(u => u.role_id === 2 && !currentCohort?.teachers.some(t => t.id === u.user_id));
  const availableStudents = allUsersDB.filter(u => u.role_id === 1 && u.cohort_id !== selectedCohort);

  if (selectedCohort !== null && currentCohort) {
    return (
      <div className="space-y-6 relative">
        <div className="flex items-center gap-3 mb-2">
          <button 
            onClick={() => { setSelectedCohort(null); setStudentSearch(''); }} 
            className="text-slate-500 hover:text-blue-600 font-bold text-sm flex items-center gap-1"
          >
            &larr; Back to Cohorts
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-inner shrink-0 ${currentCohort.color}`}>
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{currentCohort.name}</h1>
              <p className="text-sm text-slate-500 font-bold">{currentCohort.description}</p>
              <div className="flex gap-2 mt-2">
                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  currentCohort.account_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                 }`}>
                  {currentCohort.account_status}
                 </span>
                 <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 uppercase tracking-wider">
                   {currentCohort.dateRange}
                 </span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => openEditModal(currentCohort)}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Edit Cohort Details
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Teachers Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-700">Assigned Teachers / Examiners</h3>
              <button 
                onClick={() => setShowAssignTeacherModal(true)}
                className="text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded hover:bg-blue-700 shadow-sm flex items-center gap-1"
              >
                + Assign
              </button>
            </div>
            <div className="p-2">
              {currentCohort.teachers.length === 0 ? (
                <EmptyState title="No Teachers Assigned" message="There are currently no teachers assigned to this cohort workspace." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {currentCohort.teachers.map(teacher => (
                    <li key={teacher.id} className="p-3 flex justify-between items-center hover:bg-slate-50 rounded-lg transition-colors group">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{teacher.name}</p>
                          <p className="text-xs font-bold text-slate-500">{teacher.email}</p>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveTeacher(teacher.id)} className="text-xs text-red-500 font-bold hover:underline">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Students Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <h3 className="font-bold text-slate-700">Enrolled Students ({currentCohort.students.length})</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowBatchModal(true)}
                    className="text-xs font-bold text-slate-700 bg-white border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 shadow-sm flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Batch Add by Email
                  </button>
                  <button 
                    onClick={() => setShowAddStudentModal(true)}
                    className="text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded hover:bg-blue-700 shadow-sm flex items-center gap-1"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center gap-4">
                <input 
                  type="text" 
                  placeholder="Search enrolled students..." 
                  value={studentSearch}
                  onChange={(e) => { setStudentSearch(e.target.value); resetPage(); }}
                  className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" 
                />
              </div>
            </div>
            
            <div className="flex-1 p-2">
              {currentStudents.length === 0 ? (
                <EmptyState title="No Students Found" message="No enrolled students match your current search query." />
              ) : (
                <ul className="flex flex-col">
                  {currentStudents.map(student => (
                    <li key={student.id} className="p-3 flex justify-between items-center hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{student.name}</p>
                          <p className="text-xs font-bold text-slate-500">{student.email}</p>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveStudent(student.id)} className="text-xs text-red-500 font-bold hover:underline">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-xs font-bold text-slate-500">
              <span>Showing {filteredStudents.length > 0 ? indexOfFirstStudent + 1 : 0} to {Math.min(indexOfLastStudent, filteredStudents.length)} of {totalItems} students</span>
              <div className="flex gap-1.5">
                <button onClick={prevPage} disabled={currentPage === 1} className="px-3 py-1.5 border rounded border-slate-300 bg-white hover:bg-slate-50 shadow-sm disabled:opacity-50">Prev</button>
                <button onClick={nextPage} disabled={currentPage === totalPages || totalPages === 0} className="px-3 py-1.5 border rounded border-slate-300 bg-white hover:bg-slate-50 shadow-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        </div>

        {/* --- Workspace Action Modals --- */}
        {showEditModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Edit Cohort Details</h3>
              <form onSubmit={handleEditCohortSubmit} className="space-y-4">
                <input type="text" value={cohortName} onChange={(e) => setCohortName(e.target.value)} required className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-1 focus:ring-blue-500" />
                <textarea value={cohortDesc} onChange={(e) => setCohortDesc(e.target.value)} rows={3} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-1 focus:ring-blue-500 resize-none" />
                <div className="grid grid-cols-2 gap-4">
                  <input type="month" value={cohortStart} onChange={(e) => setCohortStart(e.target.value)} required className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold" />
                  <input type="month" value={cohortEnd} onChange={(e) => setCohortEnd(e.target.value)} required className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold" />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setShowEditModal(false)} className="px-5 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showAssignTeacherModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-lg font-bold text-slate-800">Assign Teacher</h3>
                <button onClick={() => setShowAssignTeacherModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-2">
                {availableTeachers.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No available teachers found.</p>
                ) : availableTeachers.map(u => (
                  <div key={u.user_id} className="flex justify-between items-center p-3 bg-slate-50 border rounded-lg">
                    <div><p className="text-sm font-bold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div>
                    <button onClick={() => handleAssignTeacher(u.user_id)} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700">Assign</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showAddStudentModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-lg font-bold text-slate-800">Add Student to Cohort</h3>
                <button onClick={() => setShowAddStudentModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-2">
                {availableStudents.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">All students are already in this cohort.</p>
                ) : availableStudents.map(u => (
                  <div key={u.user_id} className="flex justify-between items-center p-3 bg-slate-50 border rounded-lg">
                    <div><p className="text-sm font-bold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div>
                    <button onClick={() => handleAddStudent(u.user_id)} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700">Add</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showBatchModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-2">Batch Assign Students</h3>
              <p className="text-sm text-slate-500 mb-4 font-bold">Paste a comma-separated or newline-separated list of student emails already registered on the platform.</p>
              <textarea 
                value={batchEmails}
                onChange={(e) => setBatchEmails(e.target.value)}
                placeholder="juan@stud.edu, ana@stud.edu..." 
                rows={5}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-1 focus:ring-blue-500 resize-none mb-4" 
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowBatchModal(false); setBatchEmails(''); }} className="px-5 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg">Cancel</button>
                <button onClick={handleBatchImport} disabled={isSubmitting || !batchEmails} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50">Assign Users</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Main Cohort Directory View ---
  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cohort Workspace Management</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Organize user groups and assign teachers for targeted mock exams.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
        >
          + Create Cohort
        </button>
      </div>

      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-6">
          <button 
            onClick={() => setCohortTab('active')} 
            className={`pb-3 border-b-2 text-sm font-bold ${cohortTab === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Active Cohorts
          </button>
          <button 
            onClick={() => setCohortTab('archived')} 
            className={`pb-3 border-b-2 text-sm font-bold ${cohortTab === 'archived' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Archived
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">Loading cohorts...</div>
      ) : displayedCohorts.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <EmptyState title="No Cohorts Found" message="Create a new cohort to start organizing your users." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full">
          {displayedCohorts.map((cohort) => (
            <div key={cohort.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col relative">
              <div className={`h-1.5 w-full ${cohort.color}`}></div>
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg text-slate-800 leading-snug pr-3">{cohort.name}</h3>
                    <span className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      cohort.account_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {cohort.account_status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Schedule</p>
                  <p className="text-sm text-slate-700 font-bold mb-4">{cohort.dateRange}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Teachers</p><p className="text-sm text-slate-700 font-bold">{cohort.teachers.length}</p></div>
                    <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Students</p><p className="text-sm text-slate-700 font-bold">{cohort.students.length}</p></div>
                  </div>
                </div>
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <button onClick={() => setSelectedCohort(cohort.id)} className="w-full py-2.5 text-sm font-bold rounded-lg transition-colors shadow-sm bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200">
                    Manage Workspace
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">Create New Cohort</h3>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form onSubmit={handleCreateCohortSubmit} className="space-y-4">
              <label className="block text-sm font-bold text-slate-700 mb-1">Cohort Name</label>
              <input type="text" value={cohortName} onChange={(e) => setCohortName(e.target.value)} placeholder="e.g. Intensive Program 2027" required className="w-full px-4 py-2 border rounded-lg text-sm font-bold focus:ring-blue-500" />
              <label className="block text-sm font-bold text-slate-700 mb-1">Description</label>
              <textarea value={cohortDesc} onChange={(e) => setCohortDesc(e.target.value)} rows={3} required className="w-full px-4 py-2 border rounded-lg text-sm font-bold focus:ring-blue-500 resize-none" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Start Month</label>
                  <input type="month" value={cohortStart} onChange={(e) => setCohortStart(e.target.value)} required className="w-full px-4 py-2 border rounded-lg text-sm font-bold focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">End Month</label>
                  <input type="month" value={cohortEnd} onChange={(e) => setCohortEnd(e.target.value)} required className="w-full px-4 py-2 border rounded-lg text-sm font-bold focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t mt-2">
                <button type="button" onClick={closeModals} className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">Create Workspace</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
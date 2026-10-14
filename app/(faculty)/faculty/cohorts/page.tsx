'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';
import {
  calculateTOSScoring,
  identifyCohortWeakSpots,
  DEFAULT_BLEPP_WEIGHTS,
  QuestionDefinition,
  StudentAttemptScore,
  CohortWeakSpot
} from '@/lib/psychometrics';

interface CohortSummary {
  cohort_id: string;
  cohort_name: string;
  description: string | null;
  account_status: string;
  start_date: string | null;
  end_date: string | null;
  student_count: number;
  exam_count: number;
  material_count: number;
}

interface AssignedMaterial {
  id: string;
  material_id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_size_mb: number;
  subject: string;
  uploaded_by: string;
  created_at: string;
}

interface StudentRecord {
  user_id: string;
  name: string;
  email: string;
  account_status: string;
  created_at: string;
}

interface AssignedExam {
  exam_id: string;
  exam_title: string;
  exam_subject: string;
  global_status: string;
  schedule_start: string | null;
  schedule_end: string | null;
  passing_score: number;
  grading_logic: string;
}

interface LibraryItem {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_size_mb: number;
  subject: string;
  faculty?: {
    name: string;
    email: string;
  };
}

interface StudentReadinessEntry {
  userId: string;
  name: string;
  email: string;
  completedExams: number;
  rawAverage: number;
  tosWeightedScore: number;
  readinessStatus: 'Projected Pass' | 'At Risk' | 'No Attempts';
}

export default function FacultyCohortsPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [selectedCohort, setSelectedCohort] = useState<CohortSummary | null>(null);
  const [cohortSearch, setCohortSearch] = useState('');

  // Detail View State
  const [activeTab, setActiveTab] = useState<'materials' | 'students' | 'exams' | 'analytics'>('materials');
  const [assignedMaterials, setAssignedMaterials] = useState<AssignedMaterial[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Assign Material Modal States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableLibrary, setAvailableLibrary] = useState<LibraryItem[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSubjectFilter, setModalSubjectFilter] = useState('All');
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);

  // Macro Cohort Analytics States
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [cohortTOSPassRate, setCohortTOSPassRate] = useState<number>(0);
  const [cohortAvgTOS, setCohortAvgTOS] = useState<number>(0);
  const [domainBreakdown, setDomainBreakdown] = useState<Record<string, { accuracy: number; totalItems: number; weight: number }>>({});
  const [cohortWeakSpots, setCohortWeakSpots] = useState<CohortWeakSpot[]>([]);
  const [studentReadinessList, setStudentReadinessList] = useState<StudentReadinessEntry[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');

  // Fetch all cohorts assigned to this teacher
  const fetchTeacherCohorts = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    const { data: userCohorts, error } = await supabase
      .from('Cohort Teachers')
      .select('cohort_id, Cohorts(*)')
      .eq('teacher_id', user.id);

    if (error || !userCohorts) {
      console.error('Failed to load cohorts:', error);
      setIsLoading(false);
      return;
    }

    const cohortList: CohortSummary[] = await Promise.all(
      userCohorts.map(async (row: any) => {
        const c = row.Cohorts;
        
        const { count: studentCount } = await supabase
          .from('Users')
          .select('user_id', { count: 'exact', head: true })
          .eq('cohort_id', c.cohort_id);

        const { count: examCount } = await supabase
          .from('Exam_Cohorts')
          .select('exam_id', { count: 'exact', head: true })
          .eq('cohort_id', c.cohort_id);

        const { count: materialCount } = await supabase
          .from('Cohort_Materials')
          .select('id', { count: 'exact', head: true })
          .eq('cohort_id', c.cohort_id);

        return {
          cohort_id: c.cohort_id,
          cohort_name: c.cohort_name,
          description: c.description,
          account_status: c.account_status || 'Active',
          start_date: c.start_date,
          end_date: c.end_date,
          student_count: studentCount || 0,
          exam_count: examCount || 0,
          material_count: materialCount || 0,
        };
      })
    );

    setCohorts(cohortList);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTeacherCohorts();
  }, []);

  // Fetch Macro Cohort Analytics with Multi-Attempt & Rule-Based Resolution
  const fetchCohortAnalytics = async (cohortId: string) => {
    setIsAnalyticsLoading(true);

    try {
      // 1. Get all students in this cohort
      const { data: enrolledStudents } = await supabase
        .from('Users')
        .select('user_id, name, email')
        .eq('cohort_id', cohortId);

      const studentList = enrolledStudents || [];
      const studentIds = studentList.map(s => s.user_id);

      // 2. Get all exams assigned to this cohort with their grading logic
      const { data: examLinks } = await supabase
        .from('Exam_Cohorts')
        .select(`
          exam_id,
          Exams ( exam_id, exam_title, exam_subject, grading_logic )
        `)
        .eq('cohort_id', cohortId);

      const assignedExamIds: string[] = [];
      const examConfigMap: Record<string, { gradingLogic: string; title: string; subject: string }> = {};

      (examLinks || []).forEach((el: any) => {
        if (el.exam_id) {
          assignedExamIds.push(el.exam_id);
          const ex = Array.isArray(el.Exams) ? el.Exams[0] : el.Exams;
          examConfigMap[el.exam_id] = {
            gradingLogic: ex?.grading_logic || 'highest',
            title: ex?.exam_title || 'Untitled Exam',
            subject: ex?.exam_subject || 'General Scope'
          };
        }
      });

      if (studentIds.length === 0 || assignedExamIds.length === 0) {
        setCohortTOSPassRate(0);
        setCohortAvgTOS(0);
        setDomainBreakdown({});
        setCohortWeakSpots([]);
        setStudentReadinessList(studentList.map(s => ({
          userId: s.user_id,
          name: s.name,
          email: s.email,
          completedExams: 0,
          rawAverage: 0,
          tosWeightedScore: 0,
          readinessStatus: 'No Attempts'
        })));
        setIsAnalyticsLoading(false);
        return;
      }

      // 3. Fetch questions for assigned exams
      const { data: rawQuestions } = await supabase
        .from('Mock Exam Items')
        .select('id, exam_session_id, subject, competency, correct_answer, options')
        .in('exam_session_id', assignedExamIds);

      const questionDefs: QuestionDefinition[] = (rawQuestions || []).map(q => ({
        id: q.id,
        subject: q.subject || 'General Scope',
        competency: q.competency || 'General Competency',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correct_answer || ''
      }));

      // 4. Case-Insensitive Fetch for Completed Student Attempts
      const { data: allStudentAttempts } = await supabase
        .from('Student Attempts')
        .select('attempt_id, student_id, exam_id, final_score, exam_status, completed_at')
        .in('student_id', studentIds)
        .in('exam_id', assignedExamIds)
        .order('completed_at', { ascending: true });

      const safeRawAttempts = allStudentAttempts || [];
      const completedAttempts = safeRawAttempts.filter(
        a => a.exam_status?.toLowerCase() === 'completed'
      );
      const attemptList = completedAttempts.length > 0 ? completedAttempts : safeRawAttempts;
      const attemptIds = attemptList.map(a => a.attempt_id);

      // 5. Fetch student answers
      let answersData: any[] = [];
      if (attemptIds.length > 0) {
        const { data: ans } = await supabase
          .from('Student Answers')
          .select('attempt_id, question_id, is_correct, selected_option')
          .in('attempt_id', attemptIds);
        answersData = ans || [];
      }

      // 6. Group Attempts by [Student -> Exam] & Resolve According to Grading Rules
      const qualifyingAttemptsForCohort: any[] = [];
      let totalCohortTOSSum = 0;
      let evaluatedStudentsCount = 0;
      let passingStudentsCount = 0;

      const readinessRoster: StudentReadinessEntry[] = studentList.map(student => {
        const studentRawAttempts = attemptList.filter(a => a.student_id === student.user_id);

        if (studentRawAttempts.length === 0) {
          return {
            userId: student.user_id,
            name: student.name,
            email: student.email,
            completedExams: 0,
            rawAverage: 0,
            tosWeightedScore: 0,
            readinessStatus: 'No Attempts'
          };
        }

        // Group student's attempts by exam_id
        const examBuckets: Record<string, any[]> = {};
        studentRawAttempts.forEach(att => {
          if (!examBuckets[att.exam_id]) examBuckets[att.exam_id] = [];
          examBuckets[att.exam_id].push(att);
        });

        // Resolve one qualifying score per exam using each exam's specific grading rule
        const qualifyingExamScores: { rawScorePct: number; tosScore: number; attempt: any }[] = [];

        Object.entries(examBuckets).forEach(([eId, attemptsForExam]) => {
          const rule = examConfigMap[eId]?.gradingLogic || 'highest';

          const evaluatedAttempts = attemptsForExam.map(att => {
            const attAnswers = answersData.filter(a => a.attempt_id === att.attempt_id);
            const tos = calculateTOSScoring(questionDefs, attAnswers);
            return {
              rawScorePct: tos.rawPercentage,
              tosScore: tos.tosWeightedScore,
              attempt: att
            };
          });

          let qualifying: { rawScorePct: number; tosScore: number; attempt: any };

          if (rule === 'highest') {
            qualifying = evaluatedAttempts.reduce((prev, curr) => 
              curr.tosScore > prev.tosScore ? curr : prev, evaluatedAttempts[0]
            );
          } else if (rule === 'latest') {
            qualifying = evaluatedAttempts[evaluatedAttempts.length - 1];
          } else {
            // Average rule
            const avgRaw = Math.round(evaluatedAttempts.reduce((acc, c) => acc + c.rawScorePct, 0) / evaluatedAttempts.length);
            const avgTOS = Number((evaluatedAttempts.reduce((acc, c) => acc + c.tosScore, 0) / evaluatedAttempts.length).toFixed(1));
            qualifying = {
              rawScorePct: avgRaw,
              tosScore: avgTOS,
              attempt: evaluatedAttempts[evaluatedAttempts.length - 1].attempt
            };
          }

          qualifyingExamScores.push(qualifying);
          qualifyingAttemptsForCohort.push(qualifying.attempt);
        });

        const studentAvgRaw = Math.round(
          qualifyingExamScores.reduce((sum, q) => sum + q.rawScorePct, 0) / qualifyingExamScores.length
        );

        const studentAvgTOS = Number((
          qualifyingExamScores.reduce((sum, q) => sum + q.tosScore, 0) / qualifyingExamScores.length
        ).toFixed(1));

        totalCohortTOSSum += studentAvgTOS;
        evaluatedStudentsCount += 1;
        if (studentAvgTOS >= 75.0) passingStudentsCount += 1;

        return {
          userId: student.user_id,
          name: student.name,
          email: student.email,
          completedExams: qualifyingExamScores.length,
          rawAverage: studentAvgRaw,
          tosWeightedScore: studentAvgTOS,
          readinessStatus: studentAvgTOS >= 75.0 ? 'Projected Pass' : 'At Risk'
        };
      });

      // 7. Calculate Cohort Macro KPI Metrics
      const finalPassRate = evaluatedStudentsCount > 0 
        ? Math.round((passingStudentsCount / evaluatedStudentsCount) * 100) 
        : 0;

      const finalAvgTOS = evaluatedStudentsCount > 0 
        ? Number((totalCohortTOSSum / evaluatedStudentsCount).toFixed(1)) 
        : 0;

      setCohortTOSPassRate(finalPassRate);
      setCohortAvgTOS(finalAvgTOS);
      setStudentReadinessList(readinessRoster);

      // 8. Calculate BLEPP 4-Domain Mastery Using Qualifying Attempts
      const qualifyingAttemptIds = qualifyingAttemptsForCohort.map(a => a.attempt_id);
      const qualifyingAnswers = answersData.filter(a => qualifyingAttemptIds.includes(a.attempt_id));

      const domainAggregates: Record<string, { totalItems: number; correctItems: number; weight: number }> = {
        'Psychological Assessment': { totalItems: 0, correctItems: 0, weight: DEFAULT_BLEPP_WEIGHTS['Psychological Assessment'] || 40 },
        'Abnormal Psychology': { totalItems: 0, correctItems: 0, weight: DEFAULT_BLEPP_WEIGHTS['Abnormal Psychology'] || 20 },
        'Industrial-Organizational Psychology': { totalItems: 0, correctItems: 0, weight: DEFAULT_BLEPP_WEIGHTS['Industrial-Organizational Psychology'] || 20 },
        'Developmental Psychology': { totalItems: 0, correctItems: 0, weight: DEFAULT_BLEPP_WEIGHTS['Developmental Psychology'] || 20 },
      };

      qualifyingAnswers.forEach(ans => {
        const q = questionDefs.find(item => item.id === ans.question_id);
        if (q && domainAggregates[q.subject]) {
          domainAggregates[q.subject].totalItems += 1;
          if (ans.is_correct) {
            domainAggregates[q.subject].correctItems += 1;
          }
        }
      });

      const domainFinal: Record<string, { accuracy: number; totalItems: number; weight: number }> = {};
      Object.entries(domainAggregates).forEach(([subj, data]) => {
        const accuracy = data.totalItems > 0 ? Math.round((data.correctItems / data.totalItems) * 100) : 0;
        domainFinal[subj] = { accuracy, totalItems: data.totalItems, weight: data.weight };
      });
      setDomainBreakdown(domainFinal);

      // 9. Extract Cohort Weak Spots (Top 6 Lowest-Scoring Areas)
      const attemptScoreObjects: StudentAttemptScore[] = qualifyingAttemptsForCohort.map(att => {
        const attAns = qualifyingAnswers.filter(a => a.attempt_id === att.attempt_id);
        return {
          studentId: att.student_id,
          totalScore: att.final_score || 0,
          answers: attAns.map(a => ({
            questionId: a.question_id,
            selectedOption: a.selected_option || '',
            isCorrect: a.is_correct || false
          }))
        };
      });

      const weakSpots = identifyCohortWeakSpots(questionDefs, attemptScoreObjects, 6);
      setCohortWeakSpots(weakSpots);

    } catch (err: any) {
      console.error('Failed to compute cohort analytics:', err);
      addToast('Error loading cohort analytics.', 'error');
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  // Fetch details when a cohort is selected
  const fetchCohortDetails = async (cohortId: string) => {
    setIsDetailLoading(true);

    // 1. Fetch assigned materials
    const { data: matData } = await supabase
      .from('Cohort_Materials')
      .select(`
        id, 
        material_id, 
        created_at, 
        "Material Requests" (
          id, title, file_name, file_path, file_size_mb, subject, tags,
          faculty:Users ( name, email )
        )
      `)
      .eq('cohort_id', cohortId);

    const formattedMaterials = (matData || []).map((row: any) => {
      const m = row['Material Requests'];
      const uploader = m?.faculty?.name || 'Administrator';
      return {
        id: row.id,
        material_id: row.material_id,
        title: m?.title || 'Unknown Title',
        file_name: m?.file_name || 'file.pdf',
        file_path: m?.file_path || '',
        file_size_mb: m?.file_size_mb || 0,
        subject: m?.subject || (m?.tags && m.tags[0]) || 'General Reference',
        uploaded_by: uploader,
        created_at: row.created_at,
      };
    });
    setAssignedMaterials(formattedMaterials);

    // 2. Fetch enrolled students
    const { data: studentData } = await supabase
      .from('Users')
      .select('user_id, name, email, account_status, created_at')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true });

    setStudents(studentData || []);

    // 3. Fetch assigned exams
    const { data: examData } = await supabase
      .from('Exam_Cohorts')
      .select('exam_id, Exams(*)')
      .eq('cohort_id', cohortId);

    const formattedExams = (examData || []).map((row: any) => {
      const e = row.Exams;
      return {
        exam_id: row.exam_id,
        exam_title: e?.exam_title || 'Untitled Exam',
        exam_subject: e?.exam_subject || 'General',
        global_status: e?.global_status || 'Pending',
        schedule_start: e?.schedule_start,
        schedule_end: e?.schedule_end,
        passing_score: e?.passing_score || 0,
        grading_logic: e?.grading_logic || 'highest'
      };
    });
    setExams(formattedExams);

    setIsDetailLoading(false);
    fetchCohortAnalytics(cohortId);
  };

  const handleSelectCohort = (cohort: CohortSummary) => {
    setSelectedCohort(cohort);
    setActiveTab('materials');
    fetchCohortDetails(cohort.cohort_id);
  };

  // Open modal and fetch unassigned approved materials
  const handleOpenAssignModal = async () => {
    if (!selectedCohort) return;
    setModalSearchQuery('');
    setModalSubjectFilter('All');

    const { data: library, error } = await supabase
      .from('Material Requests')
      .select('id, title, file_name, file_path, file_size_mb, subject, tags, faculty:Users(name, email)')
      .eq('status', 'Approved & Indexed')
      .order('title', { ascending: true });

    if (!error && library) {
      const parsedLibrary: LibraryItem[] = library.map((item: any) => ({
        id: item.id,
        title: item.title,
        file_name: item.file_name,
        file_path: item.file_path,
        file_size_mb: item.file_size_mb,
        subject: item.subject || (item.tags && item.tags[0]) || 'General Reference',
        faculty: item.faculty,
      }));

      setAvailableLibrary(parsedLibrary);
      setSelectedMaterialIds(assignedMaterials.map(m => m.material_id));
      setShowAssignModal(true);
    }
  };

  const toggleMaterialSelection = (materialId: string) => {
    setSelectedMaterialIds(prev => 
      prev.includes(materialId) ? prev.filter(id => id !== materialId) : [...prev, materialId]
    );
  };

  const filteredLibrary = useMemo(() => {
    return availableLibrary.filter(item => {
      const matchesSearch = 
        item.title.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
        item.file_name.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
        item.subject.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
        (item.faculty?.name && item.faculty.name.toLowerCase().includes(modalSearchQuery.toLowerCase()));

      const matchesSubject = modalSubjectFilter === 'All' || item.subject === modalSubjectFilter;

      return matchesSearch && matchesSubject;
    });
  }, [availableLibrary, modalSearchQuery, modalSubjectFilter]);

  const handleSaveAssignedMaterials = async () => {
    if (!selectedCohort) return;
    setIsSubmittingAssignment(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentIds = assignedMaterials.map(m => m.material_id);
      
      const toAdd = selectedMaterialIds.filter(id => !currentIds.includes(id));
      const toRemove = currentIds.filter(id => !selectedMaterialIds.includes(id));

      if (toRemove.length > 0) {
        await supabase
          .from('Cohort_Materials')
          .delete()
          .eq('cohort_id', selectedCohort.cohort_id)
          .in('material_id', toRemove);
      }

      if (toAdd.length > 0) {
        const payload = toAdd.map(matId => ({
          cohort_id: selectedCohort.cohort_id,
          material_id: matId,
          assigned_by: user?.id,
        }));
        await supabase.from('Cohort_Materials').insert(payload);
      }

      addToast('Review materials updated for this cohort.', 'success');
      setShowAssignModal(false);
      fetchCohortDetails(selectedCohort.cohort_id);
      fetchTeacherCohorts();
    } catch (err: any) {
      addToast(err.message || 'Failed to update assigned materials.', 'error');
    } finally {
      setIsSubmittingAssignment(false);
    }
  };

  const handlePreviewMaterial = async (filePath: string) => {
    if (!filePath) {
      addToast('No storage path found for this document.', 'error');
      return;
    }

    try {
      let { data, error } = await supabase.storage.from('textbooks').createSignedUrl(filePath, 60);

      if (error || !data?.signedUrl) {
        const alternatePath = filePath.startsWith('pending/') 
          ? filePath.replace('pending/', 'indexed/') 
          : filePath.replace('indexed/', 'pending/');

        const retry = await supabase.storage.from('textbooks').createSignedUrl(alternatePath, 60);
        if (retry.data?.signedUrl) {
          data = retry.data;
          error = null;
        }
      }

      if (error || !data?.signedUrl) {
        addToast('Could not load file. It may have been deleted or purged from storage.', 'error');
        return;
      }

      window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      addToast(err.message || 'Error generating secure document link.', 'error');
    }
  };

  const handleUnassignSingle = async (cohortMaterialId: string, title: string) => {
    if (!confirm(`Remove "${title}" from this cohort's available review files?`)) return;

    const { error } = await supabase
      .from('Cohort_Materials')
      .delete()
      .eq('id', cohortMaterialId);

    if (!error) {
      addToast(`"${title}" removed from cohort review files.`, 'success');
      if (selectedCohort) {
        fetchCohortDetails(selectedCohort.cohort_id);
        fetchTeacherCohorts();
      }
    } else {
      addToast('Failed to remove material: ' + error.message, 'error');
    }
  };

  // Filtered cohorts for main directory view
  const filteredCohorts = useMemo(() => {
    return cohorts.filter(c => 
      c.cohort_name.toLowerCase().includes(cohortSearch.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(cohortSearch.toLowerCase()))
    );
  }, [cohorts, cohortSearch]);

  // Filtered roster for analytics table
  const filteredRoster = useMemo(() => {
    return studentReadinessList.filter(s =>
      s.name.toLowerCase().includes(rosterSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(rosterSearch.toLowerCase())
    );
  }, [studentReadinessList, rosterSearch]);

  // Aggregate stats across all cohorts for the header strip
  const totalStudentsAcrossCohorts = useMemo(() => cohorts.reduce((acc, c) => acc + c.student_count, 0), [cohorts]);
  const totalExamsAcrossCohorts = useMemo(() => cohorts.reduce((acc, c) => acc + c.exam_count, 0), [cohorts]);
  const totalMaterialsAcrossCohorts = useMemo(() => cohorts.reduce((acc, c) => acc + c.material_count, 0), [cohorts]);

  // ==========================================
  // DETAIL VIEW
  // ==========================================
  if (selectedCohort) {
    return (
      <div className="space-y-6 pb-24">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-2">
          <button 
            onClick={() => setSelectedCohort(null)} 
            className="text-slate-500 hover:text-blue-600 font-bold flex items-center gap-1.5 transition-colors"
          >
            &larr; Back to Cohorts Directory
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-bold">{selectedCohort.cohort_name}</span>
        </div>

        {/* Cohort Header Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">{selectedCohort.cohort_name}</h1>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold uppercase tracking-wider">
                {selectedCohort.account_status}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1 max-w-xl">
              {selectedCohort.description || 'No specific description provided for this cohort.'}
            </p>
          </div>

          <div className="flex items-center gap-5 bg-slate-50 px-5 py-3 rounded-xl border border-slate-200/60 shrink-0">
            <div className="text-center">
              <span className="text-lg font-black text-slate-800 block leading-tight">{students.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Students</span>
            </div>
            <div className="w-px h-7 bg-slate-200"></div>
            <div className="text-center">
              <span className="text-lg font-black text-slate-800 block leading-tight">{assignedMaterials.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Materials</span>
            </div>
            <div className="w-px h-7 bg-slate-200"></div>
            <div className="text-center">
              <span className="text-lg font-black text-slate-800 block leading-tight">{exams.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Exams</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-900 text-white rounded-t-xl flex gap-8 px-8 pt-5 border-b border-slate-700 overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveTab('materials')} 
            className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === 'materials' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Review Materials ({assignedMaterials.length})
          </button>
          <button 
            onClick={() => setActiveTab('students')} 
            className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === 'students' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Enrolled Students ({students.length})
          </button>
          <button 
            onClick={() => setActiveTab('exams')} 
            className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === 'exams' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Assigned Exams ({exams.length})
          </button>
          <button 
            onClick={() => setActiveTab('analytics')} 
            className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'analytics' ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📊</span> Cohort Analytics (Macro View)
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-b-xl p-8 shadow-sm min-h-[500px]">
          {/* TAB 1: REVIEW MATERIALS WITH ICON ACTIONS */}
          {activeTab === 'materials' && (
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Assigned Cohort Textbooks & Outlines</h3>
                  <p className="text-xs text-slate-500 font-bold">Students enrolled in this cohort can access these reference files for remediation.</p>
                </div>
                <button 
                  onClick={handleOpenAssignModal}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span>+</span> Assign Reference Files
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Document Title & Details</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">BLEPP Subject</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Uploaded By</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date Assigned</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {isDetailLoading ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Loading materials...</td></tr>
                    ) : assignedMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-slate-500 font-bold">
                          No review materials assigned to this cohort yet. Click &quot;+ Assign Reference Files&quot; to share textbooks.
                        </td>
                      </tr>
                    ) : (
                      assignedMaterials.map((mat) => (
                        <tr key={mat.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-slate-800 leading-snug">{mat.title}</p>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">{mat.file_size_mb} MB • {mat.file_name}</p>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-xs font-bold">
                              {mat.subject}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-600 text-xs">
                            {mat.uploaded_by}
                          </td>
                          <td className="p-4 text-xs font-bold text-slate-400">
                            {new Date(mat.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-right">
                            {/* Action Icons: Eye & Trash Can */}
                            <div className="flex justify-end gap-2 items-center">
                              <button 
                                onClick={() => handlePreviewMaterial(mat.file_path)}
                                title="View Document File"
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-colors shadow-xs"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                              <button 
                                onClick={() => handleUnassignSingle(mat.id, mat.title)}
                                title="Remove from Cohort"
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors shadow-xs"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: ENROLLED STUDENTS */}
          {activeTab === 'students' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Email Address</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Account Status</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Enrolled Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {isDetailLoading ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-500 font-bold">Loading students...</td></tr>
                  ) : students.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-500 font-bold">No students currently enrolled in this cohort.</td></tr>
                  ) : (
                    students.map((student) => (
                      <tr key={student.user_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold text-slate-800">{student.name}</td>
                        <td className="p-4 text-slate-600 font-medium">{student.email}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold uppercase tracking-wider">
                            {student.account_status || 'Active'}
                          </span>
                        </td>
                        <td className="p-4 text-right text-xs font-bold text-slate-400">
                          {new Date(student.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: ASSIGNED EXAMS WITH ACTION ICON */}
          {activeTab === 'exams' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Exam Title</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Subject</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Schedule Window</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {isDetailLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Loading exams...</td></tr>
                  ) : exams.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">No exams currently assigned to this cohort.</td></tr>
                  ) : (
                    exams.map((exam) => (
                      <tr key={exam.exam_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold text-slate-800">{exam.exam_title}</td>
                        <td className="p-4 font-bold text-slate-600">{exam.exam_subject}</td>
                        <td className="p-4 text-xs font-medium text-slate-500">
                          {exam.schedule_start ? new Date(exam.schedule_start).toLocaleDateString() : 'N/A'} - {' '}
                          {exam.schedule_end ? new Date(exam.schedule_end).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            exam.global_status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                            exam.global_status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {exam.global_status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {/* Manage Exam Icon Button */}
                          <button
                            onClick={() => router.push(`/faculty/exams?examId=${exam.exam_id}&cohortId=${selectedCohort.cohort_id}`)}
                            title="Manage Exam & Gradebook"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-all shadow-xs group"
                          >
                            <span>Manage</span>
                            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: COHORT ANALYTICS (MACRO VIEW) */}
          {activeTab === 'analytics' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {isAnalyticsLoading ? (
                <div className="p-16 text-center text-slate-500 font-bold flex flex-col items-center justify-center gap-3">
                  <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Synthesizing cohort psychometrics and multi-attempt performance...</span>
                </div>
              ) : (
                <>
                  {/* 1. Macro KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Projected BLEPP Pass Rate (≥75%)
                      </span>
                      <div className="flex items-baseline gap-2 my-2">
                        <span className={`text-4xl font-black ${cohortTOSPassRate >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {cohortTOSPassRate}%
                        </span>
                        <span className="text-xs font-bold text-slate-500">of enrolled examinees</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-bold mt-2">
                        Computed from qualifying exam scores weighted by the official 40-20-20-20 BLEPP TOS allocation.
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Cohort Average TOS Score
                      </span>
                      <div className="flex items-baseline gap-2 my-2">
                        <span className="text-4xl font-black text-indigo-600">
                          {cohortAvgTOS}%
                        </span>
                        <span className="text-xs font-bold text-slate-500">out of 100%</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-bold mt-2">
                        Mean composite score across distinct completed examinations.
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Cohort Coverage
                      </span>
                      <div className="flex items-baseline gap-2 my-2">
                        <span className="text-4xl font-black text-slate-800">
                          {exams.length}
                        </span>
                        <span className="text-xs font-bold text-slate-500">Assigned Exams</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-bold mt-2">
                        {students.length} active students currently enrolled in this training cohort.
                      </p>
                    </div>
                  </div>

                  {/* 2. BLEPP 4-Domain Mastery Meters */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-bold text-slate-800">BLEPP 4-Domain Mastery Overview</h3>
                      <p className="text-xs text-slate-500 font-bold mt-0.5">
                        Aggregate cohort accuracy across regulatory licensure subjects (uses qualifying attempts).
                      </p>
                    </div>

                    <div className="space-y-4">
                      {Object.entries(domainBreakdown).map(([domain, data]) => {
                        const isMastered = data.accuracy >= 75;
                        const isCompetent = data.accuracy >= 60 && data.accuracy < 75;

                        return (
                          <div key={domain} className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-slate-800 flex items-center gap-2">
                                {domain}
                                <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                  {data.weight}% TOS Weight
                                </span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isMastered ? 'bg-emerald-100 text-emerald-800' :
                                  isCompetent ? 'bg-blue-100 text-blue-800' :
                                  'bg-rose-100 text-rose-800'
                                }`}>
                                  {isMastered ? 'Mastery (≥75%)' : isCompetent ? 'Competent' : 'Critical Deficit (<60%)'}
                                </span>
                                <span className="text-slate-900 font-black">{data.accuracy}%</span>
                              </div>
                            </div>
                            
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-1000 ${
                                  isMastered ? 'bg-emerald-500' :
                                  isCompetent ? 'bg-blue-500' :
                                  'bg-rose-500'
                                }`} 
                                style={{ width: `${Math.max(5, data.accuracy)}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Areas to Focus: Cohort Remediation Agenda */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎯</span>
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Areas to Focus: Remedial Coaching Agenda</h3>
                        <p className="text-xs text-slate-500 font-bold">
                          Top lowest-scoring competencies across this cohort (ranked by accuracy deficit).
                        </p>
                      </div>
                    </div>

                    {cohortWeakSpots.length === 0 ? (
                      <div className="p-8 text-center text-xs font-bold text-slate-500 bg-slate-50 rounded-lg border border-slate-100">
                        No critical deficits detected or insufficient completed attempt data.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                        {cohortWeakSpots.map((spot, idx) => (
                          <div 
                            key={idx} 
                            className="p-4 border rounded-xl bg-slate-50 border-slate-200 flex flex-col justify-between gap-3 shadow-2xs"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Priority #{idx + 1}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  spot.accuracy < 40 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {spot.accuracy}% Accuracy
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-800 leading-snug">{spot.competency}</h4>
                              <p className="text-xs text-slate-500 font-bold mt-0.5">{spot.subject}</p>
                            </div>

                            <div className="pt-2 border-t border-slate-200/60 text-[11px] font-bold text-slate-600">
                              💡 {spot.recommendedAction}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 4. Student Licensure Readiness Roster (Scroll-Capped & Searchable) */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Student Pre-Qualification & Licensure Readiness</h3>
                        <p className="text-xs text-slate-500 font-bold">Monitor student-level completion, raw averages, and TOS board predictions.</p>
                      </div>

                      {/* Roster Search Bar */}
                      <div className="relative w-full sm:w-64">
                        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search examinee..."
                          value={rosterSearch}
                          onChange={(e) => setRosterSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* Scroll-Capped Table Container */}
                    <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50 shadow-2xs z-10">
                          <tr className="border-b border-slate-200">
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Completed Exams</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Raw Average</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">TOS Weighted Score</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Board Readiness</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {filteredRoster.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">No examinee data matching search.</td></tr>
                          ) : (
                            filteredRoster.map((st) => (
                              <tr key={st.userId} className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-4">
                                  <p className="font-bold text-slate-800">{st.name}</p>
                                  <p className="text-xs text-slate-400 font-medium">{st.email}</p>
                                </td>
                                <td className="p-4 font-bold text-slate-700">
                                  {st.completedExams} Exam{st.completedExams === 1 ? '' : 's'}
                                </td>
                                <td className="p-4 font-bold text-slate-600">
                                  {st.completedExams > 0 ? `${st.rawAverage}%` : '—'}
                                </td>
                                <td className="p-4 font-bold text-indigo-700">
                                  {st.completedExams > 0 ? `${st.tosWeightedScore}%` : '—'}
                                </td>
                                <td className="p-4 text-right">
                                  {st.readinessStatus === 'Projected Pass' ? (
                                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                      Projected Pass (≥75%)
                                    </span>
                                  ) : st.readinessStatus === 'At Risk' ? (
                                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                      At Risk (&lt;75%)
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                      No Data
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ASSIGN MATERIAL MODAL */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Assign Reference Materials</h3>
                  <p className="text-xs text-slate-500 font-bold">Select the approved textbooks and outlines to share with {selectedCohort.cohort_name}.</p>
                </div>
                <button 
                  onClick={() => setShowAssignModal(false)} 
                  className="text-slate-400 hover:text-slate-700"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 py-4 border-b border-slate-100 shrink-0">
                <div className="flex-1 relative">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by title, filename, uploader, or subject..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="sm:w-56">
                  <select
                    value={modalSubjectFilter}
                    onChange={(e) => setModalSubjectFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:border-blue-500"
                  >
                    <option value="All">All BLEPP Subjects</option>
                    <option value="Psychological Assessment">Psychological Assessment</option>
                    <option value="Abnormal Psychology">Abnormal Psychology</option>
                    <option value="Industrial-Organizational Psychology">Industrial-Organizational</option>
                    <option value="Developmental Psychology">Developmental Psychology</option>
                  </select>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[50vh] space-y-2 pr-1 my-3 flex-1">
                {filteredLibrary.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 text-xs font-bold">
                    No approved materials match your search or filter criteria.
                  </div>
                ) : (
                  filteredLibrary.map((item) => {
                    const isSelected = selectedMaterialIds.includes(item.id);
                    return (
                      <div 
                        key={item.id}
                        onClick={() => toggleMaterialSelection(item.id)}
                        className={`p-3.5 border rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => {}} 
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <p className="text-sm font-bold text-slate-800">{item.title}</p>
                            <p className="text-xs font-bold text-slate-500">
                              {item.file_size_mb} MB • Uploaded by {item.faculty?.name || 'Administrator'}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-white text-indigo-700 border border-indigo-100 rounded text-[10px] font-bold shrink-0">
                          {item.subject}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-100 shrink-0">
                <span className="text-xs font-bold text-slate-500">
                  {selectedMaterialIds.length} file{selectedMaterialIds.length === 1 ? '' : 's'} assigned to cohort
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingAssignment}
                    onClick={handleSaveAssignedMaterials}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isSubmittingAssignment ? 'Saving...' : 'Save Access'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // MAIN COHORTS DIRECTORY (REVAMPED GRID)
  // ==========================================
  const accentPalettes = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-pink-600',
    'from-amber-500 to-orange-600'
  ];

  return (
    <div className="space-y-6 pb-24">
      {/* Directory Title & Search Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">My Cohorts Directory</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">Manage student groups, distributed textbooks, and licensure test performance.</p>
        </div>

        {/* Cohort Search Input */}
        <div className="w-full md:w-72 relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search cohort by name..."
            value={cohortSearch}
            onChange={(e) => setCohortSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Aggregate Header KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg">
            🏢
          </div>
          <div>
            <span className="text-lg font-black text-slate-800 block leading-tight">{cohorts.length}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Cohorts</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-lg">
            👥
          </div>
          <div>
            <span className="text-lg font-black text-slate-800 block leading-tight">{totalStudentsAcrossCohorts}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Learners</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-lg">
            📚
          </div>
          <div>
            <span className="text-lg font-black text-slate-800 block leading-tight">{totalMaterialsAcrossCohorts}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shared Files</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-black text-lg">
            📝
          </div>
          <div>
            <span className="text-lg font-black text-slate-800 block leading-tight">{totalExamsAcrossCohorts}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deployed Exams</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <FullScreenLoader isOpen={isLoading} message="Loading your assigned cohorts..." />
      ) : filteredCohorts.length === 0 ? (
        <div className="p-16 text-center text-sm font-bold text-slate-500 bg-white rounded-2xl border border-slate-200">
          No cohorts found matching your search.
        </div>
      ) : (
        /* Modernized Cohort Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCohorts.map((c, index) => {
            const gradient = accentPalettes[index % accentPalettes.length];

            return (
              <div 
                key={c.cohort_id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group hover:-translate-y-0.5"
              >
                <div>
                  {/* Color Accent Top Bar */}
                  <div className={`h-2 w-full bg-gradient-to-r ${gradient}`}></div>

                  <div className="p-6">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h3 className="font-bold text-lg text-slate-800 leading-snug group-hover:text-blue-600 transition-colors">
                        {c.cohort_name}
                      </h3>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">
                        {c.account_status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-medium mb-6 line-clamp-2 min-h-[32px]">
                      {c.description || 'General batch group enrolled in the licensure review training curriculum.'}
                    </p>

                    {/* Stats Metric Box */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                      <div className="p-1">
                        <span className="text-base font-black text-slate-800 block leading-none">{c.student_count}</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mt-1 block">Students</span>
                      </div>
                      <div className="p-1 border-x border-slate-200/60">
                        <span className="text-base font-black text-slate-800 block leading-none">{c.material_count}</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mt-1 block">Materials</span>
                      </div>
                      <div className="p-1">
                        <span className="text-base font-black text-slate-800 block leading-none">{c.exam_count}</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mt-1 block">Exams</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cohort Hub Action Button */}
                <div className="p-4 bg-slate-50/70 border-t border-slate-100">
                  <button
                    onClick={() => handleSelectCohort(c)}
                    className="w-full py-2.5 bg-white border border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-800 hover:text-blue-700 text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5"
                  >
                    <span>Open Cohort Hub</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
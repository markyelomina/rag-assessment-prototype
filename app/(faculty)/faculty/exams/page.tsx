'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';
import { useRegeneration } from '@/hooks/useRegeneration';
import { useSearchParams } from 'next/navigation';

// --- Types ---
interface FacultyExam {
  id: string;
  title: string;
  target: string;
  cohorts: string[];
  cohortIds: string[]; 
  items: number;
  status: string;
  startDateStr: string;
  endDateStr: string;
  color: string;
  scheduleStart: string;
  scheduleEnd: string;
  passingScore: number;
  timeLimit: number;
  maxAttempts: number;
  closeAfterDeadline: boolean;
  gradingLogic: string;
}

interface ValidationItem {
  id: string;
  topic: string;
  question: string;
  options: string[];
  answer: string;
  rationale: string;
  status: string;
  citation: string;
}

interface StudentReviewItem {
  qNum: number;
  text: string;
  options: string[];
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

interface AttemptRecord {
  attemptId: string;
  score: number;
  rawScore: number;
  maxScore: number;
  status: string;
  takenAt: string;
  items: StudentReviewItem[];
}

interface SelectedStudentReview {
  name: string;
  attempts: AttemptRecord[];
}

// --- Helper Functions ---
const formatCitations = (rawCitations: any): string => {
  if (!rawCitations) return 'No citation provided';

  let parsed: any = rawCitations;
  try {
    while (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
  } catch (e) {
    return String(rawCitations).replace(/^["']|["']$/g, '').trim();
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    if (typeof parsed === 'string') return parsed;
    return 'No citation provided';
  }

  const docMap: Record<string, Set<number>> = {};

  parsed.forEach((item: any) => {
    if (!item) return;
    let src = item.source || item.document || item.doc || 'Unknown Document';
    src = src.replace(/^\d+[-_]/, '').trim();

    if (!docMap[src]) {
      docMap[src] = new Set<number>();
    }

    if (item.page !== undefined && item.page !== null) {
      const pageNum = Number(item.page);
      if (!isNaN(pageNum)) {
        docMap[src].add(pageNum);
      }
    }
  });

  const formattedDocs = Object.keys(docMap).map((docName) => {
    const pages = Array.from(docMap[docName]).sort((a, b) => a - b);
    if (pages.length > 0) {
      return `${docName}, Pages: ${pages.join(', ')}`;
    }
    return docName;
  });

  return formattedDocs.join(' | ') || 'No citation provided';
};

const normalizeForComparison = (str: string) => {
  return String(str || '')
    .replace(/^[\\"'“”\[\]]+|[\\"'“”\[\]]+$/g, '')
    .trim()
    .toLowerCase();
};

const formatForInput = (utcString: string | null | undefined): string => {
  if (!utcString) return '';
  const safeString = utcString.includes('Z') || utcString.includes('+') ? utcString : `${utcString}Z`;
  const d = new Date(safeString);
  if (isNaN(d.getTime())) return '';
  
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const localToUTC = (localString: string | null | undefined): string | null => {
  if (!localString) return null;
  const [datePart, timePart] = localString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  const d = new Date(year, month - 1, day, hours, minutes);
  return d.toISOString();
};

const formatAttemptDate = (isoString: string) => {
  if (!isoString) return 'Pending';
  const d = new Date(isoString);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
};

function FacultyExamsContent() {
  const router = useRouter();
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const { regenerateItem, status: regenStatus, progressDetails: regenProgress } = useRegeneration();

  const [selectedExam, setSelectedExam] = useState<null | string>(null);
  const [examTab, setExamTab] = useState('settings');
  const [validationTab, setValidationTab] = useState<'pending' | 'approved'>('pending');

  const [examSearchQuery, setExamSearchQuery] = useState('');
  const debouncedExamSearch = useDebounce(examSearchQuery, 300);
  const [examStatusFilter, setExamStatusFilter] = useState('All');

  const [studentSearch, setStudentSearch] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch, 300);
  const [studentStatusFilter, setStudentStatusFilter] = useState('All');

  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [regeneratingItems, setRegeneratingItems] = useState<string[]>([]);

  const [teacherCohorts, setTeacherCohorts] = useState<{id: string, name: string}[]>([]);
  const [editSelectedCohorts, setEditSelectedCohorts] = useState<string[]>([]);
  const [isCohortDropdownOpen, setIsCohortDropdownOpen] = useState(false);

  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [questionToRegenerate, setQuestionToRegenerate] = useState<null | string>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ValidationItem | null>(null);

  const [showActivationModal, setShowActivationModal] = useState(false);
  const [pendingApprovalAction, setPendingApprovalAction] = useState<(() => void) | null>(null);

  const [hasAcknowledgedVoidWarning, setHasAcknowledgedVoidWarning] = useState(false);
  const [showVoidWarningModal, setShowVoidWarningModal] = useState(false);
  const [pendingMaintenanceAction, setPendingMaintenanceAction] = useState<(() => void) | null>(null);

  // Student Review Sub-View States
  const [selectedStudentForReview, setSelectedStudentForReview] = useState<SelectedStudentReview | null>(null);
  const [activeAttemptIndex, setActiveAttemptIndex] = useState(0);
  const [isReviewDropdownOpen, setIsReviewDropdownOpen] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [exams, setExams] = useState<FacultyExam[]>([]);
  const [aiQuestions, setAiQuestions] = useState<ValidationItem[]>([]);

  const [studentAnalytics, setStudentAnalytics] = useState<any[]>([]);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
  const [questionAnalytics, setQuestionAnalytics] = useState<any[]>([]);

  useEffect(() => {
    const passedExamId = searchParams.get('examId');
    const passedView = searchParams.get('view');

    if (passedExamId) {
      setSelectedExam(passedExamId);

      if (passedView === 'review') {
        setExamTab('questions');
      } else if (passedView === 'results') {
        setExamTab('question_analytics'); 
      } else if (passedView === 'edit') {
        setExamTab('settings');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchFacultyExams = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userCohorts } = await supabase
        .from('Cohort Teachers')
        .select('cohort_id, Cohorts(cohort_name)')
        .eq('teacher_id', user.id);

      const cohortIds = userCohorts?.map(c => c.cohort_id) || [];
      const fetchedTeacherCohorts = userCohorts?.map(c => ({
        id: c.cohort_id,
        name: (c.Cohorts as any)?.cohort_name || 'Unknown Cohort'
      })) || [];
      
      setTeacherCohorts(fetchedTeacherCohorts);

      if (cohortIds.length === 0) {
        setExams([]);
        setIsLoading(false);
        return;
      }

      const { data: examLinks } = await supabase
        .from('Exam_Cohorts')
        .select('exam_id')
        .in('cohort_id', cohortIds);

      const examIds = examLinks?.map(link => link.exam_id) || [];

      if (examIds.length === 0) {
        setExams([]);
        setIsLoading(false);
        return;
      }

      const { data: dbExams, error } = await supabase
        .from('Exams')
        .select(`
          exam_id, exam_title, exam_subject, schedule_start, schedule_end, passing_score, passing_percentage, time_limit_mins, global_status, references,
          max_attempts, close_after_deadline, grading_logic,
          Exam_Cohorts ( cohort_id, Cohorts ( cohort_name ) ),
          "Mock Exam Items" ( id )
        `)
        .in('exam_id', examIds)
        .order('schedule_start', { ascending: false });

      if (!error && dbExams) {
        const accentColors = ['bg-emerald-500', 'bg-amber-500', 'bg-slate-500', 'bg-blue-500', 'bg-purple-500'];

        const formattedExams = dbExams.map((exam: any, index: number) => {
          const cohortsList = exam.Exam_Cohorts?.map((ec: any) => ec.Cohorts?.cohort_name).filter(Boolean) || [];
          const cohortIdList = exam.Exam_Cohorts?.map((ec: any) => ec.cohort_id).filter(Boolean) || [];
          const itemCount = exam['Mock Exam Items'] ? exam['Mock Exam Items'].length : 0;
          const targetPassingScore = exam.passing_percentage || exam.passing_score || 0;

          return {
            id: exam.exam_id,
            title: exam.exam_title,
            target: exam.exam_subject || 'Comprehensive',
            cohorts: cohortsList,
            cohortIds: cohortIdList,
            items: itemCount,
            status: exam.global_status || 'Pending',
            startDateStr: exam.schedule_start ? new Date(exam.schedule_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Date',
            endDateStr: exam.schedule_end ? new Date(exam.schedule_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Date',
            scheduleStart: formatForInput(exam.schedule_start),
            scheduleEnd: formatForInput(exam.schedule_end),
            passingScore: targetPassingScore, 
            timeLimit: exam.time_limit_mins || 60,
            maxAttempts: exam.max_attempts || 1,
            closeAfterDeadline: exam.close_after_deadline ?? true,
            gradingLogic: exam.grading_logic || 'highest',
            color: accentColors[index % accentColors.length]
          };
        });
        setExams(formattedExams);
      }
      setIsLoading(false);
    };

    fetchFacultyExams();
    const interval = setInterval(() => { fetchFacultyExams(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchExamQuestions = React.useCallback(async () => {
    if (!selectedExam) return;
    const { data } = await supabase
      .from('Mock Exam Items')
      .select('*')
      .eq('exam_session_id', selectedExam)
      .order('created_at', { ascending: true });

    if (data) {
      const formattedQuestions = data.map(q => {
        let parsedOptions: string[] = [];
        let mappedAnswer = String(q.correct_answer || '').trim();

        try {
          let raw = q.options;
          while (typeof raw === 'string') raw = JSON.parse(raw);

          if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
            parsedOptions = Object.values(raw).map(opt => String(opt));
            if (raw[mappedAnswer.toUpperCase()]) {
              mappedAnswer = String(raw[mappedAnswer.toUpperCase()]);
            }
          } else if (Array.isArray(raw)) {
            parsedOptions = raw.map(opt => String(opt));
            if (mappedAnswer.length === 1 && /^[A-Z]$/i.test(mappedAnswer)) {
              const charIdx = mappedAnswer.toUpperCase().charCodeAt(0) - 65;
              if (parsedOptions[charIdx]) mappedAnswer = parsedOptions[charIdx];
            }
          }
        } catch (e) {
          parsedOptions = [];
        }

        return {
          id: q.id,
          topic: q.competency || q.subject || 'General Scope',
          question: q.question || '',
          options: parsedOptions.length > 0 ? parsedOptions : ['A', 'B', 'C', 'D'],
          answer: mappedAnswer,
          status: q.status || 'PASSED',
          rationale: q.rationale || 'No rationale provided.',
          citation: formatCitations(q.citations)
        };
      });
      setAiQuestions(formattedQuestions);
    }
  }, [selectedExam]);

  useEffect(() => {
    fetchExamQuestions();
  }, [fetchExamQuestions]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!selectedExam || examTab !== 'gradebook') return;
      setIsFetchingAnalytics(true);

      const currentExamConfig = exams.find(e => e.id === selectedExam);
      const gradingRule = currentExamConfig?.gradingLogic || 'highest';
      const totalItems = currentExamConfig?.items || 0;

      const { data: ecData } = await supabase.from('Exam_Cohorts').select('cohort_id').eq('exam_id', selectedExam);
      const cohortIds = ecData?.map(ec => ec.cohort_id) || [];

      let students: any[] = [];
      if (cohortIds.length > 0) {
        const { data: studentData } = await supabase.from('Users').select('user_id, name').in('cohort_id', cohortIds);
        students = studentData || [];
      }

      const { data: attemptsData } = await supabase
        .from('Student Attempts')
        .select('*')
        .eq('exam_id', selectedExam)
        .order('completed_at', { ascending: true }); // Earliest first

      const mergedData = students.map(st => {
        const studentAttempts = attemptsData?.filter(a => a.student_id === st.user_id) || [];
        const isCompleted = studentAttempts.length > 0 && studentAttempts.some(a => a.exam_status?.toLowerCase() === 'completed');

        let calculatedFinalGrade: number | string = 'Pending';
        let calculatedRawScore: number | string = 'Pending';

        if (studentAttempts.length > 0) {
           const scores = studentAttempts.map(a => a.final_score || 0);
           if (gradingRule === 'highest') calculatedFinalGrade = Math.max(...scores);
           else if (gradingRule === 'latest') calculatedFinalGrade = scores[scores.length - 1];
           else if (gradingRule === 'average') calculatedFinalGrade = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
           
           // Derive raw score from the final percentage grade stored in DB
           calculatedRawScore = Math.round((Number(calculatedFinalGrade) / 100) * totalItems);
        }

        return {
          id: st.user_id,
          name: st.name,
          status: studentAttempts.length > 0 ? (isCompleted ? 'Completed' : 'In Progress') : 'Not Taken',
          attempts: studentAttempts,
          grade: calculatedFinalGrade === 'Pending' ? 'Pending' : `${calculatedRawScore} / ${totalItems}`
        };
      });

      setStudentAnalytics(mergedData);
      setIsFetchingAnalytics(false);
    };
    fetchAnalytics();
  }, [selectedExam, examTab, exams]);

  useEffect(() => {
    const fetchQuestionAnalytics = async () => {
      if (!selectedExam || examTab !== 'question_analytics') return;
      setIsFetchingAnalytics(true);

      const { data: questions } = await supabase
        .from('Mock Exam Items')
        .select('id, question, options, correct_answer')
        .eq('exam_session_id', selectedExam);

      if (!questions || questions.length === 0) {
        setQuestionAnalytics([]);
        setIsFetchingAnalytics(false);
        return;
      }

      const questionIds = questions.map(q => q.id);
      const { data: answers } = await supabase
        .from('Student Answers')
        .select('question_id, selected_option')
        .in('question_id', questionIds);

      const safeAnswers = answers || [];

      const analytics = questions.map(q => {
        let parsedOptions: string[] = [];
        let mappedCorrectAnswer = String(q.correct_answer || '').trim();

        try {
          let raw = q.options;
          while (typeof raw === 'string') raw = JSON.parse(raw);
          if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
            parsedOptions = Object.values(raw).map(opt => String(opt));
            if (raw[mappedCorrectAnswer.toUpperCase()]) {
              mappedCorrectAnswer = String(raw[mappedCorrectAnswer.toUpperCase()]);
            }
          } else if (Array.isArray(raw)) {
            parsedOptions = raw.map(opt => String(opt));
            if (mappedCorrectAnswer.length === 1 && /^[A-Z]$/i.test(mappedCorrectAnswer)) {
              const charIdx = mappedCorrectAnswer.toUpperCase().charCodeAt(0) - 65;
              if (parsedOptions[charIdx]) mappedCorrectAnswer = parsedOptions[charIdx];
            }
          }
        } catch (e) {
          parsedOptions = [];
        }

        const qAnswers = safeAnswers.filter(a => a.question_id === q.id);
        const totalAnswers = qAnswers.length;

        const optionsStats = parsedOptions.map((opt: string) => {
          const count = qAnswers.filter(a => normalizeForComparison(a.selected_option) === normalizeForComparison(opt)).length;
          const percent = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
          return {
            text: opt,
            count,
            percent,
            isCorrect: normalizeForComparison(opt) === normalizeForComparison(mappedCorrectAnswer)
          };
        });

        return { id: q.id, question: q.question, options: optionsStats, totalAnswers };
      });

      setQuestionAnalytics(analytics);
      setIsFetchingAnalytics(false);
    };
    fetchQuestionAnalytics();
  }, [selectedExam, examTab]);

  const currentExam = exams.find(e => e.id === selectedExam);
  
  const isValidationMode = currentExam?.status === 'Pending';
  const isMaintenanceMode = currentExam?.status === 'Hidden';
  const isReadOnly = currentExam?.status === 'Active' || currentExam?.status === 'Inactive';

  const pendingQuestions = aiQuestions.filter(q => q.status === 'PASSED' || q.status === 'FLAGGED_FOR_MANUAL_REVIEW');
  const approvedQuestions = aiQuestions.filter(q => q.status === 'APPROVED');
  
  const visibleQuestions = isValidationMode 
    ? (validationTab === 'pending' ? pendingQuestions : approvedQuestions) 
    : aiQuestions;

  const handleExamClick = (exam: FacultyExam) => {
    if (exam.status === 'Generating') return;
    setSelectedExam(exam.id);
    setSelectedStudentForReview(null);
    setHasAcknowledgedVoidWarning(false);
    
    setEditSelectedCohorts(exam.cohortIds || []);
    setIsCohortDropdownOpen(false);

    if (exam.status === 'Pending') setExamTab('questions');
    else if (exam.status === 'Inactive') setExamTab('question_analytics');
    else setExamTab('settings');
  };

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedExam) return;

    if (editSelectedCohorts.length === 0) {
      addToast('You must assign at least one cohort to this exam.', 'error');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const rawScheduleStart = formData.get('scheduleStart') as string;
    const rawScheduleEnd = formData.get('scheduleEnd') as string;
    const timeLimit = Number(formData.get('timeLimit'));
    const status = formData.get('status') as string;
    
    const maxAttempts = Number(formData.get('maxAttempts'));
    const gradingLogic = formData.get('gradingLogic') as string;
    const closeAfterDeadline = formData.get('closeAfterDeadline') === 'on';

    const scheduleStartUTC = localToUTC(rawScheduleStart);
    const scheduleEndUTC = localToUTC(rawScheduleEnd);

    const { error } = await supabase
      .from('Exams')
      .update({
        exam_title: title,
        schedule_start: scheduleStartUTC,
        schedule_end: scheduleEndUTC,
        time_limit_mins: timeLimit,
        global_status: status,
        max_attempts: maxAttempts,
        grading_logic: gradingLogic,
        close_after_deadline: closeAfterDeadline
      })
      .eq('exam_id', selectedExam);

    if (error) {
      addToast(`Error saving settings: ${error.message}`, 'error');
      return;
    }

    const { error: deleteError } = await supabase.from('Exam_Cohorts').delete().eq('exam_id', selectedExam);
    if (!deleteError) {
      const cohortPayload = editSelectedCohorts.map(id => ({ exam_id: selectedExam, cohort_id: id }));
      await supabase.from('Exam_Cohorts').insert(cohortPayload);
    }

    // ---> NEW: Log the exam update to AuditLogs
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('Users')
        .select(`email, Roles ( role_name )`)
        .eq('user_id', user.id)
        .single();

      const userEmail = userData?.email || user.email || 'System';
      
      let roleName = 'Teacher';
      if (userData?.Roles) {
        if (Array.isArray(userData.Roles) && userData.Roles.length > 0) {
          roleName = (userData.Roles[0] as any).role_name || 'Teacher';
        } else if (!Array.isArray(userData.Roles)) {
          roleName = (userData.Roles as any).role_name || 'Teacher';
        }
      }

      await supabase.from('AuditLogs').insert([
        {
          user_email: userEmail,
          role: roleName,
          action: `Updated settings and assigned cohorts for exam: "${title}"`,
          type: 'User Activity',
          severity: 'Info',
          ip_address: 'Internal',
          user_agent: navigator.userAgent
        }
      ]);
    }

    const newStartDateStr = scheduleStartUTC ? new Date(scheduleStartUTC).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Date';
    const newEndDateStr = scheduleEndUTC ? new Date(scheduleEndUTC).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Date';
    const mappedCohortNames = teacherCohorts.filter(c => editSelectedCohorts.includes(c.id)).map(c => c.name);

    setExams(prev => prev.map(ex => ex.id === selectedExam ? {
      ...ex,
      title,
      scheduleStart: rawScheduleStart,
      scheduleEnd: rawScheduleEnd,
      timeLimit,
      status,
      startDateStr: newStartDateStr,
      endDateStr: newEndDateStr,
      maxAttempts,
      gradingLogic,
      closeAfterDeadline,
      cohortIds: editSelectedCohorts,
      cohorts: mappedCohortNames
    } : ex));
    
    addToast('Exam settings & cohorts successfully updated.', 'success');
  };

  const exportToCSV = () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      addToast('No analytics data to export.', 'error');
      return;
    }
    const headers = ['Student Name', 'Status', 'Latest Date Taken', 'Final Grade'];
    const rows = filteredStudents.map(s => {
      const latestAttempt = s.attempts && s.attempts.length > 0 ? s.attempts[s.attempts.length - 1] : null;
      const dateTaken = latestAttempt?.completed_at ? new Date(latestAttempt.completed_at).toLocaleString() : 'Pending';
      return [
        `"${s.name}"`,
        `"${s.status}"`,
        `"${dateTaken}"`,
        `"${s.grade}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentExam?.title.replace(/\s+/g, '_')}_Gradebook.csv`;
    link.click();
  };

  const handleViewStudent = async (student: any) => {
    setIsLoadingReview(true);

    if (!student.attempts || student.attempts.length === 0) {
      addToast('No attempts found for this student.', 'error');
      setIsLoadingReview(false);
      return;
    }

    const formattedAttempts: AttemptRecord[] = await Promise.all(
      student.attempts.map(async (attempt: any) => {
        const { data: answersData } = await supabase
          .from("Student Answers")
          .select(`
            selected_option,
            is_correct,
            rag_feedback,
            "Mock Exam Items" ( question, correct_answer, rationale, options )
          `)
          .eq("attempt_id", attempt.attempt_id);

        const items: StudentReviewItem[] = (answersData || []).map((ans, idx) => {
          const rawMockItem = ans["Mock Exam Items"];
          const mockItem = Array.isArray(rawMockItem) ? rawMockItem[0] : rawMockItem;
          
          let parsedOptions: string[] = [];
          let mappedCorrectAnswer = String(mockItem?.correct_answer || "N/A").trim();
          
          try {
            let raw = mockItem?.options;
            while (typeof raw === 'string') raw = JSON.parse(raw);
            if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
              parsedOptions = Object.values(raw).map(opt => String(opt));
              if (raw[mappedCorrectAnswer.toUpperCase()]) mappedCorrectAnswer = String(raw[mappedCorrectAnswer.toUpperCase()]);
            } else if (Array.isArray(raw)) {
              parsedOptions = raw.map(opt => String(opt));
              if (mappedCorrectAnswer.length === 1 && /^[A-Z]$/i.test(mappedCorrectAnswer)) {
                const charIdx = mappedCorrectAnswer.toUpperCase().charCodeAt(0) - 65;
                if (parsedOptions[charIdx]) mappedCorrectAnswer = parsedOptions[charIdx];
              }
            }
          } catch (e) {
            console.error("Failed to parse options for review", e);
          }

          const cleanCorrectAnswer = mappedCorrectAnswer.replace(/^["']|["']$/g, '').trim();
          const cleanStudentAnswer = String(ans.selected_option || "No Answer Selected").replace(/^["']|["']$/g, '').trim();

          return {
            qNum: idx + 1,
            text: mockItem?.question || "Question data unavailable",
            studentAnswer: cleanStudentAnswer,
            correctAnswer: cleanCorrectAnswer,
            isCorrect: ans.is_correct,
            explanation: mockItem?.rationale || ans.rag_feedback || "No explanation provided for this item.",
            options: parsedOptions,
          };
        });

        return {
          attemptId: attempt.attempt_id,
          score: attempt.final_score || 0,
          rawScore: items.filter(i => i.isCorrect).length,
          maxScore: items.length,
          status: attempt.exam_status,
          takenAt: attempt.completed_at,
          items: items,
        };
      })
    );

    setSelectedStudentForReview({
      name: student.name,
      attempts: formattedAttempts
    });
    setActiveAttemptIndex(formattedAttempts.length > 0 ? formattedAttempts.length - 1 : 0);
    setIsLoadingReview(false);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'Generating') return <span className="shrink-0 px-2 py-1 bg-blue-100 text-blue-800 rounded text-[10px] font-bold uppercase tracking-wider animate-pulse border border-blue-200 shadow-sm">Generating AI...</span>;
    if (status === 'Active') return <span className="shrink-0 px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    if (status === 'Pending') return <span className="shrink-0 px-2 py-1 bg-amber-100 text-amber-800 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    if (status === 'Hidden') return <span className="shrink-0 px-2 py-1 bg-slate-200 text-slate-700 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    return <span className="shrink-0 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
  };

  const getActionLabel = (status: string) => {
    if (status === 'Pending') return 'Review Questions';
    if (status === 'Inactive') return 'View Results';
    return 'Manage Exam';
  };

  const getAIStatusStyle = (status: string) => {
    if (status === 'PASSED') return 'bg-emerald-100 text-emerald-800';
    if (status === 'FLAGGED_FOR_MANUAL_REVIEW') return 'bg-amber-100 text-amber-800';
    return 'bg-blue-100 text-blue-800';
  };

  const getAIStatusLabel = (status: string) => {
    if (status === 'PASSED') return 'High Confidence';
    if (status === 'FLAGGED_FOR_MANUAL_REVIEW') return 'Needs Manual Review';
    return 'Approved';
  };

  const executeProtectedAction = (action: () => void) => {
    if (isMaintenanceMode && !hasAcknowledgedVoidWarning) {
      setPendingMaintenanceAction(() => action);
      setShowVoidWarningModal(true);
    } else {
      action();
    }
  };

  const toggleQuestionSelection = (id: string) => {
    setSelectedQuestions(prev => prev.includes(id) ? prev.filter(qId => qId !== id) : [...prev, id]);
  };

  const selectGroup = (targetStatus?: string) => {
    const listToSelect = targetStatus
      ? aiQuestions.filter(q => q.status === targetStatus && validationTab === 'pending').map(q => q.id)
      : aiQuestions.filter(q => validationTab === 'pending').map(q => q.id);
    setSelectedQuestions(listToSelect);
  };

  const executeSingleApprove = async (id: string, makeActive: boolean) => {
    await supabase.from('Mock Exam Items').update({ status: 'APPROVED' }).eq('id', id);
    if (makeActive) {
      await supabase.from('Exams').update({ global_status: 'Active' }).eq('exam_id', selectedExam);
      setExams(prev => prev.map(ex => ex.id === selectedExam ? { ...ex, status: 'Active' } : ex));
    }
    setAiQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'APPROVED' } : q));
    addToast('Question approved.', 'success');
  };

  const handleSingleApprove = (id: string) => {
    if (pendingQuestions.length === 1 && pendingQuestions[0].id === id) {
      setPendingApprovalAction(() => () => executeSingleApprove(id, true));
      setShowActivationModal(true);
    } else {
      executeSingleApprove(id, false);
    }
  };

  const executeBatchApprove = async (makeActive: boolean) => {
    await supabase.from('Mock Exam Items').update({ status: 'APPROVED' }).in('id', selectedQuestions);
    if (makeActive) {
      await supabase.from('Exams').update({ global_status: 'Active' }).eq('exam_id', selectedExam);
      setExams(prev => prev.map(ex => ex.id === selectedExam ? { ...ex, status: 'Active' } : ex));
    }
    setAiQuestions(prev => prev.map(q => selectedQuestions.includes(q.id) ? { ...q, status: 'APPROVED' } : q));
    setSelectedQuestions([]);
    addToast(`${selectedQuestions.length} questions approved.`, 'success');
  };

  const handleBatchApprove = () => {
    const allPendingSelected = pendingQuestions.every(q => selectedQuestions.includes(q.id));
    if (allPendingSelected && selectedQuestions.length > 0) {
      setPendingApprovalAction(() => () => executeBatchApprove(true));
      setShowActivationModal(true);
    } else {
      executeBatchApprove(false);
    }
  };

  const executeManualEdit = async (formData: FormData, makeActive: boolean) => {
    if (!editingItem) return;
    const updatedOptions = [
      formData.get('opt0') as string,
      formData.get('opt1') as string,
      formData.get('opt2') as string,
      formData.get('opt3') as string,
    ];
    const questionText = formData.get('question') as string;
    const answer = formData.get('answer') as string;

    await supabase.from('Mock Exam Items').update({
      question: questionText,
      options: JSON.stringify(updatedOptions),
      correct_answer: answer,
      status: 'APPROVED'
    }).eq('id', editingItem.id);

    if (makeActive) {
      await supabase.from('Exams').update({ global_status: 'Active' }).eq('exam_id', selectedExam);
      setExams(prev => prev.map(ex => ex.id === selectedExam ? { ...ex, status: 'Active' } : ex));
    }

    setAiQuestions(prev => prev.map(q => q.id === editingItem.id ? {
      ...q, question: questionText, options: updatedOptions, answer, status: 'APPROVED'
    } : q));

    setShowEditModal(false);
    setEditingItem(null);
    addToast('Question manually edited and updated.', 'success');
  };

  const saveManualEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const isLast = isValidationMode && pendingQuestions.length === 1 && pendingQuestions[0].id === editingItem?.id;
    if (isLast) {
      setPendingApprovalAction(() => () => executeManualEdit(formData, true));
      setShowActivationModal(true);
    } else {
      executeManualEdit(formData, false);
    }
  };

  const confirmRegeneration = (id: string) => {
    setQuestionToRegenerate(id);
    setShowRegenerateModal(true);
  };

  const executeRegeneration = () => {
    if (!questionToRegenerate || !selectedExam) return;
    setShowRegenerateModal(false);
    setRegeneratingItems(prev => [...prev, questionToRegenerate]);
    regenerateItem(questionToRegenerate, selectedExam);
  };

  useEffect(() => {
    if (regenStatus === 'SUCCESS') {
      fetchExamQuestions().then(() => {
        setRegeneratingItems([]);
        addToast('Replacement generated successfully.', 'success');
      });
    } else if (regenStatus === 'FAILURE') {
      setRegeneratingItems([]);
      addToast(regenProgress?.message || 'Failed to regenerate question.', 'error');
    }
  }, [regenStatus, fetchExamQuestions, regenProgress, addToast]);

  const handlePullFromVault = async (itemToReplace: ValidationItem) => {
    setRegeneratingItems(prev => [...prev, itemToReplace.id]);

    const { data, error } = await supabase
      .from('Mock Exam Items')
      .select('id, question, options, correct_answer, rationale, citations, exam_session_id')
      .eq('status', 'APPROVED')
      .eq('competency', itemToReplace.topic)
      .limit(20);

    if (error || !data || data.length === 0) {
      addToast('No matching questions found in the vault for this competency.', 'error');
      setRegeneratingItems(prev => prev.filter(i => i !== itemToReplace.id));
      return;
    }

    const vaultItem = data[Math.floor(Math.random() * data.length)];

    let parsedOptions = [];
    try { parsedOptions = typeof vaultItem.options === 'string' ? JSON.parse(vaultItem.options) : vaultItem.options; }
    catch(e) { parsedOptions = [vaultItem.correct_answer, 'Option B', 'Option C', 'Option D']; }

    await supabase.from('Mock Exam Items').update({
        question: vaultItem.question,
        options: JSON.stringify(parsedOptions),
        correct_answer: vaultItem.correct_answer,
        rationale: vaultItem.rationale || 'Pulled from an archived validated exam.',
        citations: JSON.stringify(`Historical Exam Resource (Vault Item: ${vaultItem.id.slice(0,8)})`),
        status: isValidationMode ? 'PASSED' : 'APPROVED'
    }).eq('id', itemToReplace.id);

    setAiQuestions(prev => prev.map(q => q.id === itemToReplace.id ? {
      ...q,
      question: vaultItem.question,
      options: parsedOptions,
      answer: vaultItem.correct_answer,
      rationale: vaultItem.rationale || 'Pulled from an archived validated exam.',
      citation: `Historical Exam Resource (Vault Item: ${vaultItem.id.slice(0,8)})`,
      status: isValidationMode ? 'PASSED' : 'APPROVED'
    } : q));

    setRegeneratingItems(prev => prev.filter(i => i !== itemToReplace.id));
    addToast('Vault question loaded successfully.', 'success');
  };

  const filteredExams = exams.filter(exam => {
    const matchesSearch = exam.title.toLowerCase().includes(debouncedExamSearch.toLowerCase()) || exam.target.toLowerCase().includes(debouncedExamSearch.toLowerCase());
    const matchesStatus = examStatusFilter === 'All' || exam.status === examStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredStudents = studentAnalytics.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(debouncedStudentSearch.toLowerCase());
    const matchesStatus = studentStatusFilter === 'All' || student.status === studentStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const { currentPage: studentPage, totalPages: totalStudentPages, currentItems: currentStudents, nextPage, prevPage, resetPage } = usePagination(filteredStudents, 5);

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
      <div className="space-y-6 relative pb-24">
        <div className="flex items-center gap-2 text-sm mb-4">
          <button onClick={() => { setSelectedExam(null); setSelectedQuestions([]); setSelectedStudentForReview(null); setHasAcknowledgedVoidWarning(false); }} className="text-blue-600 hover:underline font-bold">Exams</button>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600 font-bold">{currentExam.title}</span>
        </div>

        <div className="bg-slate-900 text-white rounded-t-xl flex gap-8 px-8 pt-5 border-b border-slate-700 overflow-x-auto scrollbar-hide">
          <button onClick={() => { setExamTab('settings'); setSelectedStudentForReview(null); }} className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap ${examTab === 'settings' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            Exam Settings
          </button>

          {currentExam.status === 'Inactive' ? (
             <button onClick={() => { setExamTab('question_analytics'); setSelectedStudentForReview(null); }} className={`pb-4 border-b-2 text-sm font-bold whitespace-nowrap ${examTab === 'question_analytics' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
               Question Analytics
             </button>
          ) : (
            <button
              onClick={() => { setExamTab('questions'); setSelectedStudentForReview(null); }}
              className={`pb-4 border-b-2 text-sm font-bold flex items-center gap-2 whitespace-nowrap ${examTab === 'questions' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              {isValidationMode ? 'Question Validation' : 'View Questions'}
            </button>
          )}

          <button
            onClick={() => { if (!isValidationMode) { setExamTab('gradebook'); resetPage(); setSelectedStudentForReview(null); } }}
            className={`pb-4 border-b-2 text-sm font-bold flex items-center gap-2 whitespace-nowrap ${examTab === 'gradebook' ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'} ${isValidationMode ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isValidationMode && <span>🔒</span>}
            Gradebook
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-b-xl p-8 shadow-sm min-h-[500px]">

          {/* EXAM SETTINGS TAB */}
          {examTab === 'settings' && (
             <form onSubmit={handleSaveSettings} className="max-w-4xl">
               <h2 className="text-xl font-bold text-slate-800 mb-2">Edit Exam Details</h2>
               <p className="text-sm text-slate-500 mb-8 font-bold">Manage availability, schedules, and general settings for this assessment.</p>

               <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Exam Title</label>
                     <input type="text" name="title" defaultValue={currentExam.title} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Target Subject</label>
                     <input type="text" defaultValue={currentExam.target} disabled className="w-full px-4 py-3 border border-slate-200 bg-slate-50 rounded-lg text-sm font-bold text-slate-500 cursor-not-allowed" />
                   </div>
                 </div>

                 <div className="grid grid-cols-1 gap-6">
                   <div className="relative md:col-span-2">
                     <label className="block text-sm font-bold text-slate-700 mb-2">Target Cohort(s)</label>
                     <div 
                       onClick={() => setIsCohortDropdownOpen(!isCohortDropdownOpen)}
                       className="min-h-[46px] w-full px-3 py-2 border rounded-lg flex flex-wrap gap-2 items-center cursor-pointer bg-white transition-colors border-slate-300 hover:border-blue-400"
                     >
                       {editSelectedCohorts.length === 0 ? (
                         <span className="text-sm font-bold text-slate-400 px-1">Select assigned cohorts...</span>
                       ) : (
                         editSelectedCohorts.map(id => {
                           const cohort = teacherCohorts.find(c => c.id === id);
                           return (
                             <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold rounded-md z-10">
                               {cohort?.name || 'Unknown Cohort'}
                               <button 
                                 type="button" 
                                 onClick={(e) => { 
                                   e.stopPropagation(); 
                                   setEditSelectedCohorts(prev => prev.filter(cId => cId !== id)); 
                                 }}
                                 className="text-blue-500 hover:text-blue-800 bg-white rounded-full p-0.5 transition-colors"
                               >
                                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                               </button>
                             </span>
                           );
                         })
                       )}
                       <div className="ml-auto px-1">
                         <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCohortDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                       </div>
                     </div>

                     {isCohortDropdownOpen && (
                       <>
                         <div className="fixed inset-0 z-10" onClick={() => setIsCohortDropdownOpen(false)}></div>
                         <div className="absolute z-20 w-full mt-2 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto py-1 animate-in fade-in slide-in-from-top-2">
                           {teacherCohorts.length === 0 ? (
                             <div className="p-4 text-sm text-slate-500 font-bold text-center">No active cohorts assigned to you.</div>
                           ) : (
                             teacherCohorts.map(c => {
                               const isSelected = editSelectedCohorts.includes(c.id);
                               return (
                                 <div 
                                   key={c.id} 
                                   onClick={() => {
                                     setEditSelectedCohorts(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                                   }}
                                   className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                 >
                                   <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                                     {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                   </div>
                                   <span className={`text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{c.name}</span>
                                 </div>
                               );
                             })
                           )}
                         </div>
                       </>
                     )}
                   </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Schedule Start</label>
                     <input type="datetime-local" name="scheduleStart" defaultValue={currentExam.scheduleStart} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Schedule End</label>
                     <input type="datetime-local" name="scheduleEnd" defaultValue={currentExam.scheduleEnd} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">Passing Score <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase tracking-wider">Locked</span></label>
                     <input type="number" defaultValue={currentExam.passingScore} disabled className="w-full px-4 py-3 border border-slate-200 bg-slate-50 rounded-lg text-sm font-bold text-slate-500 cursor-not-allowed" />
                     <p className="text-xs font-bold text-slate-400 mt-1">Recalculating passing scores after generation breaks analytics formatting.</p>
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Time Limit (Minutes)</label>
                     <input type="number" name="timeLimit" defaultValue={currentExam.timeLimit} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Max Attempts Allowed</label>
                     <input type="number" name="maxAttempts" min="1" max="10" defaultValue={currentExam.maxAttempts} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                   </div>
                   
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Final Score Grading Logic</label>
                     <select name="gradingLogic" defaultValue={currentExam.gradingLogic} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white">
                       <option value="highest">Highest Attempt Score</option>
                       <option value="latest">Latest Attempt Score</option>
                       <option value="average">Average of All Attempts</option>
                     </select>
                   </div>
                   
                   <div className="flex items-center mt-8">
                     <label className="flex items-center gap-3 cursor-pointer">
                       <input type="checkbox" name="closeAfterDeadline" defaultChecked={currentExam.closeAfterDeadline} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                       <span className="text-sm font-bold text-slate-700">Close After Deadline</span>
                     </label>
                   </div>
                 </div>

                 <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">Exam Status</label>
                   <select name="status" defaultValue={currentExam.status} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white">
                     {currentExam.status === 'Pending' && <option value="Pending">Pending (Questions need checking and validation)</option>}
                     <option value="Active">Active (Available for learners to take)</option>
                     <option value="Inactive">Inactive / Finished (Deadline passed)</option>
                     <option value="Hidden">Hidden (Maintenance mode, invisible to students)</option>
                   </select>
                 </div>

                 <div className="pt-6 border-t border-slate-100 mt-6">
                   <button type="submit" className="px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                     Save Settings
                   </button>
                 </div>
               </div>
             </form>
          )}

          {/* QUESTION VALIDATION / MAINTENANCE TAB */}
          {examTab === 'questions' && (
            <div>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    {isReadOnly ? 'Exam Questions' : isMaintenanceMode ? 'Maintenance Mode: Exam Questions' : 'Question Validation'}
                  </h2>
                  <p className="text-sm text-slate-500 font-bold mt-1">
                    {isReadOnly 
                      ? 'Review the items currently deployed in this active assessment.' 
                      : isMaintenanceMode 
                      ? 'Edit questions directly. Warning: Modifying items will affect existing student attempts.' 
                      : 'Review AI generated items and lock them into the final exam.'}
                  </p>
                </div>

                {isValidationMode && (
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-full md:w-auto">
                    <button
                      onClick={() => { setValidationTab('pending'); setSelectedQuestions([]); }}
                      className={`flex-1 md:flex-none px-6 py-2 text-sm font-bold rounded-md transition-all ${validationTab === 'pending' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Pending Review ({pendingQuestions.length})
                    </button>
                    <button
                      onClick={() => { setValidationTab('approved'); setSelectedQuestions([]); }}
                      className={`flex-1 md:flex-none px-6 py-2 text-sm font-bold rounded-md transition-all ${validationTab === 'approved' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Approved Items ({approvedQuestions.length})
                    </button>
                  </div>
                )}
              </div>

              {isValidationMode && validationTab === 'pending' && pendingQuestions.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-6 bg-slate-50 p-3 border border-slate-200 rounded-lg">
                  <button onClick={() => selectGroup('PASSED')} className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-white transition-colors shadow-sm">
                    Select High Confidence
                  </button>
                  <button onClick={() => selectGroup('FLAGGED_FOR_MANUAL_REVIEW')} className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-white transition-colors shadow-sm">
                    Select Needs Review
                  </button>
                  <button onClick={handleBatchApprove} disabled={selectedQuestions.length === 0} className="ml-auto px-6 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    Batch Approve ({selectedQuestions.length})
                  </button>
                </div>
              )}

              <div className="space-y-6">
                {visibleQuestions.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                    <p className="text-slate-500 font-bold text-sm">No questions available in this queue.</p>
                  </div>
                ) : (
                  visibleQuestions.map((q, index) => {
                    const isProcessing = regeneratingItems.includes(q.id);
                    return (
                      <div key={q.id} className={`relative p-6 border rounded-xl transition-colors ${selectedQuestions.includes(q.id) ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>

                        {isProcessing && (
                          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-xl border border-blue-200">
                            <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <span className="text-sm font-bold text-blue-900">
                              {regenProgress?.details || regenProgress?.message || 'Contacting RAG pipeline...'}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-col md:flex-row justify-between items-start mb-5 pb-4 border-b border-slate-100 gap-4">
                          <div className="flex items-start gap-3 w-full">
                            {isValidationMode && validationTab === 'pending' && (
                              <input
                                type="checkbox"
                                checked={selectedQuestions.includes(q.id)}
                                onChange={() => toggleQuestionSelection(q.id)}
                                className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            )}
                            <span className="w-8 h-8 shrink-0 mt-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold border border-slate-200">
                              {index + 1}
                            </span>
                            <p className="text-base font-bold text-slate-900 leading-relaxed pt-1 w-full pr-4">{q.question}</p>
                          </div>
                          {isValidationMode && (
                            <span className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getAIStatusStyle(q.status)} border-current`}>
                              {getAIStatusLabel(q.status)}
                            </span>
                          )}
                        </div>

                        <div className="mb-6 md:ml-11">
                          <div className="space-y-3 mb-6">
                            {q.options.map((opt, idx) => (
                              <div key={idx} className={`p-4 border rounded-lg text-sm font-bold ${normalizeForComparison(opt) === normalizeForComparison(q.answer) ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-white border-slate-200 text-slate-600'}`}>
                                <span className="mr-3 text-slate-400">{String.fromCharCode(65 + idx)}.</span>
                                {opt}
                                {normalizeForComparison(opt) === normalizeForComparison(q.answer) && <span className="ml-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">(Correct)</span>}
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 gap-3 mt-6">
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Competency / Topic</span>
                              <p className="text-sm font-bold text-slate-900">{q.topic}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rationale</span>
                              <p className="text-sm font-bold text-slate-900 leading-relaxed">{q.rationale}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sources</span>
                              <p className="text-sm font-bold text-slate-900 leading-relaxed">{q.citation}</p>
                            </div>
                          </div>
                        </div>

                        {!isReadOnly && (
                          <div className="flex flex-wrap gap-3 pt-5 border-t border-slate-100 md:ml-11">
                            {isValidationMode && validationTab === 'pending' ? (
                              <>
                                <button onClick={() => handleSingleApprove(q.id)} className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
                                  Approve
                                </button>
                                <button onClick={() => { setEditingItem(q); setShowEditModal(true); }} className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors shadow-sm">
                                  Edit Manually
                                </button>
                                <div className="ml-auto flex gap-3">
                                  <button onClick={() => handlePullFromVault(q)} className="px-5 py-2.5 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors shadow-sm flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    Pull from Vault
                                  </button>
                                  <button onClick={() => confirmRegeneration(q.id)} className="px-5 py-2.5 bg-purple-100 text-purple-800 text-xs font-bold rounded-lg hover:bg-purple-200 transition-colors shadow-sm flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                    Regenerate AI
                                  </button>
                                </div>
                              </>
                            ) : isMaintenanceMode ? (
                              <div className="flex gap-3 w-full justify-end">
                                <button onClick={() => executeProtectedAction(() => { setEditingItem(q); setShowEditModal(true); })} className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors shadow-sm">
                                  Edit Manually
                                </button>
                                <button onClick={() => executeProtectedAction(() => handlePullFromVault(q))} className="px-5 py-2.5 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors shadow-sm flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  Pull from Vault
                                </button>
                                <button onClick={() => executeProtectedAction(() => confirmRegeneration(q.id))} className="px-5 py-2.5 bg-purple-100 text-purple-800 text-xs font-bold rounded-lg hover:bg-purple-200 transition-colors shadow-sm flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                  Regenerate AI
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {/* GRADEBOOK TAB (Formerly Student Analytics) */}
          {examTab === 'gradebook' && (
            <div>
              {isLoadingReview ? (
                <div className="p-16 text-center text-slate-500 font-bold flex flex-col items-center justify-center gap-3">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Loading student submission review...</span>
                </div>
              ) : selectedStudentForReview ? (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <button
                      onClick={() => setSelectedStudentForReview(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                    >
                      ← Back to Gradebook
                    </button>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Student Assessment Review
                    </span>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">{selectedStudentForReview.name}</h3>
                      <p className="text-xs text-slate-500 font-bold mt-1">
                        Viewing Attempt {activeAttemptIndex + 1} of {selectedStudentForReview.attempts.length} — Submitted on {formatAttemptDate(selectedStudentForReview.attempts[activeAttemptIndex].takenAt)}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                      <div className="relative min-w-[280px]">
                        <button
                          onClick={() => setIsReviewDropdownOpen(!isReviewDropdownOpen)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 bg-white flex justify-between items-center transition-colors hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                        >
                          <span className="uppercase text-xs tracking-wider">
                            ATTEMPT {activeAttemptIndex + 1}/{selectedStudentForReview.attempts.length} (SUBMITTED {formatAttemptDate(selectedStudentForReview.attempts[activeAttemptIndex].takenAt).toUpperCase()})
                          </span>
                          <svg className={`w-4 h-4 ml-2 transition-transform duration-200 text-slate-500 ${isReviewDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {isReviewDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsReviewDropdownOpen(false)}></div>
                            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-2">
                              {selectedStudentForReview.attempts.map((att, idx) => {
                                const isSelected = activeAttemptIndex === idx;
                                return (
                                  <div 
                                    key={idx}
                                    onClick={() => { setActiveAttemptIndex(idx); setIsReviewDropdownOpen(false); }}
                                    className={`flex justify-between items-center px-4 py-3 cursor-pointer transition-colors border-l-4 ${isSelected ? 'bg-blue-50 border-blue-600' : 'hover:bg-slate-50 border-transparent'}`}
                                  >
                                    <div>
                                      <div className={`text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>Attempt {idx + 1}</div>
                                      <div className={`text-xs font-bold mt-0.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>Submitted {formatAttemptDate(att.takenAt)}</div>
                                    </div>
                                    <div className={`px-2.5 py-1 rounded text-xs font-bold shrink-0 border ${isSelected ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-emerald-100 border-emerald-200 text-emerald-800'}`}>
                                      {att.rawScore} / {att.maxScore}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                      
                      <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-center min-w-[120px]">
                        <span className="text-2xl font-black text-blue-600 block leading-none">
                          {selectedStudentForReview.attempts[activeAttemptIndex].rawScore} / {selectedStudentForReview.attempts[activeAttemptIndex].maxScore}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-1 block">Attempt Score</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6">
                    {selectedStudentForReview.attempts[activeAttemptIndex].items.map((item) => (
                      <div
                        key={item.qNum}
                        className={`p-6 border rounded-xl bg-white shadow-sm flex flex-col gap-3 border-l-4 transition-all ${
                          item.isCorrect ? 'border-l-emerald-500' : 'border-l-rose-500'
                        }`}
                      >
                        <div className="flex justify-between items-center text-xs font-bold text-slate-400 mb-1">
                          <span className="uppercase tracking-wider">Question {item.qNum}</span>
                          <span className={`px-2 py-1 rounded uppercase tracking-wider ${item.isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {item.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                          </span>
                        </div>

                        <p className="text-base font-bold text-slate-800 leading-relaxed mb-2">
                          {item.text}
                        </p>

                        <div className="space-y-2">
                          {item.options.map((opt, i) => {
                            const isSelected = normalizeForComparison(opt) === normalizeForComparison(item.studentAnswer);
                            const isCorrect = normalizeForComparison(opt) === normalizeForComparison(item.correctAnswer);

                            let baseStyle = 'p-3 border rounded-lg text-sm font-bold flex justify-between items-center transition-colors ';

                            if (isSelected && isCorrect) {
                              baseStyle += 'bg-emerald-100 border-emerald-300 text-emerald-900';
                            } else if (isSelected && !isCorrect) {
                              baseStyle += 'bg-rose-100 border-rose-300 text-rose-900';
                            } else if (!isSelected && isCorrect) {
                              baseStyle += 'bg-emerald-50/50 border-emerald-300 text-emerald-800 border-dashed';
                            } else {
                              baseStyle += 'bg-slate-50 border-slate-200 text-slate-600';
                            }

                            return (
                              <div key={i} className={baseStyle}>
                                <span>{opt}</span>
                                <div className="flex gap-2 text-[10px] uppercase tracking-wider shrink-0">
                                  {isSelected && <span>(Student's Answer)</span>}
                                  {isCorrect && <span>(Correct Answer)</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg mt-3 flex items-start gap-3">
                          <span className="text-lg shrink-0 mt-0.5">🧠</span>
                          <div>
                            <span className="block text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-1">
                              AI-Generated Rationale
                            </span>
                            <p className="text-sm text-blue-950 font-bold leading-relaxed">
                              {item.explanation}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Gradebook & Analytics</h2>
                      <p className="text-sm text-slate-500 font-bold mt-1">Review student progress, completion grades, and specific attempts.</p>
                    </div>
                    <button onClick={exportToCSV} className="px-4 py-2 border border-slate-300 text-slate-900 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Export Gradebook CSV
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 border border-slate-200 border-b-0 rounded-t-lg flex flex-col md:flex-row gap-4">
                    <input
                      type="text"
                      placeholder="Search student name..."
                      value={studentSearch}
                      onChange={handleStudentSearch}
                      className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={studentStatusFilter}
                      onChange={handleStudentStatusChange}
                      className="px-3 py-2 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Completed">Completed</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Not Taken">Not Taken</option>
                    </select>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-b-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Final Grade</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Attempt Logs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {isFetchingAnalytics ? (
                          <tr><td colSpan={4} className="p-8 text-center text-sm font-bold text-slate-500">Loading gradebook...</td></tr>
                        ) : currentStudents.length === 0 ? (
                          <tr><td colSpan={4} className="p-8 text-center text-sm font-bold text-slate-500">No students match your filter criteria.</td></tr>
                        ) : (
                          currentStudents.map(student => (
                            <tr key={student.id} className="hover:bg-slate-50 transition-colors bg-white">
                              <td className="p-4 font-bold text-slate-800">{student.name}</td>
                              <td className="p-4">
                                <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${student.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : student.status === 'In Progress' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                                  {student.status}
                                </span>
                              </td>
                              <td className="p-4 font-bold text-slate-700">{student.grade}</td>
                              <td className="p-4 text-right flex gap-2 justify-end flex-wrap">
                                {student.attempts && student.attempts.length > 0 ? (
                                  <button
                                    onClick={() => handleViewStudent(student)}
                                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                                  >
                                    View Attempts ({student.attempts.length})
                                  </button>
                                ) : (
                                  <span className="text-xs font-bold text-slate-400">No Attempts</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUESTION ANALYTICS TAB */}
          {examTab === 'question_analytics' && (
             <div>
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                 <div>
                   <h2 className="text-xl font-bold text-slate-800">Question Analytics</h2>
                   <p className="text-sm text-slate-500 font-bold mt-1">Review the answer selection breakdown for each deployed item.</p>
                 </div>
               </div>
               <div className="space-y-8">
                 {isFetchingAnalytics ? (
                   <div className="p-12 text-center text-slate-500 font-bold border border-slate-200 rounded-xl">Loading question analytics...</div>
                 ) : questionAnalytics.length === 0 ? (
                   <div className="p-12 text-center text-slate-500 font-bold border border-slate-200 rounded-xl">No analytics available for this exam.</div>
                 ) : questionAnalytics.map((qa, index) => (
                   <div key={qa.id} className="p-6 border border-slate-200 rounded-xl bg-white shadow-sm">
                      <div className="flex items-start gap-4 mb-6">
                        <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold border border-blue-200 shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-lg font-bold text-slate-900 mt-1">{qa.question}</p>
                      </div>
                      <div className="space-y-4 md:ml-12">
                         {qa.options.map((opt: any, idx: number) => (
                           <div key={idx} className="relative w-full bg-slate-100 rounded-lg h-12 flex items-center px-4 overflow-hidden border border-slate-200">
                             <div className={`absolute left-0 top-0 h-full ${opt.isCorrect ? 'bg-emerald-200' : 'bg-slate-300'} opacity-40 transition-all duration-1000`} style={{ width: `${opt.percent}%` }}></div>
                             <div className="relative z-10 flex justify-between w-full text-sm font-bold text-slate-800">
                               <span><span className="mr-2 text-slate-500">{String.fromCharCode(65 + idx)}.</span>{opt.text} {opt.isCorrect && <span className="text-emerald-700 ml-2 uppercase tracking-wider text-[10px]">(Correct)</span>}</span>
                               <span className="bg-white/80 px-2 py-0.5 rounded text-xs">{opt.count} students ({opt.percent}%)</span>
                             </div>
                           </div>
                         ))}
                      </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

        </div>

        {/* Activation Confirmation Modal */}
        {showActivationModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Final Validation Approval</h3>
              </div>
              <p className="text-sm text-slate-600 font-bold mb-6 pl-13 leading-relaxed">
                You are about to approve the last pending question(s) in this queue. Doing so will complete the validation process and automatically change this exam's status to <span className="text-emerald-600">Active</span>, deploying it to the students. Proceed?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowActivationModal(false); setPendingApprovalAction(null); }} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={() => { if(pendingApprovalAction) pendingApprovalAction(); setShowActivationModal(false); setPendingApprovalAction(null); }} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
                  Yes, Approve & Activate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Maintenance Void Warning Modal */}
        {showVoidWarningModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-rose-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-rose-800">Modify Deployed Exam?</h3>
              </div>
              <p className="text-sm text-slate-700 font-bold mb-6 pl-13 leading-relaxed">
                You are entering maintenance mode. If any students have already completed this exam, altering questions will <span className="text-rose-600">void their attempts</span> and require them to retake it. 
                <br/><br/>
                Are you sure you want to proceed?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowVoidWarningModal(false); setPendingMaintenanceAction(null); }} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={() => { setHasAcknowledgedVoidWarning(true); setShowVoidWarningModal(false); if (pendingMaintenanceAction) pendingMaintenanceAction(); setPendingMaintenanceAction(null); }} className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
                  Acknowledge & Proceed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Regenerate Modal */}
        {showRegenerateModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Regenerate Question?</h3>
              </div>
              <p className="text-sm text-slate-600 font-bold mb-6 pl-13 leading-relaxed">
                This will discard the current item and dispatch a new generation task to the Celery workers using the exact same subject, competency, and target taxonomy.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowRegenerateModal(false)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={executeRegeneration} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
                  Yes, Regenerate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Manually Modal */}
        {showEditModal && editingItem && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Edit Question Manually</h3>
              </div>

              <form onSubmit={saveManualEdit} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Question Text</label>
                  <textarea name="question" defaultValue={editingItem.question} required rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {editingItem.options.map((opt, idx) => (
                    <div key={idx}>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Option {String.fromCharCode(65 + idx)}</label>
                      <input type="text" name={`opt${idx}`} defaultValue={opt} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Correct Answer (Must match one option exactly)</label>
                  <input type="text" name="answer" defaultValue={editingItem.answer} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-emerald-50" />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
                    Save & Approve
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  // --- MAIN EXAM LIST VIEW ---
  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Exam Management</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Create, monitor, and validate mock exams for your assigned cohorts.</p>
        </div>
        <button onClick={() => router.push('/faculty/exams/create')} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
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
            placeholder="Search by title or target subject"
            value={examSearchQuery}
            onChange={(e) => setExamSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={examStatusFilter}
            onChange={(e) => setExamStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Inactive">Inactive</option>
            <option value="Hidden">Hidden</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-3">
          <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          Syncing database...
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full">
        {filteredExams.map((exam) => (
          <div key={exam.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col relative">
            <div className={`h-1.5 w-full ${exam.color}`}></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg text-slate-800 leading-snug pr-3">{exam.title}</h3>
                  {getStatusBadge(exam.status)}
                </div>

                <div className="mb-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Assigned Cohorts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {exam.cohorts.length > 0 ? exam.cohorts.map(c => (
                      <span key={c} className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-xs font-bold">{c}</span>
                    )) : (
                      <span className="text-xs text-slate-400 font-bold italic">No cohorts assigned</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Schedule</p>
                    <p className="text-sm text-slate-700 font-bold">{exam.startDateStr} - <br className="hidden sm:block"/>{exam.endDateStr}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Generated Items</p>
                    <p className="text-sm text-slate-700 font-bold">{exam.items}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100">
                <button
                  onClick={() => handleExamClick(exam)}
                  disabled={exam.status === 'Generating'}
                  className={`w-full py-2.5 text-sm font-bold rounded-lg transition-colors shadow-sm ${
                    exam.status === 'Generating' ? 'bg-blue-50 text-blue-400 cursor-not-allowed border border-blue-100' :
                    exam.status === 'Pending' ? 'bg-blue-600 text-white hover:bg-blue-700' :
                    'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {exam.status === 'Generating' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Generating AI...
                    </span>
                  ) : getActionLabel(exam.status)}
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

export default function FacultyExamsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-xl border border-slate-200">
          Loading exam data...
        </div>
      </div>
    }>
      <FacultyExamsContent />
    </Suspense>
  );
}
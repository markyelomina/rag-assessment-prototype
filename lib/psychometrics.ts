export const DEFAULT_BLEPP_WEIGHTS: Record<string, number> = {
  'Psychological Assessment': 40.0,
  'Abnormal Psychology': 20.0,
  'Industrial-Organizational Psychology': 20.0,
  'Developmental Psychology': 20.0,
};

// =========================================================================
// TYPES & INTERFACES
// =========================================================================

export type PsychometricStatus =
  | 'IDEAL'
  | 'TOO_EASY'
  | 'TOO_HARD'
  | 'FLAWED_DISCRIMINATION'
  | 'MISKEYED_SUSPECT'
  | 'ACCEPTABLE'
  | 'PENDING_DATA';

export interface DistractorMetric {
  optionText: string;
  count: number;
  selectionRate: number; // 0.00 to 1.00
  isCorrect: boolean;
  isNonFunctional: boolean; // Selected by < 5% of examinees
}

export interface ItemAnalysisResult {
  questionId: string;
  facilityIndex: number; // P-value: 0.00 to 1.00
  discriminationIndex: number; // D-value: -1.00 to 1.00
  facilityLabel: 'Very Easy' | 'Fairly Easy' | 'Moderate' | 'Difficult' | 'Below Chance / Suspect';
  discriminationLabel: 'Excellent' | 'Good' | 'Acceptable' | 'Poor' | 'Negative / Flawed';
  status: PsychometricStatus;
  statusMessage: string;
  distractors: DistractorMetric[];
}

export interface StudentAttemptScore {
  studentId: string;
  totalScore: number;
  answers: {
    questionId: string;
    selectedOption: string;
    isCorrect: boolean;
  }[];
}

export interface QuestionDefinition {
  id: string;
  subject: string;
  competency: string;
  options: string[];
  correctAnswer: string;
}

export interface TOSWeightRule {
  subject: string;
  competency?: string | null;
  weight: number; // Percentage e.g. 40.00
}

export interface SubjectBreakdown {
  totalItems: number;
  correctItems: number;
  accuracy: number; // 0 to 100%
  weightPercentage: number; // e.g. 40%
  weightedContribution: number;
}

export interface CompetencyBreakdown {
  subject: string;
  competency: string;
  totalItems: number;
  correctItems: number;
  accuracy: number; // 0 to 100%
  needsRemediation: boolean; // Flagged if < 60%
}

export interface TOSScoringResult {
  rawScore: number;
  totalItems: number;
  rawPercentage: number;
  tosWeightedScore: number; // 0.00 to 100.00%
  isProjectedPass: boolean; // Meets or exceeds 75% PRC board passing standard
  subjectBreakdown: Record<string, SubjectBreakdown>;
  competencyBreakdown: Record<string, CompetencyBreakdown>;
}

// =========================================================================
// 1. CLASSICAL TEST THEORY: ITEM FACILITY & DISCRIMINATION
// =========================================================================

/**
 * Calculates Facility Index (P), Kelly's 27% Discrimination Index (D),
 * distractor efficiency, and diagnostic quality flags for a single question.
 */
export function calculateItemAnalysis(
  question: QuestionDefinition,
  allAttempts: StudentAttemptScore[]
): ItemAnalysisResult {
  const totalExaminees = allAttempts.length;

  // 1. Extract responses for this specific question
  const responses = allAttempts.map((attempt) => {
    const ans = attempt.answers.find((a) => a.questionId === question.id);
    return {
      studentId: attempt.studentId,
      totalScore: attempt.totalScore,
      selectedOption: ans?.selectedOption || '',
      isCorrect: ans ? ans.isCorrect : false,
    };
  });

  // 2. Distractor Analysis (Supports both full text and letter 'A', 'B', 'C', 'D' matching)
  const normalizedCorrectAnswer = question.correctAnswer.trim().toLowerCase();
  const distractors: DistractorMetric[] = (question.options || []).map((opt, idx) => {
    const isCorrect = opt.trim().toLowerCase() === normalizedCorrectAnswer;
    const optLetter = String.fromCharCode(65 + idx).toLowerCase(); // 'a', 'b', 'c', 'd'

    const count = responses.filter((r) => {
      const sel = (r.selectedOption || '').trim().toLowerCase();
      return (
        sel === opt.trim().toLowerCase() ||
        sel === optLetter ||
        sel === `option ${optLetter}`
      );
    }).length;

    const selectionRate = totalExaminees > 0 ? Number((count / totalExaminees).toFixed(3)) : 0;

    return {
      optionText: opt,
      count,
      selectionRate,
      isCorrect,
      isNonFunctional: totalExaminees >= 4 && !isCorrect && selectionRate < 0.05,
    };
  });

  // 3. Handle sparse or missing data (returns choices and counts even when examinees < 4)
  if (totalExaminees < 4) {
    const correctCount = responses.filter((r) => r.isCorrect).length;
    const P = totalExaminees > 0 ? Number((correctCount / totalExaminees).toFixed(3)) : 0;

    return {
      questionId: question.id,
      facilityIndex: P,
      discriminationIndex: 0,
      facilityLabel: totalExaminees === 0 ? 'Moderate' : P >= 0.7 ? 'Fairly Easy' : P >= 0.4 ? 'Moderate' : 'Difficult',
      discriminationLabel: 'Acceptable',
      status: 'PENDING_DATA',
      statusMessage: totalExaminees === 0 
        ? 'No examinee attempts recorded yet.' 
        : 'Insufficient attempt data to calculate discrimination index (min. 4 examinees required).',
      distractors,
    };
  }

  // 4. Compute Item Facility Index (P)
  const correctCount = responses.filter((r) => r.isCorrect).length;
  const P = Number((correctCount / totalExaminees).toFixed(3));

  // 5. Compute Item Discrimination Index (D) using Kelly's Upper/Lower 27% Rule
  // Sort examinees in descending order of overall exam score
  const sorted = [...responses].sort((a, b) => b.totalScore - a.totalScore);
  const groupSize = Math.max(1, Math.round(totalExaminees * 0.27));

  const upperGroup = sorted.slice(0, groupSize);
  const lowerGroup = sorted.slice(sorted.length - groupSize);

  const upperCorrect = upperGroup.filter((r) => r.isCorrect).length;
  const lowerCorrect = lowerGroup.filter((r) => r.isCorrect).length;

  const Pu = upperCorrect / groupSize;
  const Pl = lowerCorrect / groupSize;
  const D = Number((Pu - Pl).toFixed(3));

  // 5. Psychometric Labels & Diagnostic Status
  let facilityLabel: ItemAnalysisResult['facilityLabel'] = 'Moderate';
  if (P >= 0.85) facilityLabel = 'Very Easy';
  else if (P >= 0.70) facilityLabel = 'Fairly Easy';
  else if (P >= 0.40) facilityLabel = 'Moderate';
  else if (P >= 0.25) facilityLabel = 'Difficult';
  else facilityLabel = 'Below Chance / Suspect';

  let discriminationLabel: ItemAnalysisResult['discriminationLabel'] = 'Acceptable';
  if (D >= 0.40) discriminationLabel = 'Excellent';
  else if (D >= 0.30) discriminationLabel = 'Good';
  else if (D >= 0.20) discriminationLabel = 'Acceptable';
  else if (D >= 0.00) discriminationLabel = 'Poor';
  else discriminationLabel = 'Negative / Flawed';

  let status: PsychometricStatus = 'ACCEPTABLE';
  let statusMessage = 'Item meets baseline psychometric standards.';

  if (P < 0.20 && D <= 0) {
    status = 'MISKEYED_SUSPECT';
    statusMessage = 'Below-chance accuracy and negative discrimination. High probability of an incorrect answer key or misleading phrasing.';
  } else if (D < 0.00) {
    status = 'FLAWED_DISCRIMINATION';
    statusMessage = 'Negative discrimination. Lower-scoring examinees answered correctly more frequently than top examinees. Check distractors.';
  } else if (D < 0.20) {
    status = 'FLAWED_DISCRIMINATION';
    statusMessage = 'Low discrimination capacity. The item does not adequately separate strong examinees from weak examinees.';
  } else if (P > 0.85) {
    status = 'TOO_EASY';
    statusMessage = 'Question is very easy. Provides minimal psychometric score variance.';
  } else if (P < 0.25) {
    status = 'TOO_HARD';
    statusMessage = 'High difficulty item. Check if concept requires targeted cohort remedial coverage.';
  } else if (P >= 0.40 && P <= 0.70 && D >= 0.30) {
    status = 'IDEAL';
    statusMessage = 'Optimal difficulty and discrimination zone. Maximizes test reliability.';
  }

  return {
    questionId: question.id,
    facilityIndex: P,
    discriminationIndex: D,
    facilityLabel,
    discriminationLabel,
    status,
    statusMessage,
    distractors,
  };
}

// =========================================================================
// 2. EXAM RELIABILITY: KUDER-RICHARDSON FORMULA 20 (KR-20)
// =========================================================================

/**
 * Computes KR-20 reliability coefficient for dichotomous items.
 * Measures the internal consistency of an assessment based on item variances.
 */
export function calculateKR20Reliability(
  totalQuestions: number,
  itemFacilities: number[], // Array of P-values for each question
  totalStudentScores: number[] // Array of total raw scores for each examinee
): number {
  const k = totalQuestions;
  const n = totalStudentScores.length;

  if (k <= 1 || n <= 1) return 0;

  // 1. Sum of item variances: sum(P * (1 - P))
  const sumItemVariance = itemFacilities.reduce((sum, p) => sum + p * (1 - p), 0);

  // 2. Variance of total scores (sigma^2_X)
  const meanScore = totalStudentScores.reduce((sum, s) => sum + s, 0) / n;
  const totalScoreVariance =
    totalStudentScores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0) / (n - 1);

  if (totalScoreVariance <= 0) return 0;

  // 3. KR-20 formula: [k / (k - 1)] * [1 - (sumItemVariance / totalScoreVariance)]
  const kr20 = (k / (k - 1)) * (1 - sumItemVariance / totalScoreVariance);

  return Number(Math.max(0, Math.min(1, kr20)).toFixed(3));
}

// =========================================================================
// 3. TABLE OF SPECIFICATIONS (TOS) WEIGHTED SCORING
// =========================================================================

/**
 * Computes official Table of Specifications (TOS) weighted performance.
 * Accurately models the 40-20-20-20 BLEPP board exam allocation.
 */
export function calculateTOSScoring(
  questions: QuestionDefinition[],
  studentAnswers: { questionId: string; isCorrect: boolean }[],
  customTOSWeights?: TOSWeightRule[]
): TOSScoringResult {
  const totalItems = questions.length;
  let rawScore = 0;

  const subjectMap: Record<
    string,
    { total: number; correct: number; weight: number }
  > = {};

  const competencyMap: Record<
    string,
    { subject: string; total: number; correct: number }
  > = {};

  // Build weight lookup table
  const weightLookup: Record<string, number> = {};

  if (customTOSWeights && customTOSWeights.length > 0) {
    customTOSWeights.forEach((rule) => {
      weightLookup[rule.subject] = Number(rule.weight);
    });
  } else {
    Object.entries(DEFAULT_BLEPP_WEIGHTS).forEach(([subj, weight]) => {
      weightLookup[subj] = weight;
    });
  }

  // Map answers to questions (supports both camelCase and snake_case)
  questions.forEach((q) => {
    const ans: any = studentAnswers.find(
      (a: any) => (a.questionId || a.question_id) === q.id
    );
    const isCorrect = ans ? (ans.isCorrect ?? ans.is_correct ?? false) : false;
    if (isCorrect) rawScore += 1;

    // Subject tracking
    const subj = q.subject || 'General Scope';
    if (!subjectMap[subj]) {
      const assignedWeight = weightLookup[subj] !== undefined ? weightLookup[subj] : 0;
      subjectMap[subj] = { total: 0, correct: 0, weight: assignedWeight };
    }
    subjectMap[subj].total += 1;
    if (isCorrect) subjectMap[subj].correct += 1;

    // Competency tracking
    const compKey = `${subj}:::${q.competency || 'General Competency'}`;
    if (!competencyMap[compKey]) {
      competencyMap[compKey] = {
        subject: subj,
        total: 0,
        correct: 0,
      };
    }
    competencyMap[compKey].total += 1;
    if (isCorrect) competencyMap[compKey].correct += 1;
  });

  // Calculate subject-level breakdowns and composite TOS score
  let tosWeightedScore = 0;
  let activeWeightTotal = 0;

  const subjectBreakdown: Record<string, SubjectBreakdown> = {};

  Object.entries(subjectMap).forEach(([subj, data]) => {
    const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
    activeWeightTotal += data.weight;

    subjectBreakdown[subj] = {
      totalItems: data.total,
      correctItems: data.correct,
      accuracy: Number(accuracy.toFixed(2)),
      weightPercentage: data.weight,
      weightedContribution: Number(((accuracy * data.weight) / 100).toFixed(2)),
    };
  });

  // Normalize weight if exam does not test all 4 board subjects
  if (activeWeightTotal > 0) {
    const weightedSum = Object.values(subjectBreakdown).reduce(
      (sum, s) => sum + (s.accuracy * s.weightPercentage) / 100,
      0
    );
    // Scale up to 100% equivalent based on tested domains
    tosWeightedScore = Number(((weightedSum / activeWeightTotal) * 100).toFixed(2));
  } else {
    tosWeightedScore = totalItems > 0 ? Number(((rawScore / totalItems) * 100).toFixed(2)) : 0;
  }

  // Calculate competency breakdowns
  const competencyBreakdown: Record<string, CompetencyBreakdown> = {};

  Object.entries(competencyMap).forEach(([compKey, data]) => {
    const [, competencyName] = compKey.split(':::');
    const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;

    competencyBreakdown[compKey] = {
      subject: data.subject,
      competency: competencyName,
      totalItems: data.total,
      correctItems: data.correct,
      accuracy: Number(accuracy.toFixed(2)),
      needsRemediation: accuracy < 60.0,
    };
  });

  const rawPercentage = totalItems > 0 ? Number(((rawScore / totalItems) * 100).toFixed(2)) : 0;

  return {
    rawScore,
    totalItems,
    rawPercentage,
    tosWeightedScore,
    isProjectedPass: tosWeightedScore >= 75.0, // Official Philippine Licensure Examination benchmark
    subjectBreakdown,
    competencyBreakdown,
  };
}

// =========================================================================
// 4. COHORT REMEDIATION & WEAK-SPOT IDENTIFIER
// =========================================================================

export interface CohortWeakSpot {
  subject: string;
  competency: string;
  totalAttempts: number;
  accuracy: number; // 0 to 100%
  recommendedAction: string;
}

/**
 * Aggregates all student attempts across a cohort to extract the top weakest
 * competencies, generating an agenda for remedial coaching sessions.
 */
export function identifyCohortWeakSpots(
  questions: QuestionDefinition[],
  allAttempts: StudentAttemptScore[],
  limit: number = 3
): CohortWeakSpot[] {
  const aggregated: Record<
    string,
    { subject: string; competency: string; totalAnswered: number; totalCorrect: number }
  > = {};

  questions.forEach((q) => {
    const compKey = `${q.subject}:::${q.competency || 'General Competency'}`;
    if (!aggregated[compKey]) {
      aggregated[compKey] = {
        subject: q.subject,
        competency: q.competency || 'General Competency',
        totalAnswered: 0,
        totalCorrect: 0,
      };
    }

    allAttempts.forEach((attempt) => {
      const ans = attempt.answers.find((a) => a.questionId === q.id);
      if (ans) {
        aggregated[compKey].totalAnswered += 1;
        if (ans.isCorrect) aggregated[compKey].totalCorrect += 1;
      }
    });
  });

  const list: CohortWeakSpot[] = Object.values(aggregated)
    .filter((entry) => entry.totalAnswered > 0)
    .map((entry) => {
      const accuracy = Number(((entry.totalCorrect / entry.totalAnswered) * 100).toFixed(1));
      let recommendedAction = 'Maintain review cycle.';

      if (accuracy < 40) {
        recommendedAction = 'Critical deficit: Mandatory remedial lecture and textbook reread required.';
      } else if (accuracy < 60) {
        recommendedAction = 'Moderate deficit: Target during final coaching drills.';
      }

      return {
        subject: entry.subject,
        competency: entry.competency,
        totalAttempts: entry.totalAnswered,
        accuracy,
        recommendedAction,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy); // Lowest accuracy first

  return list.slice(0, limit);
}
import type { PaperScore, ReportMainResponse } from "./types";

export type ValidSubjectScore = {
  paper: PaperScore;
  score: number;
  standardScore: number;
  percentage: number;
};

export type ComputedTotalScore = {
  score: number | null;
  standardScore: number | null;
  percentage: number | null;
  subjectCount: number;
};

export function getValidSubjectScores(reportMain: ReportMainResponse): ValidSubjectScore[] {
  return (reportMain.result?.paperList ?? [])
    .map((paper) => {
      const score = toNumber(paper.userScore);
      const standardScore = toNumber(paper.standardScore);

      if (score === null || standardScore === null || standardScore <= 0) {
        return null;
      }

      return {
        paper,
        score,
        standardScore,
        percentage: round((score / standardScore) * 100)
      };
    })
    .filter((item): item is ValidSubjectScore => Boolean(item));
}

export function computeTotalFromSubjects(reportMain: ReportMainResponse): ComputedTotalScore {
  const subjects = getValidSubjectScores(reportMain);

  if (subjects.length === 0) {
    return {
      score: null,
      standardScore: null,
      percentage: null,
      subjectCount: 0
    };
  }

  const score = round(subjects.reduce((sum, subject) => sum + subject.score, 0));
  const standardScore = round(subjects.reduce((sum, subject) => sum + subject.standardScore, 0));

  return {
    score,
    standardScore,
    percentage: standardScore > 0 ? round((score / standardScore) * 100) : null,
    subjectCount: subjects.length
  };
}

export function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

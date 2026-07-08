import type { ExamItem, PaperScore, ReportMainResponse } from "./types";
import { computeTotalFromSubjects, round, toNumber } from "./score";
import type { RankInfo } from "./types";

export type AnalysisExamRecord = {
  examId: string;
  examName: string;
  examCreateDateTime: number | string;
  examType?: string;
  academicYearKey?: string;
  academicYearName?: string;
  totalScore: number | null;
  standardScore: number | null;
  percentage: number | null;
  classRank?: RankInfo | null;
  userLevel?: string;
  subjects: AnalysisSubjectRecord[];
};

export type AnalysisSubjectRecord = {
  examId: string;
  examName: string;
  examCreateDateTime: number | string;
  examType?: string;
  academicYearName?: string;
  paperId: string;
  subjectName: string;
  score: number;
  standardScore: number;
  percentage: number;
  classRank?: RankInfo | null;
  level?: string;
};

export type TotalScorePoint = {
  key: string;
  examId: string;
  examName: string;
  academicYearName?: string;
  label: string;
  score: number | null;
  percentage: number | null;
  classRank: number | null;
  classRankTotal?: number;
};

export type SubjectTrendPoint = {
  key: string;
  examId: string;
  examName: string;
  academicYearName?: string;
  label: string;
  subjectName: string;
  score: number;
  percentage: number;
  classRank: number | null;
  classRankTotal?: number;
};

export type AnalysisSummary = {
  examCount: number;
  subjectCount: number;
  averagePercentage: number | null;
  bestExamName: string | null;
  bestPercentage: number | null;
  latestDelta: number | null;
};

export function buildAnalysisRecord(
  exam: ExamItem,
  reportMain: ReportMainResponse,
  rankData: {
    classRank?: RankInfo | null;
    subjectClassRank?: Record<string, RankInfo | null>;
  } = {}
): AnalysisExamRecord {
  const totalScore = computeTotalFromSubjects(reportMain);

  return {
    examId: exam.examId,
    examName: exam.examName,
    examCreateDateTime: exam.examCreateDateTime,
    examType: exam.examType,
    academicYearKey: "academicYearKey" in exam && typeof exam.academicYearKey === "string" ? exam.academicYearKey : undefined,
    academicYearName: "academicYearName" in exam && typeof exam.academicYearName === "string" ? exam.academicYearName : undefined,
    totalScore: totalScore.score,
    standardScore: totalScore.standardScore,
    percentage: totalScore.percentage,
    classRank: rankData.classRank ?? null,
    userLevel: reportMain.result?.totalScore?.userLevel,
    subjects: (reportMain.result?.paperList ?? [])
      .map((paper) => toSubjectRecord(exam, paper, rankData.subjectClassRank?.[paper.paperId] ?? null))
      .filter((item): item is AnalysisSubjectRecord => Boolean(item))
  };
}

export function sortAnalysisRecords(records: AnalysisExamRecord[]): AnalysisExamRecord[] {
  return sortByExamTimeAsc(records);
}

export function sortByExamTimeAsc<TRecord extends { examCreateDateTime?: number | string; cachedAt?: string; examId?: string; academicYearKey?: string }>(
  records: TRecord[]
): TRecord[] {
  return [...records].sort((left, right) => {
    const leftTime = getExamTimeValue(left);
    const rightTime = getExamTimeValue(right);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return `${left.academicYearKey ?? ""}::${left.examId ?? ""}`.localeCompare(`${right.academicYearKey ?? ""}::${right.examId ?? ""}`);
  });
}

export function sortByExamTimeDesc<TRecord extends { examCreateDateTime?: number | string; cachedAt?: string; examId?: string; academicYearKey?: string }>(
  records: TRecord[]
): TRecord[] {
  return [...records].sort((left, right) => {
    const leftTime = getExamTimeValue(left);
    const rightTime = getExamTimeValue(right);
    if (leftTime !== rightTime) return rightTime - leftTime;
    return `${left.academicYearKey ?? ""}::${left.examId ?? ""}`.localeCompare(`${right.academicYearKey ?? ""}::${right.examId ?? ""}`);
  });
}

export function getExamTimeValue(record: { examCreateDateTime?: number | string; cachedAt?: string }): number {
  return parseTime(record.examCreateDateTime) ?? parseTime(record.cachedAt) ?? 0;
}

export function buildTotalScoreSeries(records: AnalysisExamRecord[]): TotalScorePoint[] {
  const labels = buildAnalysisLabels(records);
  return sortAnalysisRecords(records).map((record, index) => ({
    key: getAnalysisRecordKey(record),
    examId: record.examId,
    examName: record.examName,
    academicYearName: record.academicYearName,
    label: labels[getAnalysisRecordKey(record)] ?? `考试${index + 1}`,
    score: record.totalScore,
    percentage: record.percentage,
    classRank: typeof record.classRank?.rank === "number" ? record.classRank.rank : null,
    classRankTotal: record.classRank?.total
  }));
}

export function buildSubjectSeries(records: AnalysisExamRecord[]): Record<string, SubjectTrendPoint[]> {
  const series: Record<string, SubjectTrendPoint[]> = {};
  const labels = buildAnalysisLabels(records);

  sortAnalysisRecords(records).forEach((record, index) => {
    record.subjects.forEach((subject) => {
      series[subject.subjectName] ??= [];
      series[subject.subjectName].push({
        key: getAnalysisRecordKey(record),
        examId: record.examId,
        examName: record.examName,
        academicYearName: record.academicYearName,
        label: labels[getAnalysisRecordKey(record)] ?? `考试${index + 1}`,
        subjectName: subject.subjectName,
        score: subject.score,
        percentage: subject.percentage,
        classRank: typeof subject.classRank?.rank === "number" ? subject.classRank.rank : null,
        classRankTotal: subject.classRank?.total
      });
    });
  });

  return series;
}

export function buildAnalysisLabels(records: AnalysisExamRecord[]): Record<string, string> {
  return Object.fromEntries(sortAnalysisRecords(records).map((record, index) => [getAnalysisRecordKey(record), `考试${index + 1}`]));
}

export function summarizeAnalysis(records: AnalysisExamRecord[]): AnalysisSummary {
  const totalSeries = buildTotalScoreSeries(records).filter((point) => point.percentage !== null);
  const subjectNames = new Set(records.flatMap((record) => record.subjects.map((subject) => subject.subjectName)));
  const best = totalSeries.reduce<TotalScorePoint | null>((current, point) => {
    if (!current || (point.percentage ?? -1) > (current.percentage ?? -1)) {
      return point;
    }
    return current;
  }, null);
  const averagePercentage =
    totalSeries.length > 0
      ? round(totalSeries.reduce((sum, point) => sum + (point.percentage ?? 0), 0) / totalSeries.length)
      : null;
  const latestDelta =
    totalSeries.length >= 2
      ? round((totalSeries[totalSeries.length - 1].percentage ?? 0) - (totalSeries[totalSeries.length - 2].percentage ?? 0))
      : null;

  return {
    examCount: records.length,
    subjectCount: subjectNames.size,
    averagePercentage,
    bestExamName: best?.examName ?? null,
    bestPercentage: best?.percentage ?? null,
    latestDelta
  };
}

function toSubjectRecord(exam: ExamItem, paper: PaperScore, classRank: RankInfo | null): AnalysisSubjectRecord | null {
  const score = toNumber(paper.userScore);
  const standardScore = toNumber(paper.standardScore);

  if (score === null || standardScore === null || standardScore <= 0) {
    return null;
  }

  return {
    examId: exam.examId,
    examName: exam.examName,
    examCreateDateTime: exam.examCreateDateTime,
    examType: exam.examType,
    academicYearName: "academicYearName" in exam && typeof exam.academicYearName === "string" ? exam.academicYearName : undefined,
    paperId: paper.paperId,
    subjectName: paper.subjectName,
    score,
    standardScore,
    percentage: round((score / standardScore) * 100),
    classRank,
    level: paper.userLevel
  };
}

function parseTime(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function getAnalysisRecordKey(record: AnalysisExamRecord): string {
  return `${record.academicYearKey ?? ""}::${record.examId}`;
}

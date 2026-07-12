import {
  buildAnalysisRecord,
  sortAnalysisRecords,
  type AnalysisExamRecord,
  type SubjectTrendPoint,
  type TotalScorePoint
} from "./analysis";
import {
  buildScoreCacheKey,
  getCachedExamIdentity,
  readScoreCache,
  writeScoreCache,
  type CachedScoreRecord
} from "./cache";
import type { AcademicYear, ExamDetailPayload, SubjectLevelTrendPayload } from "./protocol";
import { getClassRankInfo, getSubjectClassRankInfo } from "./rank";
import type { ExamItem, LevelTrendResponse, RankInfo, ReportMainResponse } from "./types";

export type AnalysisMetric = "percentage" | "classRank";

export type AnalysisExamSourceItem = ExamItem & {
  academicYear: AcademicYear;
  academicYearKey: string;
  academicYearName: string;
};

export type AnalysisSource =
  | { kind: "exam"; exam: AnalysisExamSourceItem }
  | { kind: "cache"; record: CachedScoreRecord<ReportMainResponse> };

export type AnalysisPipelineOptions = {
  forceRefresh: boolean;
  cachePolicy?: "persistent" | "none";
  sendExamDetail: <TData>(payload: ExamDetailPayload) => Promise<TData>;
  sendSubjectLevelTrend: <TData>(payload: SubjectLevelTrendPayload) => Promise<TData>;
  onProgress?: (completed: number, total: number) => void;
  onCacheWrite?: () => void;
};

export type MetricPoint = {
  key: string;
  examId: string;
  examName: string;
  academicYearName?: string;
  label: string;
  value: number | null;
  display: string;
};

export async function buildAnalysisRecordsFromSources(
  sources: AnalysisSource[],
  options: AnalysisPipelineOptions
): Promise<AnalysisExamRecord[]> {
  let completed = 0;
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await buildRecordFromSource(source, options);
      } catch {
        return null;
      } finally {
        completed += 1;
        options.onProgress?.(completed, sources.length);
      }
    })
  );

  return sortAnalysisRecords(results.filter((record): record is AnalysisExamRecord => Boolean(record)));
}

export function buildMetricSeries(points: TotalScorePoint[], metric: AnalysisMetric): MetricPoint[] {
  return points.map((point) => ({
    key: point.key,
    examId: point.examId,
    examName: point.examName,
    academicYearName: point.academicYearName,
    label: point.label,
    value: metric === "classRank" ? point.classRank : point.percentage,
    display: metric === "classRank" ? formatRank(point.classRank, point.classRankTotal) : formatPercentage(point.percentage)
  }));
}

export function buildSubjectMetricSeries(
  series: Record<string, SubjectTrendPoint[]>,
  metric: AnalysisMetric,
  visibleSubjects: Set<string>
): Record<string, MetricPoint[]> {
  const entries = Object.entries(series).filter(([subjectName]) => visibleSubjects.has(subjectName));

  return Object.fromEntries(
    entries.map(([subjectName, points]) => [
      subjectName,
      points.map((point) => ({
        key: point.key,
        examId: point.examId,
        examName: point.examName,
        academicYearName: point.academicYearName,
        label: point.label,
        value: metric === "classRank" ? point.classRank : point.percentage,
        display: metric === "classRank" ? formatRank(point.classRank, point.classRankTotal) : formatPercentage(point.percentage)
      }))
    ])
  );
}

async function buildRecordFromSource(
  source: AnalysisSource,
  options: AnalysisPipelineOptions
): Promise<AnalysisExamRecord> {
  if (source.kind === "cache") {
    const exam = cachedRecordToExamItem(source.record);
    if (options.forceRefresh && source.record.academicYear) {
      const fresh = await getReportMain(exam, options).catch(() => source.record.data);
      const ranks = await getRanksForExam(exam, fresh, options).catch(() => getCachedRanksForExam(exam, fresh));
      return buildAnalysisRecord(exam, fresh, ranks);
    }
    return buildAnalysisRecord(exam, source.record.data, await getCachedRanksForExam(exam, source.record.data));
  }

  const reportMain = await getReportMain(source.exam, options);
  const ranks = await getRanksForExam(source.exam, reportMain, options);
  return buildAnalysisRecord(source.exam, reportMain, ranks);
}

async function getReportMain(
  exam: AnalysisExamSourceItem,
  options: AnalysisPipelineOptions
): Promise<ReportMainResponse> {
  const cacheKey = buildScoreCacheKey({
    academicYearKey: exam.academicYearKey,
    examId: exam.examId,
    detailType: "getReportMain"
  });
  const cached = options.cachePolicy !== "none" && !options.forceRefresh ? await readScoreCache<ReportMainResponse>(cacheKey) : null;
  if (cached) return cached.data;

  const data = await options.sendExamDetail<ReportMainResponse>({
    examId: exam.examId,
    examDetailType: "getReportMain",
    academicYear: exam.academicYear
  });
  if (options.cachePolicy !== "none") {
    await writeDetailCache(cacheKey, exam, "getReportMain", data);
    options.onCacheWrite?.();
  }
  return data;
}

async function getRanksForExam(
  exam: AnalysisExamSourceItem,
  reportMain: ReportMainResponse,
  options: AnalysisPipelineOptions
): Promise<{ classRank: RankInfo | null; subjectClassRank: Record<string, RankInfo | null> }> {
  const levelTrend = await getLevelTrend(exam, options).catch(() => null);
  const subjectClassRank: Record<string, RankInfo | null> = {};

  await Promise.all(
    (reportMain.result?.paperList ?? []).map(async (paper) => {
      const trend = await getSubjectTrend(exam, paper.paperId, options).catch(() => null);
      subjectClassRank[paper.paperId] = trend ? getSubjectClassRankInfo(paper.paperId, { [paper.paperId]: trend }) : null;
    })
  );

  return {
    classRank: getClassRankInfo(levelTrend),
    subjectClassRank
  };
}

function getCachedRanksForExam(
  exam: AnalysisExamSourceItem,
  reportMain: ReportMainResponse
): Promise<{ classRank: RankInfo | null; subjectClassRank: Record<string, RankInfo | null> }> {
  return getCachedRanksForExamAsync(exam, reportMain);
}

async function getCachedRanksForExamAsync(
  exam: AnalysisExamSourceItem,
  reportMain: ReportMainResponse
): Promise<{ classRank: RankInfo | null; subjectClassRank: Record<string, RankInfo | null> }> {
  const levelTrend =
    (await readScoreCache<LevelTrendResponse>(
    buildScoreCacheKey({ academicYearKey: exam.academicYearKey, examId: exam.examId, detailType: "getLevelTrend" })
    ))?.data ?? null;
  const subjectClassRank: Record<string, RankInfo | null> = {};

  await Promise.all((reportMain.result?.paperList ?? []).map(async (paper) => {
    const trend =
      (await readScoreCache<LevelTrendResponse>(
        buildScoreCacheKey({
          academicYearKey: exam.academicYearKey,
          examId: exam.examId,
          detailType: "getSubjectLevelTrend",
          paperId: paper.paperId
        })
      ))?.data;
    subjectClassRank[paper.paperId] = trend ? getSubjectClassRankInfo(paper.paperId, { [paper.paperId]: trend }) : null;
  }));

  return {
    classRank: getClassRankInfo(levelTrend),
    subjectClassRank
  };
}

async function getLevelTrend(exam: AnalysisExamSourceItem, options: AnalysisPipelineOptions): Promise<LevelTrendResponse> {
  const cacheKey = buildScoreCacheKey({
    academicYearKey: exam.academicYearKey,
    examId: exam.examId,
    detailType: "getLevelTrend"
  });
  const cached = options.cachePolicy !== "none" && !options.forceRefresh ? await readScoreCache<LevelTrendResponse>(cacheKey) : null;
  if (cached) return cached.data;

  const data = await options.sendExamDetail<LevelTrendResponse>({
    examId: exam.examId,
    examDetailType: "getLevelTrend",
    academicYear: exam.academicYear
  });
  if (options.cachePolicy !== "none") {
    await writeDetailCache(cacheKey, exam, "getLevelTrend", data);
    options.onCacheWrite?.();
  }
  return data;
}

async function getSubjectTrend(
  exam: AnalysisExamSourceItem,
  paperId: string,
  options: AnalysisPipelineOptions
): Promise<LevelTrendResponse> {
  const cacheKey = buildScoreCacheKey({
    academicYearKey: exam.academicYearKey,
    examId: exam.examId,
    detailType: "getSubjectLevelTrend",
    paperId
  });
  const cached = options.cachePolicy !== "none" && !options.forceRefresh ? await readScoreCache<LevelTrendResponse>(cacheKey) : null;
  if (cached) return cached.data;

  const data = await options.sendSubjectLevelTrend<LevelTrendResponse>({
    examId: exam.examId,
    paperId,
    academicYear: exam.academicYear
  });
  if (options.cachePolicy !== "none") {
    await writeDetailCache(cacheKey, exam, "getSubjectLevelTrend", data, paperId);
    options.onCacheWrite?.();
  }
  return data;
}

async function writeDetailCache<TData>(
  cacheKey: string,
  exam: AnalysisExamSourceItem,
  detailType: CachedScoreRecord["detailType"],
  data: TData,
  paperId?: string
): Promise<void> {
  await writeScoreCache(cacheKey, {
    cachedAt: new Date().toISOString(),
    academicYear: exam.academicYear,
    academicYearKey: exam.academicYearKey,
    academicYearName: exam.academicYearName,
    examId: exam.examId,
    examName: exam.examName,
    examType: exam.examType,
    examCreateDateTime: exam.examCreateDateTime,
    detailType,
    paperId,
    data
  });
}

function cachedRecordToExamItem(record: CachedScoreRecord<ReportMainResponse>): AnalysisExamSourceItem {
  const academicYear = record.academicYear ?? {
    name: record.academicYearName ?? "缓存学年",
    beginTime: "unknown",
    endTime: "unknown"
  };
  const academicYearKey = record.academicYearKey ?? getCachedExamIdentity(record).split("::")[0] ?? "unknown-year";

  return {
    examId: record.examId,
    examName: record.examName ?? record.examId,
    examCreateDateTime: record.examCreateDateTime ?? record.cachedAt,
    examType: record.examType ?? "",
    academicYear,
    academicYearKey,
    academicYearName: record.academicYearName ?? academicYear.name
  };
}

function formatPercentage(value: number | null): string {
  return value === null ? "暂无" : `${value}%`;
}

function formatRank(rank: number | null, total?: number): string {
  if (rank === null) return "暂无";
  return total ? `${rank}/${total}` : String(rank);
}

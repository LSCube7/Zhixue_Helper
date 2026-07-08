import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { sortByExamTimeAsc, sortByExamTimeDesc } from "./analysis";
import type { AnalysisMetric } from "./analysis-pipeline";
import type { AcademicYear, ExamDetailType } from "./protocol";
import type { ReportMainResponse } from "./types";

export const scoreCacheStorageKey = "owl-insight-score-cache";
export const indexedDbName = "owl-insight-db";

export type CachedScoreRecord<TData = unknown> = {
  key?: string;
  cachedAt: string;
  academicYear: AcademicYear | null;
  academicYearKey?: string;
  academicYearName?: string;
  examId: string;
  examName?: string;
  examType?: string;
  examCreateDateTime?: number | string;
  detailType: ExamDetailType | "getSubjectLevelTrend";
  paperId?: string;
  data: TData;
};

export type AnalysisTarget = {
  metric: AnalysisMetric;
  total?: number | null;
  subjects?: Record<string, number | null>;
};

export type AnalysisInsightSettings = {
  scoreDropThreshold: number;
  rankDropThreshold: number;
  classificationRules?: ExamClassificationRule[];
};

export type ExamClassificationRule = {
  id: string;
  name: string;
  nameIncludes?: string;
  examType?: string;
  dateFrom?: string;
  dateTo?: string;
  conditions?: ExamClassificationCondition[];
};

export type ExamClassificationCondition = {
  id: string;
  field: "examName" | "examType" | "examDate";
  operator: "contains" | "notContains" | "equals" | "after" | "before";
  value: string;
  conjunction: "and" | "or";
};

export type AnalysisPlan = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  selectedExamKeys: string[];
  selectedCachedExamKeys: string[];
  selectedClassificationLabels?: string[];
  activeExamType?: string;
  visibleSubjectNames: string[];
  metric: AnalysisMetric;
  target: AnalysisTarget;
  insightSettings: AnalysisInsightSettings;
  note: string;
};

export type AnalysisTemplate = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  selectedExamTypes: string[];
  selectedClassificationLabels: string[];
  visibleSubjectNames: string[];
  metric: AnalysisMetric;
  target: AnalysisTarget;
  insightSettings: AnalysisInsightSettings;
};

export type ExamNote = {
  examKey: string;
  note: string;
  updatedAt: string;
};

export type CacheStats = {
  scoreRecordCount: number;
  reportMainCount: number;
  estimatedBytes: number;
  academicYears: string[];
  examTypes: string[];
};

export const defaultAnalysisInsightSettings: AnalysisInsightSettings = {
  scoreDropThreshold: 10,
  rankDropThreshold: 10,
  classificationRules: []
};

type ScoreCacheStore = Record<string, CachedScoreRecord>;

type OwlInsightDb = DBSchema & {
  scoreRecords: {
    key: string;
    value: CachedScoreRecord;
    indexes: {
      "by-academic-year": string;
      "by-exam-type": string;
      "by-detail-type": string;
    };
  };
  analysisPlans: {
    key: string;
    value: AnalysisPlan;
    indexes: {
      "by-updated-at": string;
    };
  };
  analysisTemplates: {
    key: string;
    value: AnalysisTemplate;
    indexes: {
      "by-updated-at": string;
    };
  };
  examNotes: {
    key: string;
    value: ExamNote;
  };
  analysisSettings: {
    key: string;
    value: { key: string; value: unknown };
  };
};

let dbPromise: Promise<IDBPDatabase<OwlInsightDb>> | null = null;

export function buildScoreCacheKey(input: {
  academicYearKey: string;
  examId: string;
  detailType: ExamDetailType | "getSubjectLevelTrend";
  paperId?: string;
}): string {
  return [input.academicYearKey, input.examId, input.detailType, input.paperId ?? ""].join("::");
}

export async function readScoreCache<TData>(key: string): Promise<CachedScoreRecord<TData> | null> {
  const db = await getDb();
  const record = await db.get("scoreRecords", key);
  return record ? (normalizeScoreRecordForRead(record) as CachedScoreRecord<TData>) : null;
}

export async function listScoreCacheRecords(): Promise<CachedScoreRecord[]> {
  const db = await getDb();
  return sortByExamTimeAsc((await db.getAll("scoreRecords")).map(normalizeScoreRecordForRead));
}

export async function listCachedReportMainRecords(): Promise<CachedScoreRecord<ReportMainResponse>[]> {
  const records = await listScoreCacheRecords();
  return sortByExamTimeDesc(records.filter((record): record is CachedScoreRecord<ReportMainResponse> => record.detailType === "getReportMain"));
}

export function getCachedExamIdentity(record: CachedScoreRecord): string {
  return `${record.academicYearKey ?? getAcademicYearKey(record.academicYear)}::${record.examId}`;
}

export async function writeScoreCache<TData>(key: string, record: CachedScoreRecord<TData>): Promise<void> {
  const db = await getDb();
  const existing = await db.get("scoreRecords", key);
  await db.put("scoreRecords", mergeScoreRecordMetadata(existing, { ...(record as CachedScoreRecord), key }));
}

export async function updateScoreCacheMetadata(key: string, metadata: Partial<CachedScoreRecord>): Promise<void> {
  const db = await getDb();
  const existing = await db.get("scoreRecords", key);
  if (!existing) return;
  await db.put("scoreRecords", mergeScoreRecordMetadata(existing, { ...existing, ...metadata, key }));
}

export async function updateScoreCacheMetadataForExam(
  identity: { academicYearKey: string; examId: string },
  metadata: Partial<CachedScoreRecord>
): Promise<number> {
  const db = await getDb();
  const records = await db.getAll("scoreRecords");
  const matched = records.filter((record) => record.academicYearKey === identity.academicYearKey && record.examId === identity.examId && record.key);
  const tx = db.transaction("scoreRecords", "readwrite");
  await Promise.all(
    matched.map((record) =>
      tx.store.put(mergeScoreRecordMetadata(record, { ...record, ...metadata, key: record.key }))
    )
  );
  await tx.done;
  return matched.length;
}

export async function clearScoreCache(): Promise<void> {
  const db = await getDb();
  await db.clear("scoreRecords");
}

export async function deleteScoreCacheRecords(filter: { academicYearKey?: string; academicYearName?: string; examType?: string }): Promise<number> {
  const db = await getDb();
  const records = await db.getAll("scoreRecords");
  const keys = records
    .filter(
      (record) =>
        (!filter.academicYearKey || record.academicYearKey === filter.academicYearKey) &&
        (!filter.academicYearName || record.academicYearName === filter.academicYearName || record.academicYear?.name === filter.academicYearName) &&
        (!filter.examType || record.examType === filter.examType)
    )
    .map((record) => record.key)
    .filter((key): key is string => Boolean(key));

  const tx = db.transaction("scoreRecords", "readwrite");
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
  return keys.length;
}

export async function getCacheStats(): Promise<CacheStats> {
  const records = await listScoreCacheRecords();
  return {
    scoreRecordCount: records.length,
    reportMainCount: records.filter((record) => record.detailType === "getReportMain").length,
    estimatedBytes: estimateBytes(records),
    academicYears: Array.from(new Set(records.map((record) => record.academicYearName ?? record.academicYear?.name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    examTypes: Array.from(new Set(records.map((record) => record.examType).filter(isUsefulExamType))).sort()
  };
}

export async function saveAnalysisPlan(plan: AnalysisPlan): Promise<void> {
  const db = await getDb();
  await db.put("analysisPlans", plan);
}

export async function listAnalysisPlans(): Promise<AnalysisPlan[]> {
  const db = await getDb();
  const plans = await db.getAll("analysisPlans");
  return plans.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function readAnalysisPlan(id: string): Promise<AnalysisPlan | null> {
  const db = await getDb();
  return (await db.get("analysisPlans", id)) ?? null;
}

export async function deleteAnalysisPlan(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("analysisPlans", id);
}

export async function saveAnalysisTemplate(template: AnalysisTemplate): Promise<void> {
  const db = await getDb();
  await db.put("analysisTemplates", template);
}

export async function listAnalysisTemplates(): Promise<AnalysisTemplate[]> {
  const db = await getDb();
  const templates = await db.getAll("analysisTemplates");
  return templates.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function deleteAnalysisTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("analysisTemplates", id);
}

export async function readExamNote(examKey: string): Promise<ExamNote | null> {
  const db = await getDb();
  return (await db.get("examNotes", examKey)) ?? null;
}

export async function listExamNotes(): Promise<ExamNote[]> {
  const db = await getDb();
  return db.getAll("examNotes");
}

export async function writeExamNote(note: ExamNote): Promise<void> {
  const db = await getDb();
  if (note.note.trim()) {
    await db.put("examNotes", note);
  } else {
    await db.delete("examNotes", note.examKey);
  }
}

export async function readAnalysisInsightSettings(): Promise<AnalysisInsightSettings> {
  const db = await getDb();
  const saved = await db.get("analysisSettings", "insight-settings");
  return { ...defaultAnalysisInsightSettings, ...(isRecord(saved?.value) ? saved.value : {}) };
}

export async function writeAnalysisInsightSettings(settings: AnalysisInsightSettings): Promise<void> {
  const db = await getDb();
  await db.put("analysisSettings", { key: "insight-settings", value: settings });
}

export async function exportLocalData(): Promise<unknown> {
  const db = await getDb();
  return {
    exportedAt: new Date().toISOString(),
    scoreRecords: await db.getAll("scoreRecords"),
    analysisPlans: await db.getAll("analysisPlans"),
    analysisTemplates: await db.getAll("analysisTemplates"),
    examNotes: await db.getAll("examNotes"),
    analysisSettings: await db.getAll("analysisSettings")
  };
}

export async function migrateLocalStorageScoreCacheToIndexedDb(): Promise<number> {
  const store = readLegacyStore();
  const entries = Object.entries(store);
  if (entries.length === 0) return 0;

  const db = await getDb();
  const tx = db.transaction("scoreRecords", "readwrite");
  let migrated = 0;
  await Promise.all(
    entries.map(async ([key, record]) => {
      const existing = await tx.store.get(key);
      if (!existing) {
        await tx.store.put({ ...record, key });
        migrated += 1;
      }
    })
  );
  await tx.done;
  return migrated;
}

function getDb(): Promise<IDBPDatabase<OwlInsightDb>> {
  dbPromise ??= openDB<OwlInsightDb>(indexedDbName, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("scoreRecords")) {
        const scoreRecords = db.createObjectStore("scoreRecords", { keyPath: "key" });
        scoreRecords.createIndex("by-academic-year", "academicYearKey");
        scoreRecords.createIndex("by-exam-type", "examType");
        scoreRecords.createIndex("by-detail-type", "detailType");
      }

      if (!db.objectStoreNames.contains("analysisPlans")) {
        const analysisPlans = db.createObjectStore("analysisPlans", { keyPath: "id" });
        analysisPlans.createIndex("by-updated-at", "updatedAt");
      }

      if (!db.objectStoreNames.contains("analysisTemplates")) {
        const analysisTemplates = db.createObjectStore("analysisTemplates", { keyPath: "id" });
        analysisTemplates.createIndex("by-updated-at", "updatedAt");
      }

      if (!db.objectStoreNames.contains("examNotes")) {
        db.createObjectStore("examNotes", { keyPath: "examKey" });
      }
      if (!db.objectStoreNames.contains("analysisSettings")) {
        db.createObjectStore("analysisSettings", { keyPath: "key" });
      }
    }
  });
  return dbPromise;
}

function estimateBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

function mergeScoreRecordMetadata(existing: CachedScoreRecord | undefined, next: CachedScoreRecord): CachedScoreRecord {
  return {
    ...existing,
    ...next,
    examType: isUsefulExamType(next.examType) ? next.examType : existing?.examType,
    examName: next.examName ?? existing?.examName,
    examCreateDateTime: next.examCreateDateTime ?? existing?.examCreateDateTime,
    academicYear: next.academicYear ?? existing?.academicYear ?? null,
    academicYearKey: next.academicYearKey ?? existing?.academicYearKey,
    academicYearName: next.academicYearName ?? existing?.academicYearName
  };
}

function normalizeScoreRecordForRead(record: CachedScoreRecord): CachedScoreRecord {
  return {
    ...record,
    examType: isUsefulExamType(record.examType) ? record.examType : undefined
  };
}

function isUsefulExamType(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value !== "cached" && value !== "unknown";
}

function getAcademicYearKey(year: AcademicYear | null): string {
  if (!year) return "unknown-year";
  return year.code ?? `${year.beginTime}-${year.endTime}-${year.name}`;
}

function readLegacyStore(): ScoreCacheStore {
  try {
    const raw = localStorage.getItem(scoreCacheStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? (parsed as ScoreCacheStore) : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

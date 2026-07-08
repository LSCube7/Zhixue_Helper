import { sortAnalysisRecords, sortByExamTimeDesc, type AnalysisExamRecord, type AnalysisSubjectRecord } from "./analysis";
import type { AnalysisInsightSettings, ExamClassificationCondition, ExamClassificationRule } from "./cache";

export type AnalysisAnomalyKind = "missingScore" | "scoreDrop" | "rankDrop";

export type AnalysisAnomaly = {
  id: string;
  kind: AnalysisAnomalyKind;
  examKey: string;
  examName: string;
  subjectName?: string;
  message: string;
  severity: "warning" | "critical";
};

export type AnalysisCategoryGroup = {
  id: string;
  label: string;
  records: AnalysisExamRecord[];
};

export type ClassificationExamLike = {
  examId: string;
  examName: string;
  examCreateDateTime: number | string;
  examType?: string;
  academicYearKey?: string;
  academicYearName?: string;
  cachedAt?: string;
};

export type RulePreview = {
  ruleId: string;
  ruleName: string;
  count: number;
  recentExams: ClassificationExamLike[];
  examTypes: string[];
  academicYears: string[];
};

export type ClassificationConflict = {
  examKey: string;
  examName: string;
  labels: string[];
};

export function classifyAnalysisRecords(records: AnalysisExamRecord[], rules: ExamClassificationRule[] = []): AnalysisCategoryGroup[] {
  const sorted = sortAnalysisRecords(records);
  const groups = rules.map((rule) => ({
    id: rule.id,
    label: rule.name,
    records: sorted.filter((record) => matchesClassificationRule(record, rule))
  }));
  const matchedKeys = new Set(groups.flatMap((group) => group.records.map(getExamKey)));
  const uncategorized = sorted.filter((record) => !matchedKeys.has(getExamKey(record)));

  return [
    { id: "all", label: "全部考试", records: sorted },
    ...groups.filter((group) => group.records.length > 0),
    ...(uncategorized.length > 0 ? [{ id: "uncategorized", label: "未分类", records: uncategorized }] : [])
  ];
}

export function getExamClassificationLabels(exam: ClassificationExamLike, rules: ExamClassificationRule[]): string[] {
  return rules
    .filter((rule) => matchesClassificationRule(toClassificationRecord(exam), rule))
    .map((rule) => rule.name.trim())
    .filter(Boolean);
}

export function buildClassificationOptions(exams: ClassificationExamLike[], rules: ExamClassificationRule[]): string[] {
  return Array.from(new Set(exams.flatMap((exam) => getExamClassificationLabels(exam, rules)))).sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN")
  );
}

export function buildRulePreview(
  exams: ClassificationExamLike[],
  cachedExams: ClassificationExamLike[],
  rules: ExamClassificationRule[]
): RulePreview[] {
  const allExams = dedupeClassificationExams([...exams, ...cachedExams]);
  return rules.map((rule) => {
    const matched = sortByExamTimeDesc(allExams.filter((exam) => matchesClassificationRule(toClassificationRecord(exam), rule)));
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      count: matched.length,
      recentExams: matched.slice(0, 5),
      examTypes: Array.from(new Set(matched.map((exam) => exam.examType).filter((value): value is string => Boolean(value)))).sort(),
      academicYears: Array.from(new Set(matched.map((exam) => exam.academicYearName).filter((value): value is string => Boolean(value)))).sort((left, right) =>
        left.localeCompare(right, "zh-Hans-CN")
      )
    };
  });
}

export function detectClassificationConflicts(exams: ClassificationExamLike[], rules: ExamClassificationRule[]): ClassificationConflict[] {
  return dedupeClassificationExams(exams)
    .map((exam) => ({
      examKey: getClassificationExamKey(exam),
      examName: exam.examName,
      labels: getExamClassificationLabels(exam, rules)
    }))
    .filter((item) => item.labels.length > 1);
}

export function matchesClassificationRule(record: AnalysisExamRecord, rule: ExamClassificationRule): boolean {
  const conditions = normalizeRuleConditions(rule);
  if (conditions.length > 0) {
    return conditions.reduce<boolean | null>((result, condition, index) => {
      const matched = matchesCondition(record, condition);
      if (index === 0 || result === null) return matched;
      return condition.conjunction === "or" ? result || matched : result && matched;
    }, null) ?? false;
  }

  const nameMatched = !rule.nameIncludes?.trim() || record.examName.includes(rule.nameIncludes.trim());
  const typeMatched = !rule.examType?.trim() || record.examType === rule.examType.trim();
  const recordTime = new Date(record.examCreateDateTime).getTime();
  const fromTime = rule.dateFrom ? new Date(`${rule.dateFrom}T00:00:00`).getTime() : null;
  const toTime = rule.dateTo ? new Date(`${rule.dateTo}T23:59:59`).getTime() : null;
  const dateMatched =
    Number.isNaN(recordTime) ||
    ((fromTime === null || Number.isNaN(fromTime) || recordTime >= fromTime) &&
      (toTime === null || Number.isNaN(toTime) || recordTime <= toTime));
  return nameMatched && typeMatched && dateMatched;
}

function normalizeRuleConditions(rule: ExamClassificationRule): ExamClassificationCondition[] {
  if (rule.conditions?.length) return rule.conditions.filter((condition) => condition.value.trim());
  const conditions: ExamClassificationCondition[] = [];
  if (rule.nameIncludes?.trim()) {
    conditions.push({ id: `${rule.id}:name`, field: "examName", operator: "contains", value: rule.nameIncludes, conjunction: "and" });
  }
  if (rule.examType?.trim()) {
    conditions.push({ id: `${rule.id}:type`, field: "examType", operator: "equals", value: rule.examType, conjunction: "and" });
  }
  if (rule.dateFrom?.trim()) {
    conditions.push({ id: `${rule.id}:from`, field: "examDate", operator: "after", value: rule.dateFrom, conjunction: "and" });
  }
  if (rule.dateTo?.trim()) {
    conditions.push({ id: `${rule.id}:to`, field: "examDate", operator: "before", value: rule.dateTo, conjunction: "and" });
  }
  return conditions;
}

function matchesCondition(record: AnalysisExamRecord, condition: ExamClassificationCondition): boolean {
  const value = condition.value.trim();
  if (!value) return true;

  if (condition.field === "examName") {
    if (condition.operator === "equals") return record.examName === value;
    if (condition.operator === "notContains") return !record.examName.includes(value);
    return record.examName.includes(value);
  }

  if (condition.field === "examType") {
    const examType = record.examType ?? "";
    if (condition.operator === "equals") return examType === value;
    if (condition.operator === "notContains") return !examType.includes(value);
    return examType.includes(value);
  }

  const recordTime = new Date(record.examCreateDateTime).getTime();
  const valueTime = new Date(`${value}T${condition.operator === "before" ? "23:59:59" : "00:00:00"}`).getTime();
  if (Number.isNaN(recordTime) || Number.isNaN(valueTime)) return false;
  if (condition.operator === "before") return recordTime <= valueTime;
  if (condition.operator === "after") return recordTime >= valueTime;
  return new Date(record.examCreateDateTime).toISOString().slice(0, 10) === value;
}

function toClassificationRecord(exam: ClassificationExamLike): AnalysisExamRecord {
  return {
    examId: exam.examId,
    examName: exam.examName,
    examCreateDateTime: exam.examCreateDateTime,
    examType: exam.examType,
    academicYearKey: exam.academicYearKey,
    academicYearName: exam.academicYearName,
    totalScore: null,
    standardScore: null,
    percentage: null,
    subjects: []
  };
}

function dedupeClassificationExams(exams: ClassificationExamLike[]): ClassificationExamLike[] {
  const map = new Map<string, ClassificationExamLike>();
  exams.forEach((exam) => {
    const key = getClassificationExamKey(exam);
    if (!map.has(key)) map.set(key, exam);
  });
  return Array.from(map.values());
}

function getClassificationExamKey(exam: ClassificationExamLike): string {
  return `${exam.academicYearKey ?? ""}::${exam.examId}`;
}

export function detectAnalysisAnomalies(records: AnalysisExamRecord[], settings: AnalysisInsightSettings): AnalysisAnomaly[] {
  const sorted = sortAnalysisRecords(records);
  const anomalies: AnalysisAnomaly[] = [];

  sorted.forEach((record) => {
    const examKey = getExamKey(record);
    if (record.totalScore === null || record.percentage === null) {
      anomalies.push({
        id: `${examKey}:missing-total`,
        kind: "missingScore",
        examKey,
        examName: record.examName,
        message: `${record.examName} 缺少有效总分`,
        severity: "critical"
      });
    }

    record.subjects.forEach((subject) => {
      if (!Number.isFinite(subject.score) || !Number.isFinite(subject.standardScore) || subject.standardScore <= 0) {
        anomalies.push({
          id: `${examKey}:${subject.paperId}:missing`,
          kind: "missingScore",
          examKey,
          examName: record.examName,
          subjectName: subject.subjectName,
          message: `${record.examName} ${subject.subjectName} 缺少有效成绩`,
          severity: "critical"
        });
      }
    });
  });

  const previousBySubject = new Map<string, AnalysisSubjectRecord>();
  let previousTotal: AnalysisExamRecord | null = null;

  sorted.forEach((record) => {
    if (previousTotal && previousTotal.percentage !== null && record.percentage !== null) {
      const drop = previousTotal.percentage - record.percentage;
      if (drop >= settings.scoreDropThreshold) {
        anomalies.push({
          id: `${getExamKey(record)}:total-score-drop`,
          kind: "scoreDrop",
          examKey: getExamKey(record),
          examName: record.examName,
          message: `总分得分率较上一场下降 ${round(drop)} 分`,
          severity: drop >= settings.scoreDropThreshold * 1.5 ? "critical" : "warning"
        });
      }
    }

    const previousRank = typeof previousTotal?.classRank?.rank === "number" ? previousTotal.classRank.rank : null;
    const currentRank = typeof record.classRank?.rank === "number" ? record.classRank.rank : null;
    if (previousRank !== null && currentRank !== null) {
      const rankDrop = currentRank - previousRank;
      if (rankDrop >= settings.rankDropThreshold) {
        anomalies.push({
          id: `${getExamKey(record)}:total-rank-drop`,
          kind: "rankDrop",
          examKey: getExamKey(record),
          examName: record.examName,
          message: `总分班级排名较上一场退步 ${rankDrop} 名`,
          severity: rankDrop >= settings.rankDropThreshold * 1.5 ? "critical" : "warning"
        });
      }
    }

    if (record.percentage !== null) previousTotal = record;

    record.subjects.forEach((subject) => {
      const previous = previousBySubject.get(subject.subjectName);
      if (previous) {
        const drop = previous.percentage - subject.percentage;
        if (drop >= settings.scoreDropThreshold) {
          anomalies.push({
            id: `${getExamKey(record)}:${subject.paperId}:score-drop`,
            kind: "scoreDrop",
            examKey: getExamKey(record),
            examName: record.examName,
            subjectName: subject.subjectName,
            message: `${subject.subjectName} 得分率较上一场下降 ${round(drop)} 分`,
            severity: drop >= settings.scoreDropThreshold * 1.5 ? "critical" : "warning"
          });
        }

        const previousSubjectRank = typeof previous.classRank?.rank === "number" ? previous.classRank.rank : null;
        const currentSubjectRank = typeof subject.classRank?.rank === "number" ? subject.classRank.rank : null;
        if (previousSubjectRank !== null && currentSubjectRank !== null) {
          const rankDrop = currentSubjectRank - previousSubjectRank;
          if (rankDrop >= settings.rankDropThreshold) {
            anomalies.push({
              id: `${getExamKey(record)}:${subject.paperId}:rank-drop`,
              kind: "rankDrop",
              examKey: getExamKey(record),
              examName: record.examName,
              subjectName: subject.subjectName,
              message: `${subject.subjectName} 班级排名较上一场退步 ${rankDrop} 名`,
              severity: rankDrop >= settings.rankDropThreshold * 1.5 ? "critical" : "warning"
            });
          }
        }
      }
      previousBySubject.set(subject.subjectName, subject);
    });
  });

  return anomalies;
}

function getExamKey(record: AnalysisExamRecord): string {
  return `${record.academicYearKey ?? ""}::${record.examId}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

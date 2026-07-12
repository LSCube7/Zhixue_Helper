import type { AnalysisPlan, AnalysisTemplate, ExamClassificationRule } from "../shared/cache";
import type { AcademicYear, ExamDetailPayload, HomeworkListPayload, SubjectLevelTrendPayload } from "../shared/protocol";
import type {
  ConnectionProfile,
  ExamItem,
  HomeworkItem,
  HomeworkListPage,
  HomeworkResource,
  HomeworkSubject,
  LevelInfo,
  LevelTrendResponse,
  ReportMainResponse
} from "../shared/types";

export type DemoExamItem = ExamItem & {
  academicYear: AcademicYear;
  academicYearKey: string;
  academicYearName: string;
};

type DemoExamDataset = {
  exam: DemoExamItem;
  reportMain: ReportMainResponse;
  totalTrend: LevelTrendResponse;
  subjectTrends: Record<string, LevelTrendResponse>;
};

const classSize = 45;
const levelList: LevelInfo[] = [{ name: "A", lowBound: 0, upperBound: 100 }];
const subjectDefinitions = [
  { key: "chinese", name: "语文", standardScore: 150 },
  { key: "math", name: "数学", standardScore: 150 },
  { key: "english", name: "英语", standardScore: 150 },
  { key: "physics", name: "物理", standardScore: 100 },
  { key: "chemistry", name: "化学", standardScore: 100 },
  { key: "biology", name: "生物", standardScore: 100 }
] as const;

export const demoProfile: ConnectionProfile = {
  id: "demo-student-001",
  code: "DEMO-2026-001",
  loginName: "demo.student",
  name: "林晓（演示）",
  school: { id: "demo-school-001", name: "星河中学（演示学校）" },
  grade: { code: "demo-grade-11", name: "高二（演示）" },
  class: { id: "demo-class-03", name: "3 班（演示）" }
};

export const demoAcademicYears: AcademicYear[] = [
  { code: "demo-2025", name: "2025–2026 学年（演示）", beginTime: "2025-09-01", endTime: "2026-07-15" },
  { code: "demo-2024", name: "2024–2025 学年（演示）", beginTime: "2024-09-01", endTime: "2025-07-15" }
];

const rawExams = [
  ["demo-exam-01", "高一上学期开学摸底", "2024-09-10", "week", [103, 118, 128, 64, 80, 75], 22, [21, 24, 18, 27, 22, 25]],
  ["demo-exam-02", "高一上学期第一次月考", "2024-10-16", "month", [105, 124, 130, 71, 86, 81], 17, [18, 18, 15, 19, 16, 18]],
  ["demo-exam-03", "高一上学期期中考试", "2024-11-18", "midterm", [104, 129, 132, 76, 90, 84], 13, [19, 13, 12, 14, 11, 14]],
  ["demo-exam-04", "高一上学期期末考试", "2025-01-12", "final", [107, 121, 129, 67, 83, 77], 20, [16, 21, 16, 24, 20, 22]],
  ["demo-exam-05", "高一下学期开学检测", "2025-02-24", "week", [102, 132, 127, 79, 92, 88], 11, [22, 10, 19, 10, 8, 9]],
  ["demo-exam-06", "高一下学期第一次月考", "2025-03-25", "month", [105, 123, 131, 68, 84, 79], 18, [18, 19, 14, 22, 18, 20]],
  ["demo-exam-07", "高一下学期期中考试", "2025-05-09", "midterm", [106, 128, 131, 72, 86, 80], 12, [14, 10, 12, 13, 11, 13]],
  ["demo-exam-08", "高一下学期期末考试", "2025-07-02", "final", [108, 134, 133, 78, 91, 85], 7, [11, 6, 9, 7, 6, 8]],
  ["demo-exam-09", "高二上学期第一次月考", "2025-09-26", "month", [104, 121, 129, 65, 82, 76], 16, [16, 18, 13, 20, 17, 18]],
  ["demo-exam-10", "高二上学期期中考试", "2025-11-14", "midterm", [106, 130, 132, 75, 90, 83], 8, [13, 8, 10, 10, 8, 11]],
  ["demo-exam-11", "高二上学期阶段检测", "2025-12-19", "week", [102, 118, 127, 62, 79, 72], 19, [18, 21, 14, 23, 20, 22]],
  ["demo-exam-12", "高二上学期期末考试", "2026-01-23", "final", [105, 126, 130, 70, 86, 80], 10, [15, 11, 12, 14, 12, 13]]
] as const;

const demoDatasets: DemoExamDataset[] = rawExams.map((raw, index) => {
  const [examId, examName, date, examType, scores, totalRank, subjectRanks] = raw;
  const academicYear = index < 8 ? demoAcademicYears[1] : demoAcademicYears[0];
  const academicYearKey = academicYear.code ?? `demo-year-${index < 8 ? "2024" : "2025"}`;
  const papers = subjectDefinitions.map((subject, subjectIndex) => ({
    paperId: `demo-paper-${examId}-${subject.key}`,
    subjectName: subject.name,
    userScore: scores[subjectIndex],
    standardScore: subject.standardScore,
    userLevel: subjectRanks[subjectIndex] <= 10 ? "A" : subjectRanks[subjectIndex] <= 20 ? "B" : "C",
    tag: { code: subject.key, name: subject.name }
  }));
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const exam: DemoExamItem = {
    examId,
    examName: `${examName}（演示）`,
    examCreateDateTime: `${date}T08:00:00+08:00`,
    examType,
    isFinal: examType === "final",
    academicYear,
    academicYearKey,
    academicYearName: academicYear.name
  };

  return {
    exam,
    reportMain: {
      result: {
        totalScore: { userScore: totalScore, standardScore: 750, userLevel: totalRank <= 10 ? "A" : totalRank <= 20 ? "B" : "C" },
        paperList: papers
      }
    },
    totalTrend: buildRankTrend("demo-paper-total", "总分", totalRank),
    subjectTrends: Object.fromEntries(papers.map((paper, subjectIndex) => [
      paper.paperId,
      buildRankTrend(paper.paperId, paper.subjectName, subjectRanks[subjectIndex])
    ]))
  };
});

export const demoExams = demoDatasets.map(({ exam }) => exam);
export const demoInitialExamIds = demoExams.slice(-6).map(({ examId }) => examId);

export const demoClassificationRules: ExamClassificationRule[] = [
  { id: "demo-rule-month", name: "月考", conditions: [{ id: "demo-condition-month", field: "examType", operator: "equals", value: "month", conjunction: "and" }] },
  { id: "demo-rule-midterm", name: "期中", conditions: [{ id: "demo-condition-midterm", field: "examType", operator: "equals", value: "midterm", conjunction: "and" }] },
  { id: "demo-rule-final", name: "期末", conditions: [{ id: "demo-condition-final", field: "examType", operator: "equals", value: "final", conjunction: "and" }] }
];

const now = "2026-01-24T08:00:00.000Z";
export const demoAnalysisPlans: AnalysisPlan[] = [{
  id: "demo-plan-growth",
  name: "高一至高二成长趋势（演示）",
  createdAt: now,
  updatedAt: now,
  selectedExamKeys: demoInitialExamIds.map((examId) => `${demoExams.find((exam) => exam.examId === examId)?.academicYearKey ?? "demo"}::${examId}`),
  selectedCachedExamKeys: [],
  selectedClassificationLabels: [],
  visibleSubjectNames: subjectDefinitions.map(({ name }) => name),
  metric: "percentage",
  target: { metric: "percentage", total: 82, subjects: {} },
  insightSettings: { scoreDropThreshold: 5, rankDropThreshold: 5, classificationRules: demoClassificationRules },
  note: "演示方案：观察整体提升和阶段检测中的一次回落。"
}];

export const demoAnalysisTemplates: AnalysisTemplate[] = [{
  id: "demo-template-final",
  name: "期末考试对比（演示）",
  createdAt: now,
  updatedAt: now,
  selectedExamTypes: ["final"],
  selectedClassificationLabels: ["期末"],
  visibleSubjectNames: subjectDefinitions.map(({ name }) => name),
  metric: "percentage",
  target: { metric: "percentage", total: 82, subjects: {} },
  insightSettings: { scoreDropThreshold: 5, rankDropThreshold: 5, classificationRules: demoClassificationRules }
}];

export const demoHomeworkSubjects: HomeworkSubject[] = [
  ...subjectDefinitions.slice(0, 5).map((subject) => ({ code: `demo-${subject.key}`, name: subject.name }))
];

const demoHomeworkItems: HomeworkItem[] = [
  buildHomework("demo-homework-01", "函数与导数巩固练习（演示）", "demo-math", "数学", 0, "题库作业", true, 1),
  buildHomework("demo-homework-02", "英语阅读理解专项（演示）", "demo-english", "英语", 0, "自由出题", false, 2),
  buildHomework("demo-homework-03", "电场基础复习（演示）", "demo-physics", "物理", 0, "题库作业", true, 3),
  buildHomework("demo-homework-04", "古诗文背诵检测（演示）", "demo-chinese", "语文", 1, "习惯练习", false, 4),
  buildHomework("demo-homework-05", "化学反应原理小测（演示）", "demo-chemistry", "化学", 1, "题库作业", true, 5),
  buildHomework("demo-homework-06", "期末错题整理（演示）", "demo-math", "数学", 1, "自由出题", false, 6)
];

export function getDemoExamDetail<TData>(payload: ExamDetailPayload): Promise<TData> {
  const dataset = requireDemoDataset(payload.examId);
  if (payload.examDetailType === "getReportMain") return Promise.resolve(dataset.reportMain as TData);
  if (payload.examDetailType === "getLevelTrend") return Promise.resolve(dataset.totalTrend as TData);
  return Promise.reject(new Error(`演示考试不支持详情类型：${payload.examDetailType}`));
}

export function getDemoSubjectLevelTrend<TData>(payload: SubjectLevelTrendPayload): Promise<TData> {
  const trend = requireDemoDataset(payload.examId).subjectTrends[payload.paperId];
  return trend ? Promise.resolve(trend as TData) : Promise.reject(new Error("未找到演示科目趋势"));
}

export function getDemoHomeworkList(payload: HomeworkListPayload): Promise<HomeworkListPage> {
  const filtered = demoHomeworkItems.filter((item) => item.status === payload.status)
    .filter((item) => payload.subjectCode === "-1" || item.subjectCode === payload.subjectCode);
  return Promise.resolve({ items: filtered.slice(0, payload.pageSize), hasMore: false, nextCreateTime: null });
}

export function getDemoHomeworkResources(homework: HomeworkItem): Promise<HomeworkResource[]> {
  return Promise.resolve([
    {
      id: `demo-resource-${homework.id}-guide`,
      name: "演示-学习说明.txt",
      category: "说明",
      text: `这是 Owl Insight 演示模式生成的虚拟资源。\n\n作业：${homework.title}\n科目：${homework.subjectName}\n\n该文件不包含任何真实学生信息或智学网内容。`
    },
    {
      id: `demo-resource-${homework.id}-preview`,
      name: "演示-题目预览.svg",
      category: "题目",
      url: chrome.runtime.getURL("demo/homework-preview.svg")
    },
    {
      id: `demo-resource-${homework.id}-answer`,
      name: "演示-参考记录.txt",
      category: "答案",
      text: "演示内容：本文件仅用于展示资源预览和下载流程，不对应任何真实题目。"
    }
  ]);
}

function buildRankTrend(paperId: string, subjectName: string, rank: number): LevelTrendResponse {
  const offset = 100 - (rank / classSize) * 100;
  return {
    result: {
      statTotalNum: classSize,
      levelList,
      list: [{
        paperId,
        subjectName,
        title: subjectName,
        tag: { code: paperId === "demo-paper-total" ? "total" : paperId, name: subjectName },
        improveBar: { levelScale: "A", offset },
        levelList,
        statTotalNum: classSize
      }]
    }
  };
}

function buildHomework(
  id: string,
  title: string,
  subjectCode: string,
  subjectName: string,
  status: 0 | 1,
  typeName: string,
  allowMakeup: boolean,
  dayOffset: number
): HomeworkItem {
  const beginTime = Date.UTC(2026, 0, 10 + dayOffset, 8);
  return {
    id,
    studentHomeworkId: `demo-student-${id}`,
    classId: "demo-class-03",
    title,
    subjectCode,
    subjectName,
    typeCode: dayOffset,
    typeName,
    beginTime,
    endTime: beginTime + 3 * 24 * 60 * 60 * 1000,
    createTime: beginTime,
    status,
    allowMakeup
  };
}

function requireDemoDataset(examId: string): DemoExamDataset {
  const dataset = demoDatasets.find(({ exam }) => exam.examId === examId);
  if (!dataset) throw new Error(`未找到演示考试：${examId}`);
  return dataset;
}

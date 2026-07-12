export type ApiResponse<T = unknown> = {
  result?: T;
  [key: string]: unknown;
};

export type ConnectionProfile = {
  id: string;
  code?: string;
  loginName: string;
  name: string;
  avatar?: string;
  school: {
    id?: string;
    name: string;
  };
  grade?: {
    code?: string;
    name: string;
  };
  class: {
    id?: string;
    name: string;
  };
};

export type HomeworkStatus = 0 | 1;

export type HomeworkSubject = {
  code: string;
  name: string;
};

export type HomeworkItem = {
  id: string;
  studentHomeworkId: string;
  classId?: string;
  title: string;
  subjectCode: string;
  subjectName: string;
  typeCode: number;
  typeName: string;
  beginTime: number;
  endTime: number;
  createTime: number;
  status: HomeworkStatus;
  allowMakeup: boolean;
};

export type HomeworkListPage = {
  items: HomeworkItem[];
  hasMore: boolean;
  nextCreateTime: number | null;
};

export type HomeworkResourceCategory = "题目" | "答案" | "提交" | "说明";

export type HomeworkResource = {
  id: string;
  name: string;
  category: HomeworkResourceCategory;
  url?: string;
  text?: string;
};

export type AcademicYearListResponse = ApiResponse<AcademicYearItem[]>;

export type AcademicYearItem = {
  code?: string;
  name: string;
  beginTime: number | string;
  endTime: number | string;
  startTime?: number;
};

export type ExamListResponse = ApiResponse<{
  examList?: ExamItem[];
  hasNextPage?: boolean;
}>;

export type ExamItem = {
  examId: string;
  examName: string;
  examCreateDateTime: number | string;
  examType: string;
  isFinal?: boolean;
};

export type ReportMainResponse = ApiResponse<{
  totalScore?: TotalScore;
  paperList?: PaperScore[];
}>;

export type TotalScore = {
  userScore: number | string;
  standardScore: number | string;
  userLevel?: string;
};

export type PaperScore = {
  paperId: string;
  subjectName: string;
  userScore: number;
  standardScore: number;
  userLevel?: string;
  tag?: {
    code?: string | number;
    name?: string;
  };
};

export type LevelTrendResponse = ApiResponse<{
  list?: LevelTrendItem[];
  levelList?: LevelInfo[];
  statTotalNum?: number;
}>;

export type LevelTrendItem = {
  paperId?: string;
  subjectName?: string;
  title?: string;
  tag?: {
    code?: string;
    name?: string;
  };
  improveBar?: {
    levelScale?: string;
    offset?: number;
  };
  levelList?: LevelInfo[];
  statTotalNum?: number;
};

export type LevelInfo = {
  name: string;
  lowBound: number;
  upperBound: number;
};

export type RankInfo = {
  level?: string;
  rank: number | "未知";
  total?: number;
  paperId?: string;
};

export type ExamDetailViewModel = {
  examId: string;
  examName: string;
  examCreateDateTime?: number | string;
  examType?: string;
  academicYearName?: string;
  academicYearKey?: string;
  reportMain: ReportMainResponse;
  levelTrend: LevelTrendResponse | null;
  subjectLevelTrend: Record<string, LevelTrendResponse>;
};

export type ApiResponse<T = unknown> = {
  result?: T;
  [key: string]: unknown;
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

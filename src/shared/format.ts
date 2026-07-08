const examTypeMap: Record<string, string> = {
  terminalExam: "期末考试",
  midtermExam: "期中考试",
  monthlyExam: "月考",
  weeklyExam: "周练",
  dailyExam: "日练"
};

export function formatDate(value: number | string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function getExamTypeName(examType: string): string {
  return examTypeMap[examType] ?? examType;
}

export function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

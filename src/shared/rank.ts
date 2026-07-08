import type { LevelTrendResponse, RankInfo } from "./types";

export function getClassRankInfo(levelTrend: LevelTrendResponse | null): RankInfo | null {
  const list = levelTrend?.result?.list;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  const totalData =
    list.find((item) => item.tag?.code === "total" || item.tag?.name === "总分") ??
    list.find((item) => item.subjectName === "总分" || item.title === "全科" || item.title === "总分") ??
    list.find((item) => !item.subjectName) ??
    list[0];

  if (!totalData?.improveBar || !totalData.levelList) {
    return null;
  }

  return calculateRank(
    totalData.improveBar.levelScale,
    totalData.improveBar.offset,
    totalData.statTotalNum,
    totalData.levelList
  );
}

export function getSubjectClassRankInfo(
  paperId: string,
  subjectLevelTrend: Record<string, LevelTrendResponse>
): RankInfo | null {
  const subjectData = subjectLevelTrend[paperId];
  const list = subjectData?.result?.list;
  if (!subjectData?.result || !Array.isArray(list) || list.length === 0) {
    return null;
  }

  const currentSubjectData =
    list.find((item) => item.paperId === paperId) ??
    (list.length === 1 ? list[0] : undefined) ??
    list[0];

  const levelList = currentSubjectData.levelList ?? subjectData.result.levelList;

  if (!currentSubjectData.improveBar || !levelList) {
    return null;
  }

  const rankInfo = calculateRank(
    currentSubjectData.improveBar.levelScale,
    currentSubjectData.improveBar.offset,
    currentSubjectData.statTotalNum ?? subjectData.result.statTotalNum,
    levelList
  );

  return rankInfo ? { ...rankInfo, paperId } : null;
}

function calculateRank(
  level: string | undefined,
  offset: number | undefined,
  totalNum: number | undefined,
  levelList: Array<{ name: string; lowBound: number; upperBound: number }>
): RankInfo | null {
  if (!level || typeof offset !== "number" || typeof totalNum !== "number" || totalNum <= 0) {
    return null;
  }

  const levelInfo = levelList.find((item) => item.name === level);
  if (!levelInfo) {
    return { level, rank: "未知", total: totalNum };
  }

  const rankFloat =
    (totalNum *
      (levelInfo.lowBound + (1 - offset / 100) * (levelInfo.upperBound - levelInfo.lowBound))) /
    100;

  const rawRank = Math.ceil(rankFloat);
  const rank = Math.min(Math.max(rawRank, 1), Math.max(totalNum, 1));

  return {
    level,
    rank,
    total: totalNum
  };
}

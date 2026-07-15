import "@fontsource-variable/material-symbols-rounded/fill.css";
import "./material-web";

import { CorePalette, Hct, argbFromHex, hexFromArgb } from "@material/material-color-utilities";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  demoAcademicYears,
  demoAnalysisPlans,
  demoAnalysisTemplates,
  demoClassificationRules,
  demoExams,
  demoHomeworkSubjects,
  demoInitialExamIds,
  demoProfile,
  getDemoExamDetail,
  getDemoHomeworkList,
  getDemoHomeworkResources,
  getDemoSubjectLevelTrend
} from "../demo/data";

import {
  buildAnalysisLabels,
  buildSubjectSeries,
  buildTotalScoreSeries,
  summarizeAnalysis,
  sortByExamTimeAsc,
  sortByExamTimeDesc,
  type AnalysisExamRecord,
  type AnalysisSubjectRecord,
  type SubjectTrendPoint
} from "../shared/analysis";
import {
  buildAnalysisRecordsFromSources,
  buildMetricSeries,
  buildSubjectMetricSeries,
  type AnalysisMetric,
  type MetricPoint
} from "../shared/analysis-pipeline";
import {
  defaultAnalysisInsightSettings,
  deleteAnalysisTemplate,
  deleteAnalysisPlan,
  deleteScoreCacheRecords,
  exportLocalData,
  buildScoreCacheKey,
  getCacheStats,
  getCachedExamIdentity,
  listCachedReportMainRecords,
  listAnalysisPlans,
  listAnalysisTemplates,
  listExamNotes,
  listScoreCacheRecords,
  migrateLocalStorageScoreCacheToIndexedDb,
  readAnalysisInsightSettings,
  readScoreCache,
  saveAnalysisTemplate,
  saveAnalysisPlan,
  updateScoreCacheMetadataForExam,
  updateScoreCacheMetadata,
  writeAnalysisInsightSettings,
  writeExamNote,
  writeScoreCache,
  type AnalysisInsightSettings,
  type AnalysisPlan,
  type AnalysisTemplate,
  type AnalysisTarget,
  type CacheStats,
  type ExamClassificationCondition,
  type ExamClassificationRule,
  type ExamNote,
  type CachedScoreRecord
} from "../shared/cache";
import {
  buildClassificationOptions,
  buildRulePreview,
  detectAnalysisAnomalies,
  detectClassificationConflicts,
  classifyAnalysisRecords,
  getExamClassificationLabels,
  type AnalysisAnomaly,
  type ClassificationConflict,
  type RulePreview
} from "../shared/analysis-insights";
import { formatDate, getExamTypeName } from "../shared/format";
import {
  OWL_BACKGROUND_HEALTH_CHANNEL,
  type AcademicYear,
  type BackgroundHealthResponse,
  type ExamDetailPayload,
  type ExamListPayload,
  type ExtensionRequest,
  type ExtensionResponse,
  type HomeworkListPayload,
  type HomeworkResourcesPayload,
  type SubjectLevelTrendPayload
} from "../shared/protocol";
import { getClassRankInfo, getSubjectClassRankInfo } from "../shared/rank";
import { computeTotalFromSubjects } from "../shared/score";
import type {
  AcademicYearListResponse,
  ConnectionProfile,
  ExamDetailViewModel,
  ExamItem,
  ExamListResponse,
  LevelTrendResponse,
  HomeworkListPage,
  HomeworkResource,
  HomeworkSubject,
  PaperScore,
  ReportMainResponse
} from "../shared/types";
import { MaterialIcon } from "./icons";
import { ConnectionView } from "./connection";
import { HomeworkView } from "./homework";
import { applyStoredTheme, applyTheme } from "./theme";
import {
  customThemePresetId,
  defaultSettings,
  defaultThemeSeed,
  inferThemePreset,
  isValidHexColor,
  normalizeHexColor,
  prideThemeFlags,
  readSettings,
  resolveThemeSeed,
  themePresets,
  writeSettings,
  type OwlSettings
} from "./theme-presets";
import "./styles.css";

type LoadingState =
  | { kind: "idle" }
  | { kind: "loading"; message: string; current?: number; total?: number }
  | { kind: "error"; message: string };

type ExamViewMode = "ready" | "selectYear" | "examList" | "examDetail";
type MainView = "connection" | "exams" | "analysis" | "homework" | "subject" | "settings" | "rules" | "changelog";
type RuntimeMode = "live" | "demo";
const SNACKBAR_DURATION_MS = 6000;

type ExamListItem = ExamItem & {
  academicYear: AcademicYear;
  academicYearKey: string;
  academicYearName: string;
};

type CacheHealth = {
  missingRank: CachedScoreRecord<ReportMainResponse>[];
  missingSubjectTrend: CachedScoreRecord<ReportMainResponse>[];
  missingMetadata: CachedScoreRecord<ReportMainResponse>[];
};

type AnalysisState = {
  records: AnalysisExamRecord[];
  failedCount: number;
  generatedAt: string | null;
};

type SubjectDetailState = {
  subject: AnalysisSubjectRecord;
  trend: SubjectTrendPoint[];
  sourceView: "analysis" | "exams";
  returnScrollTop?: number;
  rankLabel?: string;
} | null;

const examsPerPage = 10;

function App() {
  const appMainRef = useRef<HTMLElement | null>(null);
  const runtimeModeRef = useRef<RuntimeMode>("live");
  const selectedTabIdRef = useRef<number | null>(null);
  const connectedTabIdRef = useRef<number | null>(null);
  const connectingTabIdRef = useRef<number | null>(null);
  const connectionAttemptRef = useRef(0);
  const [settings, setSettings] = useState<OwlSettings>(() => applyStoredTheme());
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("live");
  const [mainView, setMainView] = useState<MainView>("connection");
  const [examViewMode, setExamViewMode] = useState<ExamViewMode>("ready");
  const [connectionStatus, setConnectionStatus] = useState("正在检查智学网页面...");
  const [availableTabs, setAvailableTabs] = useState<chrome.tabs.Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);
  const [connectionProfile, setConnectionProfile] = useState<ConnectionProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYears, setSelectedAcademicYears] = useState<AcademicYear[]>([]);
  const [allExamItems, setAllExamItems] = useState<ExamListItem[]>([]);
  const [selectedExamTypes, setSelectedExamTypes] = useState<Set<string>>(() => new Set());
  const [selectedClassificationLabels, setSelectedClassificationLabels] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedExamDetail, setSelectedExamDetail] = useState<ExamDetailViewModel | null>(null);
  const [examDetailReturnView, setExamDetailReturnView] = useState<"exams" | "analysis">("exams");
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(() => new Set());
  const [selectedExamMap, setSelectedExamMap] = useState<Record<string, ExamListItem>>({});
  const [selectedCachedExamKeys, setSelectedCachedExamKeys] = useState<Set<string>>(() => new Set());
  const [cacheRefreshToken, setCacheRefreshToken] = useState(0);
  const [cachedReportMainRecords, setCachedReportMainRecords] = useState<CachedScoreRecord<ReportMainResponse>[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [analysisPlans, setAnalysisPlans] = useState<AnalysisPlan[]>([]);
  const [analysisTemplates, setAnalysisTemplates] = useState<AnalysisTemplate[]>([]);
  const [selectedAnalysisTemplateId, setSelectedAnalysisTemplateId] = useState<string | null>(null);
  const [cacheHealth, setCacheHealth] = useState<CacheHealth>({ missingRank: [], missingSubjectTrend: [], missingMetadata: [] });
  const [examNotes, setExamNotes] = useState<Record<string, string>>({});
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisInsightSettings>(defaultAnalysisInsightSettings);
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget>({ metric: "percentage", total: null, subjects: {} });
  const [analysisNote, setAnalysisNote] = useState("");
  const [activeAnalysisPlanId, setActiveAnalysisPlanId] = useState<string | null>(null);
  const [selectedAnalysisPlanIds, setSelectedAnalysisPlanIds] = useState<Set<string>>(() => new Set());
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ records: [], failedCount: 0, generatedAt: null });
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<SubjectDetailState>(null);
  const [analysisMetric, setAnalysisMetric] = useState<AnalysisMetric>("percentage");
  const [visibleSubjectNames, setVisibleSubjectNames] = useState<Set<string>>(() => new Set());
  const [statusMessage, setStatusMessage] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState>({ kind: "idle" });

  const connectionReady = Boolean(connectionProfile && selectedTabId);
  const workspaceReady = runtimeMode === "demo" || connectionReady;
  const selectedExamCount = selectedExamIds.size + selectedCachedExamKeys.size;
  const visibleAnalysisRecords = useMemo(() => sortByExamTimeAsc(analysisState.records), [analysisState.records]);
  const analysisGroups = useMemo(
    () => classifyAnalysisRecords(visibleAnalysisRecords, analysisSettings.classificationRules ?? []),
    [visibleAnalysisRecords, analysisSettings.classificationRules]
  );
  const analysisAnomalies = useMemo(
    () => detectAnalysisAnomalies(visibleAnalysisRecords, analysisSettings),
    [visibleAnalysisRecords, analysisSettings]
  );
  const examTypeOptions = useMemo(() => {
    const types = Array.from(new Set(allExamItems.map((exam) => exam.examType).filter(Boolean)));
    return types.sort((left, right) => getExamTypeName(left).localeCompare(getExamTypeName(right), "zh-Hans-CN"));
  }, [allExamItems]);
  const cachedExamItems = useMemo(() => cachedReportMainRecords.map(cachedRecordToExamItem), [cachedReportMainRecords]);
  const classificationOptions = useMemo(
    () => buildClassificationOptions([...allExamItems, ...cachedExamItems], analysisSettings.classificationRules ?? []),
    [allExamItems, cachedExamItems, analysisSettings.classificationRules]
  );
  const filteredExamItems = useMemo(() => {
    return allExamItems.filter((exam) => {
      const typeMatched = selectedExamTypes.size === 0 || selectedExamTypes.has(exam.examType);
      const labels = getExamClassificationLabels(exam, analysisSettings.classificationRules ?? []);
      const labelMatched = selectedClassificationLabels.size === 0 || labels.some((label) => selectedClassificationLabels.has(label));
      return typeMatched && labelMatched;
    });
  }, [allExamItems, selectedExamTypes, selectedClassificationLabels, analysisSettings.classificationRules]);
  const pageCount = Math.max(1, Math.ceil(filteredExamItems.length / examsPerPage));
  const visibleExamItems = filteredExamItems.slice((currentPage - 1) * examsPerPage, currentPage * examsPerPage);

  const selectedTab = useMemo(
    () => availableTabs.find((tab) => tab.id === selectedTabId) ?? null,
    [availableTabs, selectedTabId]
  );

  const checkZhixueTabs = useCallback(async () => {
    if (runtimeModeRef.current === "demo") return;
    try {
      const tabs = await chrome.tabs.query({ url: "https://www.zhixue.com/*" });
      const zhixueTabs = tabs.filter((tab) => tab.id && isConnectableZhixueTab(tab));

      setAvailableTabs(zhixueTabs);

      if (zhixueTabs.length === 0) {
        selectedTabIdRef.current = null;
        connectedTabIdRef.current = null;
        setSelectedTabId(null);
        setConnectionProfile(null);
        setConnectionStatus("未找到智学网页面");
        setExamViewMode((current) => (current === "examDetail" || current === "examList" ? current : "ready"));
        return;
      }

      const candidate = zhixueTabs.find((tab) => tab.id === selectedTabIdRef.current)
        ?? zhixueTabs.find((tab) => tab.active)
        ?? zhixueTabs[0];
      const candidateId = candidate.id ?? null;
      selectedTabIdRef.current = candidateId;
      setSelectedTabId(candidateId);
      if (candidateId && connectedTabIdRef.current !== candidateId) {
        await connectTab(candidateId, true);
      }
    } catch (error) {
      setConnectionStatus(`检查页面失败: ${getErrorMessage(error)}`);
    }
  }, []);

  useEffect(() => {
    if (runtimeMode === "demo") return;
    void checkZhixueTabs();
    const intervalId = window.setInterval(() => void checkZhixueTabs(), 60000);
    const handleTabRemoved = (tabId: number) => {
      if (tabId === selectedTabIdRef.current || tabId === connectedTabIdRef.current) void checkZhixueTabs();
    };
    const handleTabUpdated = (tabId: number, changeInfo: { url?: string }) => {
      if ((tabId === selectedTabIdRef.current || tabId === connectedTabIdRef.current) && changeInfo.url) void checkZhixueTabs();
    };
    const handleTabActivated = () => void checkZhixueTabs();
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    return () => {
      window.clearInterval(intervalId);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, [checkZhixueTabs, runtimeMode]);

  useEffect(() => {
    void initializeLocalData();
  }, []);

  useEffect(() => {
    void refreshLocalData();
  }, [cacheRefreshToken]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeoutId = window.setTimeout(() => {
      setStatusMessage((current) => current === statusMessage ? "" : current);
    }, SNACKBAR_DURATION_MS);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatusMessage("");
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [statusMessage]);

  useEffect(() => {
    applyTheme(settings);

    function handleSystemThemeChange() {
      applyTheme(readSettings());
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [settings]);

  function updateSettings(next: Partial<OwlSettings>) {
    const value = { ...settings, ...next };
    setSettings(value);
    writeSettings(value);
    applyTheme(value);
  }

  async function initializeLocalData() {
    try {
      const migrated = await migrateLocalStorageScoreCacheToIndexedDb();
      await refreshLocalData();
      if (migrated > 0) {
        setStatusMessage(`已迁移 ${migrated} 条旧成绩缓存到本地数据库。`);
      }
    } catch (error) {
      setStatusMessage(`本地数据初始化失败: ${getErrorMessage(error)}`);
    }
  }

  async function refreshLocalData() {
    const [cachedRecords, allCacheRecords, stats, plans, templates, notes, insightSettings] = await Promise.all([
      listCachedReportMainRecords(),
      listScoreCacheRecords(),
      getCacheStats(),
      listAnalysisPlans(),
      listAnalysisTemplates(),
      listExamNotes(),
      readAnalysisInsightSettings()
    ]);
    if (runtimeModeRef.current === "demo") return;
    setCachedReportMainRecords(cachedRecords);
    setCacheHealth(buildCacheHealth(cachedRecords, allCacheRecords));
    setCacheStats(stats);
    setAnalysisPlans(plans);
    setAnalysisTemplates(templates);
    setExamNotes(Object.fromEntries(notes.map((note) => [note.examKey, note.note])));
    setAnalysisSettings(insightSettings);
  }

  async function openZhixue() {
    await chrome.tabs.create({ url: "https://www.zhixue.com" });
    setConnectionStatus("已打开智学网，请登录后返回连接页重新检测");
  }

  function selectConnectionTab(tabId: number | null) {
    selectedTabIdRef.current = tabId;
    connectedTabIdRef.current = null;
    setSelectedTabId(tabId);
    setConnectionProfile(null);
    setConnectionStatus(tabId ? "正在连接所选页面..." : "请选择一个智学网页面");
    if (tabId) void connectTab(tabId, true);
  }

  async function connectSelectedTab() {
    if (!selectedTabId) {
      setConnectionStatus("请先选择一个智学网页面");
      return;
    }
    await connectTab(selectedTabId, false);
  }

  async function connectTab(tabId: number, automatic: boolean) {
    if (runtimeModeRef.current === "demo") return;
    if (connectingTabIdRef.current === tabId) return;
    const attempt = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = attempt;
    connectingTabIdRef.current = tabId;
    setConnecting(true);
    setConnectionStatus(automatic ? "已检测到智学网页面，正在自动连接..." : "正在验证智学网登录状态...");
    try {
      const profile = await sendMessageToTab<undefined, ConnectionProfile>(tabId, "connectPage");
      if (connectionAttemptRef.current !== attempt || selectedTabIdRef.current !== tabId) return;
      selectedTabIdRef.current = tabId;
      connectedTabIdRef.current = tabId;
      setSelectedTabId(tabId);
      setConnectionProfile(profile);
      setConnectionStatus(`已连接：${profile.name} · ${profile.school.name}`);
    } catch (error) {
      if (connectionAttemptRef.current !== attempt || selectedTabIdRef.current !== tabId) return;
      connectedTabIdRef.current = null;
      setConnectionProfile(null);
      setConnectionStatus(`连接失败：${getErrorMessage(error)}`);
    } finally {
      if (connectionAttemptRef.current === attempt) {
        connectingTabIdRef.current = null;
        setConnecting(false);
      }
    }
  }

  async function enterDemoMode() {
    runtimeModeRef.current = "demo";
    setRuntimeMode("demo");
    connectionAttemptRef.current += 1;
    connectingTabIdRef.current = null;
    connectedTabIdRef.current = null;
    selectedTabIdRef.current = null;
    setConnecting(false);
    setAvailableTabs([]);
    setSelectedTabId(null);
    setConnectionProfile(demoProfile);
    setConnectionStatus("演示模式 · 当前资料均为虚拟数据");

    const initialExams = demoExams.filter((exam) => demoInitialExamIds.includes(exam.examId));
    const selectedExamMap = Object.fromEntries(initialExams.map((exam) => [getExamSelectionKey(exam), exam]));
    const demoInsightSettings: AnalysisInsightSettings = {
      scoreDropThreshold: 5,
      rankDropThreshold: 5,
      classificationRules: demoClassificationRules
    };

    setAcademicYears(demoAcademicYears);
    setSelectedAcademicYears([...demoAcademicYears]);
    setAllExamItems(sortExamItems(demoExams));
    setSelectedExamTypes(new Set());
    setSelectedClassificationLabels(new Set());
    setCurrentPage(1);
    setSelectedExamDetail(null);
    setSelectedSubjectDetail(null);
    setExamViewMode("examList");
    setSelectedExamIds(new Set(Object.keys(selectedExamMap)));
    setSelectedExamMap(selectedExamMap);
    setSelectedCachedExamKeys(new Set());
    setCachedReportMainRecords([]);
    setCacheStats(null);
    setCacheHealth({ missingRank: [], missingSubjectTrend: [], missingMetadata: [] });
    setAnalysisPlans(demoAnalysisPlans.map((plan) => ({ ...plan })));
    setAnalysisTemplates(demoAnalysisTemplates.map((template) => ({ ...template })));
    setSelectedAnalysisTemplateId(null);
    setSelectedAnalysisPlanIds(new Set([demoAnalysisPlans[0].id]));
    setActiveAnalysisPlanId(null);
    setExamNotes({});
    setAnalysisSettings(demoInsightSettings);
    setAnalysisTarget({ metric: "percentage", total: 82, subjects: {} });
    setAnalysisNote("演示数据展示了持续提升、一次阶段性回落和期末恢复。所有内容均为虚构。");
    setAnalysisMetric("percentage");
    setLoadingState({ kind: "loading", message: "正在准备演示分析...", current: 0, total: initialExams.length });

    const records = await buildAnalysisRecordsFromSources(
      initialExams.map((exam) => ({ kind: "exam" as const, exam })),
      {
        forceRefresh: true,
        cachePolicy: "none",
        sendExamDetail: getDemoExamDetail,
        sendSubjectLevelTrend: getDemoSubjectLevelTrend,
        onProgress: (completed, total) => {
          if (runtimeModeRef.current === "demo") {
            setLoadingState({ kind: "loading", message: `已准备 ${completed}/${total} 场演示考试`, current: completed, total });
          }
        }
      }
    );

    if (runtimeModeRef.current !== "demo") return;
    setAnalysisState({ records, failedCount: initialExams.length - records.length, generatedAt: new Date().toISOString() });
    setVisibleSubjectNames(new Set(records.flatMap((record) => record.subjects.map((subject) => subject.subjectName))));
    setLoadingState({ kind: "idle" });
    setStatusMessage("已进入演示模式；当前内容均为虚拟数据，不会访问智学网或真实缓存。");
    setMainView("analysis");
  }

  async function exitDemoMode() {
    runtimeModeRef.current = "live";
    setRuntimeMode("live");
    connectionAttemptRef.current += 1;
    connectingTabIdRef.current = null;
    connectedTabIdRef.current = null;
    selectedTabIdRef.current = null;
    setConnecting(false);
    setAvailableTabs([]);
    setSelectedTabId(null);
    setConnectionProfile(null);
    setConnectionStatus("正在检查智学网页面...");
    setAcademicYears([]);
    setSelectedAcademicYears([]);
    setAllExamItems([]);
    setSelectedExamTypes(new Set());
    setSelectedClassificationLabels(new Set());
    setCurrentPage(1);
    setSelectedExamDetail(null);
    setSelectedSubjectDetail(null);
    setExamViewMode("ready");
    setSelectedExamIds(new Set());
    setSelectedExamMap({});
    setSelectedCachedExamKeys(new Set());
    setAnalysisState({ records: [], failedCount: 0, generatedAt: null });
    setVisibleSubjectNames(new Set());
    setLoadingState({ kind: "idle" });
    setMainView("connection");
    setStatusMessage("已退出演示模式，正在恢复真实数据。");
    await refreshLocalData();
  }

  async function loadAcademicYears() {
    if (runtimeMode === "demo") {
      setAcademicYears(demoAcademicYears);
      setSelectedAcademicYears([...demoAcademicYears]);
      setAllExamItems(sortExamItems(demoExams));
      setExamViewMode("examList");
      setMainView("exams");
      return;
    }
    setMainView("exams");
    setLoadingState({ kind: "loading", message: "正在获取学年信息..." });

    try {
      const response = await sendMessageToSelectedTab<undefined, AcademicYearListResponse>("getAcademicYear");

      if (!response.result || !Array.isArray(response.result)) {
        throw new Error("学年数据格式错误");
      }

      setAcademicYears(response.result);
      setSelectedAcademicYears(response.result.slice(0, 1));
      setAllExamItems([]);
      setSelectedExamTypes(new Set());
      setSelectedClassificationLabels(new Set());
      setSelectedExamDetail(null);
      setSelectedSubjectDetail(null);
      setExamViewMode("selectYear");
      setLoadingState({ kind: "idle" });
    } catch (error) {
      setLoadingState({ kind: "error", message: `获取学年信息失败: ${getErrorMessage(error)}` });
    }
  }

  async function loadSelectedAcademicYears(years = selectedAcademicYears) {
    if (years.length === 0) {
      setStatusMessage("请至少选择一个学年。");
      return;
    }

    setSelectedAcademicYears(years);
    setCurrentPage(1);
    setSelectedExamDetail(null);
    setSelectedSubjectDetail(null);
    setLoadingState({ kind: "loading", message: "正在加载所选学年的考试列表...", current: 0, total: years.length });

    try {
      let completedYears = 0;
      const grouped = await Promise.all(years.map((year) => loadAllExamPagesForYear(year)));
      const exams = grouped.flat();
      completedYears += years.length;
      setLoadingState({ kind: "loading", message: `已加载 ${completedYears}/${years.length} 个学年`, current: completedYears, total: years.length });

      setSelectedExamMap((current) => {
        const next = { ...current };
        exams.forEach((exam) => {
          if (selectedExamIds.has(getExamSelectionKey(exam))) {
            next[getExamSelectionKey(exam)] = exam;
          }
        });
        return next;
      });
      setAllExamItems(sortExamItems(exams));
      if (runtimeMode === "live") void repairCachedExamMetadataFromList(exams);
      setSelectedExamTypes((current) => new Set(Array.from(current).filter((type) => exams.some((exam) => exam.examType === type))));
      setExamViewMode("examList");
      setLoadingState({ kind: "idle" });
    } catch (error) {
      setLoadingState({ kind: "error", message: `获取考试列表失败: ${getErrorMessage(error)}` });
    }
  }

  async function loadAllExamPagesForYear(year: AcademicYear): Promise<ExamListItem[]> {
    if (runtimeMode === "demo") {
      return demoExams.filter((exam) => exam.academicYearKey === (year.code ?? ""));
    }
    const academicYearKey = getAcademicYearKey(year);
    const academicYearName = year.name;
    const result: ExamListItem[] = [];
    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      setLoadingState({
        kind: "loading",
        message: `正在加载 ${academicYearName} 第 ${pageIndex} 页考试...`,
        current: pageIndex,
        total: undefined
      });
      const response = await sendMessageToSelectedTab<ExamListPayload, ExamListResponse>("getExamList", {
        pageIndex,
        academicYear: year
      });

      if (!response.result) {
        throw new Error(`${academicYearName} 考试列表数据格式错误`);
      }

      result.push(
        ...(response.result.examList ?? []).map((exam) => ({
          ...exam,
          academicYear: year,
          academicYearKey,
          academicYearName
        }))
      );
      hasNextPage = Boolean(response.result.hasNextPage);
      pageIndex += 1;
    }

    return result;
  }

  async function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > pageCount) return;
    setCurrentPage(nextPage);
  }

  function toggleExamSelection(exam: ExamListItem, checked: boolean) {
    const selectionKey = getExamSelectionKey(exam);
    setSelectedExamIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(selectionKey);
      } else {
        next.delete(selectionKey);
      }
      return next;
    });
    setSelectedExamMap((current) => {
      const next = { ...current };
      if (checked) {
        next[selectionKey] = exam;
      } else {
        delete next[selectionKey];
      }
      return next;
    });
  }

  async function repairCachedExamMetadataFromList(exams: ExamListItem[]) {
    let repaired = 0;
    await Promise.all(
      exams.map(async (exam) => {
        repaired += await updateScoreCacheMetadataForExam(
          { academicYearKey: exam.academicYearKey, examId: exam.examId },
          {
            academicYear: exam.academicYear,
            academicYearKey: exam.academicYearKey,
            academicYearName: exam.academicYearName,
            examId: exam.examId,
            examName: exam.examName,
            examType: exam.examType,
            examCreateDateTime: exam.examCreateDateTime
          }
        );
      })
    );
    if (repaired > 0) {
      setCacheRefreshToken((value) => value + 1);
    }
  }

  async function showExamDetail(exam: ExamListItem, forceRefresh = false, returnView: "exams" | "analysis" = "exams") {
    setExamDetailReturnView(returnView);
    setMainView("exams");
    setLoadingState({ kind: "loading", message: "正在获取考试基本信息...", current: 0, total: 3 });
    setSelectedSubjectDetail(null);

    try {
      const reportMain = await getCachedExamDetail<ReportMainResponse>(exam, "getReportMain", {
        examId: exam.examId,
        examDetailType: "getReportMain",
        academicYear: exam.academicYear
      }, forceRefresh);

      setLoadingState({ kind: "loading", message: "正在获取总分排名信息...", current: 1, total: 3 });

      const levelTrendResponse = await getCachedExamDetail<LevelTrendResponse>(
        exam,
        "getLevelTrend",
        {
          examId: exam.examId,
          examDetailType: "getLevelTrend",
          academicYear: exam.academicYear
        },
        forceRefresh
      ).catch(() => null);

      const paperList = reportMain.result?.paperList ?? [];
      const subjectLevelTrend: Record<string, LevelTrendResponse> = {};
      let completedSubjects = 0;

      setLoadingState({
        kind: "loading",
        message: paperList.length > 0 ? "正在并发获取各科排名数据..." : "暂无科目排名数据需要获取",
        current: 0,
        total: paperList.length
      });

      await Promise.all(
        paperList.map(async (paper) => {
          const subjectResponse = await getCachedSubjectLevelTrend(
            exam,
            paper.paperId,
            {
              examId: exam.examId,
              paperId: paper.paperId,
              academicYear: exam.academicYear
            },
            forceRefresh
          ).catch(() => null);

          completedSubjects += 1;
          setLoadingState({
            kind: "loading",
            message: `已获取 ${completedSubjects}/${paperList.length} 个科目排名数据`,
            current: completedSubjects,
            total: paperList.length
          });

          if (subjectResponse) {
            subjectLevelTrend[paper.paperId] = subjectResponse;
          }
        })
      );

      setSelectedExamDetail({
        examId: exam.examId,
        examName: exam.examName,
        examCreateDateTime: exam.examCreateDateTime,
        examType: exam.examType,
        academicYearName: exam.academicYearName,
        academicYearKey: exam.academicYearKey,
        reportMain,
        levelTrend: levelTrendResponse,
        subjectLevelTrend
      });
      setExamViewMode("examDetail");
      setLoadingState({ kind: "idle" });
    } catch (error) {
      setLoadingState({ kind: "error", message: `获取考试详情失败: ${getErrorMessage(error)}` });
    }
  }

  function returnFromExamDetail() {
    setSelectedExamDetail(null);
    if (examDetailReturnView === "analysis") {
      setMainView("analysis");
      return;
    }
    setExamViewMode("examList");
  }

  async function generateAnalysis(forceRefresh = false) {
    const selectedExams = sortByExamTimeAsc(Array.from(selectedExamIds)
      .map((examId) => selectedExamMap[examId])
      .filter((exam): exam is ExamListItem => Boolean(exam)));
    const selectedExamIdentitySet = new Set(selectedExams.map(getExamSelectionKey));
    const selectedCachedRecords = cachedReportMainRecords.filter((record) => {
      const identity = getCachedExamIdentity(record);
      return selectedCachedExamKeys.has(identity) && !selectedExamIdentitySet.has(identity);
    });
    const totalSelected = selectedExams.length + selectedCachedRecords.length;

    if (totalSelected === 0) {
      setStatusMessage("请先勾选要分析的考试。");
      return;
    }

    setMainView("analysis");
    setLoadingState({ kind: "loading", message: "正在生成成绩分析...", current: 0, total: totalSelected });

    const records = await buildAnalysisRecordsFromSources(
      [
        ...selectedExams.map((exam) => ({ kind: "exam" as const, exam })),
        ...selectedCachedRecords.map((record) => ({ kind: "cache" as const, record }))
      ],
      {
        forceRefresh,
        cachePolicy: runtimeMode === "demo" ? "none" : "persistent",
        sendExamDetail: <TData,>(payload: ExamDetailPayload) => runtimeMode === "demo"
          ? getDemoExamDetail<TData>(payload)
          : sendMessageToSelectedTab<ExamDetailPayload, TData>("getExamDetail", payload),
        sendSubjectLevelTrend: <TData,>(payload: SubjectLevelTrendPayload) => runtimeMode === "demo"
          ? getDemoSubjectLevelTrend<TData>(payload)
          : sendMessageToSelectedTab<SubjectLevelTrendPayload, TData>("getSubjectLevelTrend", payload),
        onCacheWrite: runtimeMode === "live" ? () => setCacheRefreshToken((value) => value + 1) : undefined,
        onProgress: (completed, total) =>
          setLoadingState({
            kind: "loading",
            message: `已分析 ${completed}/${total} 场考试`,
            current: completed,
            total
          })
      }
    );
    const failedCount = totalSelected - records.length;
    setAnalysisState({ records, failedCount, generatedAt: new Date().toISOString() });
    setVisibleSubjectNames(new Set(records.flatMap((record) => record.subjects.map((subject) => subject.subjectName))));
    setStatusMessage(
      failedCount > 0 ? `已生成分析，${failedCount} 场考试详情获取失败。` : `已生成 ${records.length} 场考试的成绩分析。`
    );
    setLoadingState({ kind: "idle" });
  }

  function closeAnalysis() {
    setAnalysisState({ records: [], failedCount: 0, generatedAt: null });
    setLoadingState({ kind: "idle" });
    setStatusMessage("已关闭本次分析，考试选择和分析设置已保留。");
  }

  async function openAnalysisExam(record: AnalysisExamRecord) {
    const identity = getAnalysisRecordIdentity(record);
    const cached = cachedReportMainRecords.find((item) => getCachedExamIdentity(item) === identity);
    const exam = cached
      ? cachedRecordToExamItem(cached)
      : {
          examId: record.examId,
          examName: record.examName,
          examCreateDateTime: record.examCreateDateTime,
          examType: record.examType ?? "unknown",
          academicYear: { name: record.academicYearName ?? "未知学年", beginTime: "", endTime: "" },
          academicYearKey: record.academicYearKey ?? "unknown-year",
          academicYearName: record.academicYearName ?? "未知学年"
        };
    await showExamDetail(exam, false, "analysis");
  }

  async function getCachedExamDetail<TData>(
    exam: ExamListItem,
    detailType: ExamDetailPayload["examDetailType"],
    payload: ExamDetailPayload,
    forceRefresh: boolean
  ): Promise<TData> {
    if (runtimeMode === "demo") return getDemoExamDetail<TData>(payload);
    const cacheKey = buildScoreCacheKey({
      academicYearKey: exam.academicYearKey,
      examId: exam.examId,
      detailType
    });
    const cached = !forceRefresh ? await readScoreCache<TData>(cacheKey) : null;

    if (cached) {
      await updateCachedExamMetadata(cacheKey, exam, detailType);
      return cached.data;
    }

    const data = await sendMessageToSelectedTab<ExamDetailPayload, TData>("getExamDetail", payload);
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
      data
    });
    setCacheRefreshToken((value) => value + 1);
    if (forceRefresh && detailType === "getReportMain") {
      setStatusMessage(`已刷新 ${exam.examName} 的成绩数据。`);
    }
    return data;
  }

  async function getCachedSubjectLevelTrend(
    exam: ExamListItem,
    paperId: string,
    payload: SubjectLevelTrendPayload,
    forceRefresh: boolean
  ): Promise<LevelTrendResponse> {
    if (runtimeMode === "demo") return getDemoSubjectLevelTrend<LevelTrendResponse>(payload);
    const cacheKey = buildScoreCacheKey({
      academicYearKey: exam.academicYearKey,
      examId: exam.examId,
      detailType: "getSubjectLevelTrend",
      paperId
    });
    const cached = !forceRefresh ? await readScoreCache<LevelTrendResponse>(cacheKey) : null;

    if (cached) {
      await updateCachedExamMetadata(cacheKey, exam, "getSubjectLevelTrend", paperId);
      return cached.data;
    }

    const data = await sendMessageToSelectedTab<SubjectLevelTrendPayload, LevelTrendResponse>("getSubjectLevelTrend", payload);
    await writeScoreCache(cacheKey, {
      cachedAt: new Date().toISOString(),
      academicYear: exam.academicYear,
      academicYearKey: exam.academicYearKey,
      academicYearName: exam.academicYearName,
      examId: exam.examId,
      examName: exam.examName,
      examType: exam.examType,
      examCreateDateTime: exam.examCreateDateTime,
      detailType: "getSubjectLevelTrend",
      paperId,
      data
    });
    setCacheRefreshToken((value) => value + 1);
    return data;
  }

  async function updateCachedExamMetadata(
    cacheKey: string,
    exam: ExamListItem,
    detailType: CachedScoreRecord["detailType"],
    paperId?: string
  ) {
    await updateScoreCacheMetadata(cacheKey, {
      academicYear: exam.academicYear,
      academicYearKey: exam.academicYearKey,
      academicYearName: exam.academicYearName,
      examId: exam.examId,
      examName: exam.examName,
      examType: exam.examType,
      examCreateDateTime: exam.examCreateDateTime,
      detailType,
      paperId
    });
    setCacheRefreshToken((value) => value + 1);
  }

  async function sendMessageToSelectedTab<TPayload, TData>(
    action: ExtensionRequest<TPayload>["action"],
    payload?: TPayload
  ): Promise<TData> {
    if (!selectedTab?.id) {
      throw new Error("请先选择一个智学网页面");
    }

    return sendMessageToTab<TPayload, TData>(selectedTab.id, action, payload);
  }

  async function sendHomeworkMessage<TPayload, TData>(
    action: ExtensionRequest<TPayload>["action"],
    payload?: TPayload
  ): Promise<TData> {
    if (!selectedTab?.id) throw new Error("请先选择一个智学网页面");
    const tabId = selectedTab.id;
    try {
      await ensureHomeworkBackground();
      return await sendMessageToSelectedTab<TPayload, TData>(action, payload);
    } catch (error) {
      const errorType = getHomeworkErrorType(error);
      const stage = errorType === "HOMEWORK_REQUEST_FAILED" ? "content-background-response" : "background-health";
      logHomeworkError(stage, action, tabId, errorType, error);
      throw new Error(`${getErrorMessage(error)}。调试信息：模块 homework-background，操作 ${action}，错误类型 ${errorType}`);
    }
  }

  async function ensureHomeworkBackground(retried = false): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage<{ channel: typeof OWL_BACKGROUND_HEALTH_CHANNEL }, BackgroundHealthResponse>({
        channel: OWL_BACKGROUND_HEALTH_CHANNEL
      });
      if (!response?.ready) {
        const diagnostic = new Error(response?.error ?? "后台健康检查未返回有效结果");
        diagnostic.name = response?.errorCode ?? "CORS_RULE_SETUP_FAILED";
        throw diagnostic;
      }
    } catch (error) {
      if (isCorsRuleError(error)) throw error;
      if (!retried && isMissingMessageReceiver(error)) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        return ensureHomeworkBackground(true);
      }
      const diagnostic = new Error(`扩展后台服务未运行，请在扩展管理页重新加载 Owl Insight 后重试（${getErrorMessage(error)}）`);
      diagnostic.name = "BACKGROUND_UNREACHABLE";
      throw diagnostic;
    }
  }

  async function sendMessageToTab<TPayload, TData>(
    tabId: number,
    action: ExtensionRequest<TPayload>["action"],
    payload?: TPayload,
    retried = false
  ): Promise<TData> {
    const request: ExtensionRequest<TPayload> = {
      requestId: crypto.randomUUID(),
      action,
      payload
    };

    let response: ExtensionResponse<TData>;
    try {
      response = await chrome.tabs.sendMessage<ExtensionRequest<TPayload>, ExtensionResponse<TData>>(tabId, request);
    } catch (error) {
      if (!retried && isMissingMessageReceiver(error)) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["assets/content.ts-loader.js"]
        });
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        return sendMessageToTab<TPayload, TData>(tabId, action, payload, true);
      }
      throw error;
    }

    if (!response?.success && !retried && isHomeworkAction(action) && isMissingMessageReceiver(response?.error)) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["assets/content.ts-loader.js"]
      });
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      return sendMessageToTab<TPayload, TData>(tabId, action, payload, true);
    }

    if (!response?.success) {
      throw new Error(response?.error ?? "请求失败");
    }

    return response.data as TData;
  }

  function getMainScrollTop() {
    const containerTop = appMainRef.current?.scrollTop ?? 0;
    return containerTop > 0 ? containerTop : window.scrollY || document.documentElement.scrollTop || 0;
  }

  function scrollMainTo(top: number) {
    appMainRef.current?.scrollTo({ top });
    window.scrollTo({ top });
  }

  function openSubjectDetail(subjectDetail: SubjectDetailState) {
    if (!subjectDetail) return;
    setSelectedSubjectDetail({
      ...subjectDetail,
      returnScrollTop: getMainScrollTop()
    });
    setMainView("subject");
    window.requestAnimationFrame(() => scrollMainTo(0));
  }

  function returnFromSubjectDetail() {
    const targetView = selectedSubjectDetail?.sourceView ?? "analysis";
    const scrollTop = selectedSubjectDetail?.returnScrollTop ?? 0;
    setMainView(targetView);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollMainTo(scrollTop));
    });
  }

  async function saveCurrentAnalysisPlan() {
    const now = new Date().toISOString();
    const existing = activeAnalysisPlanId ? analysisPlans.find((plan) => plan.id === activeAnalysisPlanId) : null;
    const plan: AnalysisPlan = {
      id: existing?.id ?? (runtimeMode === "demo" ? `demo-plan-${crypto.randomUUID()}` : crypto.randomUUID()),
      name: existing?.name ?? `成绩分析 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      selectedExamKeys: Array.from(selectedExamIds),
      selectedCachedExamKeys: Array.from(selectedCachedExamKeys),
      selectedClassificationLabels: Array.from(selectedClassificationLabels),
      visibleSubjectNames: Array.from(visibleSubjectNames),
      metric: analysisMetric,
      target: analysisTarget,
      insightSettings: getPlanInsightSettings(analysisSettings),
      note: analysisNote
    };
    if (runtimeMode === "demo") {
      setAnalysisPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
      setActiveAnalysisPlanId(plan.id);
      setSelectedAnalysisPlanIds(new Set([plan.id]));
      setStatusMessage(`已保存演示分析方案：${plan.name}；仅本次演示有效。`);
      return;
    }
    await saveAnalysisPlan(plan);
    setActiveAnalysisPlanId(plan.id);
    setSelectedAnalysisPlanIds(new Set([plan.id]));
    await refreshLocalData();
    setStatusMessage(`已保存分析方案：${plan.name}`);
  }

  async function loadAnalysisPlans(planIds: string[]) {
    const plans = planIds
      .map((planId) => analysisPlans.find((plan) => plan.id === planId))
      .filter((plan): plan is AnalysisPlan => Boolean(plan))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    if (plans.length === 0) {
      setStatusMessage("未找到分析方案。");
      return;
    }

    const basePlan = plans[0];
    setActiveAnalysisPlanId(basePlan.id);
    setSelectedAnalysisPlanIds(new Set(plans.map((plan) => plan.id)));
    setSelectedExamIds(new Set(plans.flatMap((plan) => plan.selectedExamKeys)));
    setSelectedCachedExamKeys(new Set(plans.flatMap((plan) => plan.selectedCachedExamKeys)));
    setSelectedClassificationLabels(new Set(plans.flatMap((plan) => plan.selectedClassificationLabels ?? [])));
    setVisibleSubjectNames(new Set(plans.flatMap((plan) => plan.visibleSubjectNames)));
    setAnalysisMetric(basePlan.metric);
    setAnalysisTarget(basePlan.target);
    const nextInsightSettings = { ...basePlan.insightSettings, classificationRules: analysisSettings.classificationRules ?? [] };
    setAnalysisSettings(nextInsightSettings);
    setAnalysisNote(mergeAnalysisNotes(plans));
    if (runtimeMode === "live") await writeAnalysisInsightSettings(nextInsightSettings);
    setStatusMessage(`已加载 ${plans.length} 个分析方案。`);
  }

  async function saveCurrentAnalysisTemplate() {
    const now = new Date().toISOString();
    const existing = selectedAnalysisTemplateId ? analysisTemplates.find((template) => template.id === selectedAnalysisTemplateId) : null;
    const template: AnalysisTemplate = {
      id: existing?.id ?? (runtimeMode === "demo" ? `demo-template-${crypto.randomUUID()}` : crypto.randomUUID()),
      name: existing?.name ?? `分析模板 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      selectedExamTypes: Array.from(selectedExamTypes),
      selectedClassificationLabels: [],
      visibleSubjectNames: Array.from(visibleSubjectNames),
      metric: analysisMetric,
      target: analysisTarget,
      insightSettings: getPlanInsightSettings(analysisSettings)
    };
    if (runtimeMode === "demo") {
      setAnalysisTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
      setSelectedAnalysisTemplateId(template.id);
      setStatusMessage(`已保存演示分析模板：${template.name}；仅本次演示有效。`);
      return;
    }
    await saveAnalysisTemplate(template);
    setSelectedAnalysisTemplateId(template.id);
    await refreshLocalData();
    setStatusMessage(`已保存分析模板：${template.name}`);
  }

  async function loadAnalysisTemplate(templateId: string) {
    const template = analysisTemplates.find((item) => item.id === templateId);
    if (!template) {
      setStatusMessage("未找到分析模板。");
      return;
    }
    const nextInsightSettings = { ...template.insightSettings, classificationRules: analysisSettings.classificationRules ?? [] };
    setSelectedAnalysisTemplateId(template.id);
    setSelectedExamTypes(new Set(template.selectedExamTypes));
    setSelectedClassificationLabels(new Set());
    setVisibleSubjectNames(new Set(template.visibleSubjectNames));
    setAnalysisMetric(template.metric);
    setAnalysisTarget(template.target);
    setAnalysisSettings(nextInsightSettings);
    if (runtimeMode === "live") await writeAnalysisInsightSettings(nextInsightSettings);
    const typeFilters = new Set(template.selectedExamTypes);
    const matchesTemplate = (exam: ExamListItem) => typeFilters.size === 0 || typeFilters.has(exam.examType);
    const matchedExams = allExamItems.filter(matchesTemplate);
    const matchedCachedRecords = cachedReportMainRecords.filter((record) => matchesTemplate(cachedRecordToExamItem(record)));
    setSelectedExamIds(new Set(matchedExams.map(getExamSelectionKey)));
    setSelectedExamMap(Object.fromEntries(matchedExams.map((exam) => [getExamSelectionKey(exam), exam])));
    setSelectedCachedExamKeys(new Set(matchedCachedRecords.map(getCachedExamIdentity)));
    setCurrentPage(1);
    setStatusMessage(`已应用分析模板：${template.name}，选择在线考试 ${matchedExams.length} 场、缓存考试 ${matchedCachedRecords.length} 场。`);
  }

  async function deleteSavedAnalysisTemplate(templateId: string) {
    const template = analysisTemplates.find((item) => item.id === templateId);
    if (runtimeMode === "demo") {
      setAnalysisTemplates((current) => current.filter((item) => item.id !== templateId));
      if (selectedAnalysisTemplateId === templateId) setSelectedAnalysisTemplateId(null);
      setStatusMessage(`已删除演示分析模板：${template?.name ?? "未命名模板"}；仅本次演示有效。`);
      return;
    }
    await deleteAnalysisTemplate(templateId);
    if (selectedAnalysisTemplateId === templateId) {
      setSelectedAnalysisTemplateId(null);
    }
    await refreshLocalData();
    setStatusMessage(`已删除分析模板：${template?.name ?? "未命名模板"}`);
  }

  function selectExamBatch(exams: ExamListItem[], checked: boolean) {
    setSelectedExamIds((current) => {
      const next = new Set(current);
      exams.forEach((exam) => {
        const key = getExamSelectionKey(exam);
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
    setSelectedExamMap((current) => {
      const next = { ...current };
      exams.forEach((exam) => {
        const key = getExamSelectionKey(exam);
        if (checked) {
          next[key] = exam;
        } else {
          delete next[key];
        }
      });
      return next;
    });
    setStatusMessage(`${checked ? "已选择" : "已取消"} ${exams.length} 场考试。`);
  }

  async function hydrateCacheHealth() {
    if (runtimeMode === "demo") {
      setStatusMessage("演示模式不读取或补全真实缓存。");
      return;
    }
    const targets = cacheHealth.missingRank.concat(cacheHealth.missingSubjectTrend).concat(cacheHealth.missingMetadata);
    const deduped = Array.from(new Map(targets.map((record) => [getCachedExamIdentity(record), record])).values());
    if (deduped.length === 0) {
      setStatusMessage("缓存健康状态良好，无需补全。");
      return;
    }
    setLoadingState({ kind: "loading", message: "正在补全缓存数据...", current: 0, total: deduped.length });
    let completed = 0;
    let failed = 0;
    for (const record of deduped) {
      const exam = cachedRecordToExamItem(record);
      try {
        await getCachedExamDetail<LevelTrendResponse>(
          exam,
          "getLevelTrend",
          { examId: exam.examId, examDetailType: "getLevelTrend", academicYear: exam.academicYear },
          false
        ).catch(() => {
          failed += 1;
          return null;
        });
        const paperList = record.data.result?.paperList ?? [];
        await Promise.all(
          paperList.map((paper) =>
            getCachedSubjectLevelTrend(
              exam,
              paper.paperId,
              { examId: exam.examId, paperId: paper.paperId, academicYear: exam.academicYear },
              false
            ).catch(() => {
              failed += 1;
              return null;
            })
          )
        );
      } finally {
        completed += 1;
        setLoadingState({ kind: "loading", message: `已补全 ${completed}/${deduped.length} 场考试`, current: completed, total: deduped.length });
      }
    }
    await refreshLocalData();
    setLoadingState({ kind: "idle" });
    setStatusMessage(failed > 0 ? `缓存补全完成，${failed} 项请求失败。` : "缓存补全完成。");
  }

  async function deleteSavedAnalysisPlan(planId: string) {
    const plan = analysisPlans.find((item) => item.id === planId);
    if (runtimeMode === "demo") {
      setAnalysisPlans((current) => current.filter((item) => item.id !== planId));
      if (activeAnalysisPlanId === planId) setActiveAnalysisPlanId(null);
      setSelectedAnalysisPlanIds((current) => {
        const next = new Set(current);
        next.delete(planId);
        return next;
      });
      setStatusMessage(`已删除演示分析方案：${plan?.name ?? "未命名方案"}；仅本次演示有效。`);
      return;
    }
    await deleteAnalysisPlan(planId);
    if (activeAnalysisPlanId === planId) {
      setActiveAnalysisPlanId(null);
    }
    setSelectedAnalysisPlanIds((current) => {
      const next = new Set(current);
      next.delete(planId);
      return next;
    });
    await refreshLocalData();
    setStatusMessage(`已删除分析方案：${plan?.name ?? "未命名方案"}`);
  }

  async function updateExamNote(examKey: string, note: string) {
    const next: ExamNote = { examKey, note, updatedAt: new Date().toISOString() };
    if (runtimeMode === "live") await writeExamNote(next);
    setExamNotes((current) => {
      const updated = { ...current };
      if (note.trim()) {
        updated[examKey] = note;
      } else {
        delete updated[examKey];
      }
      return updated;
    });
  }

  async function updateAnalysisSettings(next: AnalysisInsightSettings) {
    if (runtimeMode === "live") await writeAnalysisInsightSettings(next);
    setAnalysisSettings(next);
    setStatusMessage(runtimeMode === "demo" ? "已更新演示分析设置；仅本次演示有效。" : "已更新异常标记阈值。");
  }

  async function clearCacheByFilter(filter: { academicYearKey?: string; academicYearName?: string; examType?: string }) {
    if (runtimeMode === "demo") {
      setStatusMessage("演示模式与真实缓存完全隔离，不会执行清理操作。");
      return;
    }
    const deleted = await deleteScoreCacheRecords(filter);
    setCacheRefreshToken((value) => value + 1);
    setStatusMessage(`已清理 ${deleted} 条成绩缓存。`);
  }

  async function exportDataJson() {
    if (runtimeMode === "demo") {
      setStatusMessage("演示模式不会导出或读取真实本地数据。");
      return;
    }
    const data = await exportLocalData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `owl-insight-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("已导出本地数据 JSON。");
  }

  return (
    <div className="app-shell">
      <NavigationRail
        currentView={mainView}
        onNavigate={setMainView}
        connectionReady={workspaceReady}
        isDemoMode={runtimeMode === "demo"}
      />
      <main className="app-main" ref={appMainRef}>
        <div className="app-content">
          {runtimeMode === "demo" ? <DemoModeBanner onExit={() => void exitDemoMode()} /> : null}
          <PageHeader {...getPageMeta(mainView)} />
          <StatusAlert message={statusMessage} floating onDismiss={() => setStatusMessage("")} />
          {mainView === "connection" ? (
            <ConnectionView
              availableTabs={availableTabs}
              selectedTabId={selectedTabId}
              profile={connectionProfile}
              status={connectionStatus}
              connecting={connecting}
              isDemoMode={runtimeMode === "demo"}
              onOpenZhixue={() => void openZhixue()}
              onRefreshTabs={() => void checkZhixueTabs()}
              onSelectTab={selectConnectionTab}
              onConnect={() => void connectSelectedTab()}
              onEnterDemo={() => void enterDemoMode()}
            />
          ) : null}
          {mainView === "exams" && (workspaceReady || examViewMode === "examDetail") ? (
            <ExamWorkspace
              academicYears={academicYears}
              currentPage={currentPage}
              examItems={visibleExamItems}
              filteredExamItems={filteredExamItems}
              examTypeOptions={examTypeOptions}
              classificationOptions={classificationOptions}
              loadingState={loadingState}
              pageCount={pageCount}
              classificationRules={analysisSettings.classificationRules ?? []}
              selectedAcademicYears={selectedAcademicYears}
              selectedExamDetail={selectedExamDetail}
              selectedExamIds={selectedExamIds}
              selectedExamTypes={selectedExamTypes}
              selectedClassificationLabels={selectedClassificationLabels}
              viewMode={examViewMode}
              onBackToList={returnFromExamDetail}
              onExamClick={(exam) => void showExamDetail(exam)}
              onExamRefresh={(exam) => void showExamDetail(exam, true)}
              onGenerateAnalysis={() => void generateAnalysis()}
              onLoadAcademicYears={() => void loadAcademicYears()}
              onLoadSelectedYears={(years) => void loadSelectedAcademicYears(years)}
              onReturnToYearSelection={() => setExamViewMode("selectYear")}
              onPageChange={(page) => void changePage(page)}
              onSubjectClick={(paper) => {
                openSubjectDetail(buildSubjectDetailFromExamDetail(selectedExamDetail, paper, analysisState.records));
              }}
              onExamTypeToggle={(type) => {
                setSelectedExamTypes((current) => toggleSetValue(current, type));
                setCurrentPage(1);
              }}
              onClassificationLabelToggle={(label) => {
                setSelectedClassificationLabels((current) => toggleSetValue(current, label));
                setCurrentPage(1);
              }}
              onFilteredExamSelectionChange={(checked) => selectExamBatch(filteredExamItems, checked)}
              onToggleExam={toggleExamSelection}
              onYearSelectionChange={setSelectedAcademicYears}
            />
          ) : null}
          {mainView === "exams" && !workspaceReady && examViewMode !== "examDetail" ? <RequiresConnection onConnect={() => setMainView("connection")} /> : null}
          {mainView === "analysis" ? (
            <AnalysisView
              analysisState={{ ...analysisState, records: visibleAnalysisRecords }}
              analysisMetric={analysisMetric}
              analysisGroups={analysisGroups}
              analysisAnomalies={analysisAnomalies}
              classificationRules={analysisSettings.classificationRules ?? []}
              analysisTarget={analysisTarget}
              analysisNote={analysisNote}
              analysisPlans={analysisPlans}
              analysisTemplates={analysisTemplates}
              selectedAnalysisTemplateId={selectedAnalysisTemplateId}
              selectedAnalysisPlanIds={selectedAnalysisPlanIds}
              cachedReportMainRecords={cachedReportMainRecords}
              examNotes={examNotes}
              loadingState={loadingState}
              selectedCachedExamKeys={selectedCachedExamKeys}
              selectedExamCount={selectedExamCount}
              visibleSubjectNames={visibleSubjectNames}
              isDemoMode={runtimeMode === "demo"}
              onAnalysisMetricChange={setAnalysisMetric}
              onAnalysisNoteChange={setAnalysisNote}
              onAnalysisTargetChange={setAnalysisTarget}
              onSavePlan={() => void saveCurrentAnalysisPlan()}
              onLoadPlans={(planIds) => void loadAnalysisPlans(planIds)}
              onDeletePlan={(planId) => void deleteSavedAnalysisPlan(planId)}
              onSaveTemplate={() => void saveCurrentAnalysisTemplate()}
              onLoadTemplate={(templateId) => void loadAnalysisTemplate(templateId)}
              onDeleteTemplate={(templateId) => void deleteSavedAnalysisTemplate(templateId)}
              onAnalysisPlanToggle={(planId, checked) => setSelectedAnalysisPlanIds((current) => setCheckedValue(current, planId, checked))}
              onExamNoteChange={(examKey, note) => void updateExamNote(examKey, note)}
              onGenerate={() => void generateAnalysis()}
              onRefresh={() => void generateAnalysis(true)}
              onClose={closeAnalysis}
              onOpenExam={(record) => void openAnalysisExam(record)}
              onGoExams={() => setMainView("exams")}
              onCachedExamToggle={(key, checked) => setSelectedCachedExamKeys((current) => setCheckedValue(current, key, checked))}
              onCachedExamBatchToggle={(keys, checked) => setSelectedCachedExamKeys((current) => {
                const next = new Set(current);
                keys.forEach((key) => checked ? next.add(key) : next.delete(key));
                return next;
              })}
              onOpenCachedExam={(record) => void showExamDetail(cachedRecordToExamItem(record), false, "analysis")}
              onSubjectSelect={openSubjectDetail}
              onVisibleSubjectToggle={(subjectName) => setVisibleSubjectNames((current) => toggleSetValue(current, subjectName))}
            />
          ) : null}
          {mainView === "homework" && workspaceReady ? (
            <HomeworkView
              isDemoMode={runtimeMode === "demo"}
              onLoadSubjects={() => runtimeMode === "demo" ? Promise.resolve(demoHomeworkSubjects) : sendHomeworkMessage<undefined, HomeworkSubject[]>("getHomeworkSubjects")}
              onLoadList={(payload) => runtimeMode === "demo" ? getDemoHomeworkList(payload) : sendHomeworkMessage<HomeworkListPayload, HomeworkListPage>("getHomeworkList", payload)}
              onLoadResources={(homework) => runtimeMode === "demo" ? getDemoHomeworkResources(homework) : sendHomeworkMessage<HomeworkResourcesPayload, HomeworkResource[]>("getHomeworkResources", { homework })}
            />
          ) : null}
          {mainView === "homework" && !workspaceReady ? <RequiresConnection onConnect={() => setMainView("connection")} /> : null}
          {mainView === "subject" ? (
            <SubjectDetailPage
              detail={selectedSubjectDetail}
              metric={analysisMetric}
              onMetricChange={setAnalysisMetric}
              onBack={returnFromSubjectDetail}
            />
          ) : null}
          {mainView === "settings" ? (
            <SettingsView
              settings={settings}
              analysisSettings={analysisSettings}
              cacheStats={cacheStats}
              cacheHealth={cacheHealth}
              onAnalysisSettingsChange={(next) => void updateAnalysisSettings(next)}
              onCacheClear={(filter) => void clearCacheByFilter(filter)}
              onExportData={() => void exportDataJson()}
              onHydrateCache={() => void hydrateCacheHealth()}
              onOpenRules={() => setMainView("rules")}
              isDemoMode={runtimeMode === "demo"}
              onEnterDemo={() => void enterDemoMode()}
              onChange={updateSettings}
            />
          ) : null}
          {mainView === "rules" ? (
            <RuleSettingsView
              rules={analysisSettings.classificationRules ?? []}
              examTypes={runtimeMode === "demo" ? Array.from(new Set(demoExams.map((exam) => exam.examType))) : cacheStats?.examTypes ?? []}
              exams={allExamItems}
              cachedExams={cachedExamItems}
              onBack={() => setMainView("settings")}
              onSave={(classificationRules) => void updateAnalysisSettings({ ...analysisSettings, classificationRules })}
            />
          ) : null}
          {mainView === "changelog" ? <ChangelogView /> : null}
          <AppFooter onNavigate={setMainView} />
        </div>
      </main>
    </div>
  );
}

function DemoModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <section className="demo-mode-banner" aria-label="演示模式提示">
      <span className="demo-mode-banner__icon" aria-hidden="true"><MaterialIcon name="science" /></span>
      <div className="demo-mode-banner__body">
        <strong>演示模式</strong>
        <span>当前内容均为虚拟数据，不会访问智学网或真实缓存。</span>
      </div>
      <md-outlined-button onClick={onExit}>退出演示</md-outlined-button>
    </section>
  );
}

function NavigationRail({
  currentView,
  onNavigate,
  connectionReady,
  isDemoMode
}: {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
  connectionReady: boolean;
  isDemoMode: boolean;
}) {
  const items = [
    { view: "connection" as const, label: "连接", icon: "link" },
    { view: "exams" as const, label: "考试", icon: "assignment" },
    { view: "analysis" as const, label: "分析", icon: "show_chart" },
    { view: "homework" as const, label: "作业", icon: "task" },
    { view: "changelog" as const, label: "更新", icon: "history" }
  ];

  return (
    <aside className="app-drawer" aria-label="主导航">
      <div className="app-drawer__panel">
        <nav className="app-nav" aria-label="Owl Insight 导航">
          {items.map((item) => (
            <button
              type="button"
              className="app-nav__item"
              aria-current={currentView === item.view ? "page" : undefined}
              onClick={() => onNavigate(item.view)}
              key={item.view}
            >
              <span className="app-nav__icon-state" aria-hidden="true">
                <span className="app-nav__icon">
                  <MaterialIcon name={item.icon} />
                </span>
              </span>
              <span className="app-nav__label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="app-drawer__footer" aria-label="快捷入口">
          <span
            className="rail-action"
            data-status={isDemoMode ? "demo" : connectionReady ? "ready" : "offline"}
            aria-label={isDemoMode ? "当前处于演示模式" : connectionReady ? "智学网页面已连接" : "等待智学网页面"}
            title={isDemoMode ? "演示模式" : connectionReady ? "智学网页面已连接" : "等待智学网页面"}
          >
            <MaterialIcon name={isDemoMode ? "science" : connectionReady ? "cloud_done" : "cloud_off"} />
          </span>
          <button
            type="button"
            className="rail-action"
            aria-current={currentView === "settings" || currentView === "rules" ? "page" : undefined}
            aria-label="设置"
            title="设置"
            onClick={() => onNavigate("settings")}
          >
            <MaterialIcon name="settings" />
          </button>
        </div>
      </div>
    </aside>
  );
}

const appVersion = chrome.runtime.getManifest().version;

const changelogEntries = [
  {
    title: "v2.2.1",
    label: "权限审核修复",
    groups: [
      {
        title: "修复",
        items: [
          "精简扩展权限声明，移除未使用的本地存储、标签页临时访问及多余主机访问权限。"
        ]
      },
      {
        title: "注意事项",
        items: [
          "本次更新不会清除主题设置、成绩缓存或分析配置，也不需要重新登录或重新授权。"
        ]
      }
    ]
  },
  {
    title: "v2.2.0",
    label: "公开演示与界面修复",
    groups: [
      {
        title: "新增",
        items: [
          "新增公开演示模式，无需登录即可体验考试详情、成绩趋势、分类规则和作业资源。",
          "内置两学年、十二场虚拟考试和示例作业；预览与下载只使用扩展内置演示文件。"
        ]
      },
      {
        title: "优化",
        items: [
          "演示方案、模板、备注、规则和分析设置仅在当前页面中生效，与真实缓存完全隔离。",
          "调整六科成绩基线与波动幅度，在多场考试中展示理科成绩和排名异常。"
        ]
      },
      {
        title: "修复",
        items: [
          "对话框使用全屏遮罩，修复 HCT 颜色选择和作业预览遮罩覆盖不完整的问题。",
          "修复 Pride Color 面板被分析设置覆盖，以及作业列表进入箭头换行的问题。"
        ]
      }
    ]
  },
  {
    title: "v2.1.0",
    label: "连接、作业资源与分析体验更新",
    groups: [
      {
        title: "新增",
        items: [
          "新增独立连接页，自动检测合适页面，连接后展示学生、学校、年级与班级资料。",
          "新增作业资源页，支持提交状态、科目筛选、独立详情页、文本与图片预览及批量下载。",
          "Manifest 增加中文与英文说明，品牌名保持 Owl Insight。"
        ]
      },
      {
        title: "优化",
        items: [
          "登录凭证改为通过当前智学网 Cookie 会话临时获取，不再读取 localStorage。",
          "修复作业接口在页面代理环境中被浏览器拦截的问题，改由扩展后台在限定主机权限内请求；会话凭证不会进入主 popup、存储或日志。",
          "作业列表采用整卡进入详情的交互，修复资源复选框事件失效问题，并将进入箭头固定在卡片右侧。",
          "雷达图移动到单次考试，成绩异常默认收起并按考试精确说明。",
          "缓存成绩改用考试卡片样式，未连接时也可生成本地分析并打开缓存考试。",
          "考试与缓存列表使用复选框全选筛选结果，缓存考试支持分类筛选。",
          "页面提示改为符合 Material 3 的底部 Snackbar，6 秒后自动收起；页脚 Logo 使用无背景 SVG。",
          "分析模板按考试类型自动选择考试。"
        ]
      }
    ]
  },
  {
    title: "v2.0.0",
    label: "Vite 重构与分析增强版",
    groups: [
      {
        title: "架构与界面",
        items: [
          "迁移到 Vite + React + TypeScript + CRXJS 的 Manifest V3 架构。",
          "使用 Material Design 3、navigation rail、动态主题和自定义 HCT 颜色。",
          "加入 henguren 风格页脚、更新记录和本地优先的数据管理体验。"
        ]
      },
      {
        title: "成绩分析",
        items: [
          "支持 IndexedDB 成绩缓存、分析方案、分析模板和考试备注。",
          "加入总分/单科趋势、班级排名切换、目标线、异常标记、雷达图和同比/环比摘要。",
          "支持缓存成绩直接参与分析，并提供缓存健康检查与补全入口。"
        ]
      },
      {
        title: "考试选择",
        items: [
          "支持多学年、考试类型多选、关键词分类规则和分类标签筛选。",
          "支持选择当前筛选结果、取消当前筛选结果、选择同分类全部考试。",
          "规则页提供命中预览和多分类冲突提示。"
        ]
      }
    ]
  }
];

function ChangelogView() {
  return (
    <div className="stack-lg">
      <section className="stack" aria-label="更新列表">
        {changelogEntries.map((entry) => (
          <article className="md-card stack" key={entry.title}>
            <div className="spread">
              <div>
                <p className="helper-text">{entry.label}</p>
                <h2 className="section-title">{entry.title}</h2>
              </div>
              <span className="badge">{entry.title === `v${appVersion}` ? "当前版本" : "说明"}</span>
            </div>
            {entry.groups.map((group) => (
              <section className="stack" key={group.title}>
                <h3 className="card-title">{group.title}</h3>
                <ul className="clean-list">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        ))}
      </section>
    </div>
  );
}

function AppFooter({ onNavigate }: { onNavigate: (view: MainView) => void }) {
  return (
    <footer className="app-footer" aria-label="应用信息">
      <div className="app-footer__wave" aria-hidden="true" />
      <div className="app-footer__body">
        <section className="app-footer__brand" aria-label="项目信息">
          <img className="app-footer__mark" src="/owl-insight-logo.svg" alt="Owl Insight Logo" />
          <div className="stack">
            <div>
              <p className="app-footer__eyebrow">Owl Insight v{appVersion}</p>
              <h2 className="app-footer__title">Owl Insight</h2>
            </div>
            <p className="app-footer__description">面向智学网成绩查看、缓存与本地分析的轻量 Chrome 扩展。</p>
          </div>
        </section>
        <nav className="app-footer__links" aria-label="页脚导航">
          <div className="app-footer__column">
            <h3>项目</h3>
            <a href="https://github.com/LSCube7/Zhixue_Helper" target="_blank" rel="noreferrer">GitHub</a>
            <button type="button" onClick={() => onNavigate("changelog")}>更新记录</button>
          </div>
          <div className="app-footer__column">
            <h3>反馈</h3>
            <a href="https://github.com/LSCube7/Zhixue_Helper/issues" target="_blank" rel="noreferrer">提交 Issue</a>
            <a href="https://github.com/LSCube7/Zhixue_Helper/discussions" target="_blank" rel="noreferrer">参与讨论</a>
          </div>
          <div className="app-footer__column">
            <h3>开发者</h3>
            <a href="https://www.lsc7.top" target="_blank" rel="noreferrer">LSCube</a>
          </div>
        </nav>
      </div>
      <div className="app-footer__bottom">
        <a className="app-footer__developer" href="https://www.lsc7.top" target="_blank" rel="noreferrer" aria-label="开发者 LSCube 个人主页">
          <strong>LSCube</strong>
        </a>
        <nav className="app-footer__legal" aria-label="应用入口">
          <button type="button" onClick={() => onNavigate("settings")}>设置</button>
          <button type="button" onClick={() => onNavigate("changelog")}>更新记录</button>
        </nav>
        <span className="app-footer__copyright">Copyright © LSCube. All rights reserved.</span>
      </div>
    </footer>
  );
}

function PageHeader({ current, title, description }: { current: string; title: string; description: string }) {
  return (
    <header className="page-header">
      <div className="breadcrumb" aria-label="面包屑">
        <span>Owl Insight</span>
        <span aria-hidden="true">/</span>
        <span>{current}</span>
      </div>
      <h1 className="page-title">{title}</h1>
      <p className="page-description">{description}</p>
    </header>
  );
}

function getPageMeta(view: MainView): { current: string; title: string; description: string } {
  const pages: Record<MainView, { current: string; title: string; description: string }> = {
    connection: { current: "连接", title: "连接智学网", description: "选择一个已登录的智学网页面，验证会话并查看学生资料。" },
    exams: { current: "考试", title: "考试数据", description: "选择学年，查看考试详情并勾选考试生成分析。" },
    analysis: { current: "分析", title: "成绩分析", description: "基于手动选择的考试生成总分和科目趋势图。" },
    homework: { current: "作业", title: "作业资源", description: "按提交状态和科目查找作业，并下载服务端正常返回的资源。" },
    subject: { current: "单科", title: "单科详情", description: "查看单科成绩、班级排名和趋势。" },
    rules: { current: "规则", title: "分类规则", description: "配置全局考试分类规则，按名称、类型、日期自动归类。" },
    changelog: { current: "更新", title: "更新记录", description: "记录 Owl Insight 的主要功能变化和能力边界。" },
    settings: { current: "设置", title: "外观设置", description: "Material Design 3 主题和 HCT 自定义颜色。" }
  };
  return pages[view];
}

function RequiresConnection({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="md-card empty-card">
      <MaterialIcon name="link_off" />
      <h2>尚未连接智学网</h2>
      <p>请先选择一个已登录的智学网页面并完成连接验证。</p>
      <md-filled-button onClick={onConnect}>前往连接页</md-filled-button>
    </section>
  );
}

function StatusAlert({
  message,
  tone = "info",
  floating = false,
  onDismiss
}: {
  message?: string;
  tone?: "info" | "error";
  floating?: boolean;
  onDismiss?: () => void;
}) {
  if (floating) {
    return (
      <div className="snackbar-live-region" role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} aria-atomic="true">
        {message ? (
          <div className={`md-card md-card--flat status-alert status-alert--floating ${tone === "error" ? "badge--error" : ""}`} key={message}>
            <span className="status-alert__message">{message}</span>
            {onDismiss ? (
              <button className="status-alert__dismiss" type="button" aria-label="关闭提示" onClick={onDismiss}>
                <MaterialIcon name="close" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (!message) return null;

  return (
    <div className={`md-card md-card--flat status-alert ${tone === "error" ? "badge--error" : ""}`} role={tone === "error" ? "alert" : "status"}>
      <span className="status-alert__message">{message}</span>
    </div>
  );
}

function ExamWorkspace(props: {
  academicYears: AcademicYear[];
  currentPage: number;
  examItems: ExamListItem[];
  filteredExamItems: ExamListItem[];
  examTypeOptions: string[];
  classificationOptions: string[];
  loadingState: LoadingState;
  pageCount: number;
  classificationRules: ExamClassificationRule[];
  selectedAcademicYears: AcademicYear[];
  selectedExamDetail: ExamDetailViewModel | null;
  selectedExamIds: Set<string>;
  selectedExamTypes: Set<string>;
  selectedClassificationLabels: Set<string>;
  viewMode: ExamViewMode;
  onBackToList: () => void;
  onExamClick: (exam: ExamListItem) => void;
  onExamRefresh: (exam: ExamListItem) => void;
  onExamTypeToggle: (type: string) => void;
  onClassificationLabelToggle: (label: string) => void;
  onGenerateAnalysis: () => void;
  onLoadAcademicYears: () => void;
  onLoadSelectedYears: (years: AcademicYear[]) => void;
  onReturnToYearSelection: () => void;
  onPageChange: (page: number) => void;
  onSubjectClick: (paper: PaperScore) => void;
  onFilteredExamSelectionChange: (checked: boolean) => void;
  onToggleExam: (exam: ExamListItem, checked: boolean) => void;
  onYearSelectionChange: (years: AcademicYear[]) => void;
}) {
  if (props.loadingState.kind === "loading") return <LoadingStateView state={props.loadingState} />;
  if (props.loadingState.kind === "error") return <ErrorState message={props.loadingState.message} />;

  return (
    <div className="stack-lg">
      {props.viewMode === "ready" ? <ReadyState onLoadAcademicYears={props.onLoadAcademicYears} /> : null}
      {props.viewMode === "selectYear" ? (
        <YearSelector
          academicYears={props.academicYears}
          selectedAcademicYears={props.selectedAcademicYears}
          onLoad={props.onLoadSelectedYears}
          onSelectionChange={props.onYearSelectionChange}
        />
      ) : null}
      {props.viewMode === "examList" ? <ExamListView {...props} /> : null}
      {props.viewMode === "examDetail" && props.selectedExamDetail ? (
        <ExamDetailView detail={props.selectedExamDetail} onBack={props.onBackToList} onSubjectClick={props.onSubjectClick} />
      ) : null}
    </div>
  );
}

function ReadyState({ onLoadAcademicYears }: { onLoadAcademicYears: () => void }) {
  return (
    <section className="md-card empty-card">
      <MaterialIcon name="task_alt" />
      <h2>准备获取考试</h2>
      <p>连接已验证，点击下方按钮获取可用学年。</p>
      <md-filled-button onClick={onLoadAcademicYears}>获取考试</md-filled-button>
    </section>
  );
}

function YearSelector({
  academicYears,
  selectedAcademicYears,
  onLoad,
  onSelectionChange
}: {
  academicYears: AcademicYear[];
  selectedAcademicYears: AcademicYear[];
  onLoad: (years: AcademicYear[]) => void;
  onSelectionChange: (years: AcademicYear[]) => void;
}) {
  function toggleYear(year: AcademicYear, checked: boolean) {
    const key = getAcademicYearKey(year);
    const next = checked
      ? [...selectedAcademicYears, year].filter((item, index, list) => list.findIndex((candidate) => getAcademicYearKey(candidate) === getAcademicYearKey(item)) === index)
      : selectedAcademicYears.filter((item) => getAcademicYearKey(item) !== key);
    onSelectionChange(next);
  }

  return (
    <section className="md-card stack">
      <div>
        <p className="breadcrumb">Academic Year</p>
        <h2 className="section-title">选择学年</h2>
        <p className="helper-text">可多选学年，加载后会自动拉取所选学年的全部分页考试。</p>
      </div>
      <div className="filter-chip-grid" role="group" aria-label="学年多选">
        {academicYears.map((year) => {
          const selected = selectedAcademicYears.some((item) => getAcademicYearKey(item) === getAcademicYearKey(year));
          return (
            <button className="filter-chip" type="button" data-selected={selected} onClick={() => toggleYear(year, !selected)} key={getAcademicYearKey(year)}>
              <MaterialIcon name={selected ? "check" : "add"} />
              <span>{year.name}</span>
            </button>
          );
        })}
      </div>
      <div className="cluster">
        <md-filled-button disabled={selectedAcademicYears.length === 0} onClick={() => onLoad(selectedAcademicYears)}>
          加载所选学年
        </md-filled-button>
        <span className="info-chip">已选择 {selectedAcademicYears.length} 个学年</span>
      </div>
    </section>
  );
}

function ExamListView({
  examItems,
  filteredExamItems,
  examTypeOptions,
  classificationOptions,
  classificationRules,
  currentPage,
  pageCount,
  selectedExamIds,
  selectedExamTypes,
  selectedClassificationLabels,
  onPageChange,
  onExamClick,
  onExamRefresh,
  onExamTypeToggle,
  onClassificationLabelToggle,
  onGenerateAnalysis,
  onFilteredExamSelectionChange,
  onToggleExam,
  onReturnToYearSelection
}: {
  examItems: ExamListItem[];
  filteredExamItems: ExamListItem[];
  examTypeOptions: string[];
  classificationOptions: string[];
  classificationRules: ExamClassificationRule[];
  currentPage: number;
  pageCount: number;
  selectedExamIds: Set<string>;
  selectedExamTypes: Set<string>;
  selectedClassificationLabels: Set<string>;
  onPageChange: (page: number) => void;
  onExamClick: (exam: ExamListItem) => void;
  onExamRefresh: (exam: ExamListItem) => void;
  onExamTypeToggle: (type: string) => void;
  onClassificationLabelToggle: (label: string) => void;
  onGenerateAnalysis: () => void;
  onFilteredExamSelectionChange: (checked: boolean) => void;
  onToggleExam: (exam: ExamListItem, checked: boolean) => void;
  onReturnToYearSelection: () => void;
}) {
  const selectedFilteredCount = filteredExamItems.filter((exam) => selectedExamIds.has(getExamSelectionKey(exam))).length;
  const allFilteredSelected = filteredExamItems.length > 0 && selectedFilteredCount === filteredExamItems.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  return (
    <section className="stack-lg">
      <div className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Exams</p>
            <h2 className="section-title">考试列表</h2>
            <p className="helper-text">勾选考试后可生成成绩折线图；点击考试卡片进入详情。</p>
          </div>
          <div className="cluster">
            <md-outlined-button onClick={onReturnToYearSelection}>重新选择学年</md-outlined-button>
            <div className="filter-chip-grid" role="group" aria-label="考试类型多选">
              {examTypeOptions.map((type) => (
                <button
                  className="filter-chip"
                  type="button"
                  data-selected={selectedExamTypes.has(type)}
                  key={type}
                  onClick={() => onExamTypeToggle(type)}
                >
                  <MaterialIcon name={selectedExamTypes.has(type) ? "check" : "add"} />
                  <span>{getExamTypeName(type)}</span>
                </button>
              ))}
              {examTypeOptions.length === 0 ? <span className="info-chip">暂无类型</span> : null}
            </div>
            <div className="filter-chip-grid" role="group" aria-label="分类标签多选">
              {classificationOptions.map((label) => (
                <button
                  className="filter-chip"
                  type="button"
                  data-selected={selectedClassificationLabels.has(label)}
                  key={label}
                  onClick={() => onClassificationLabelToggle(label)}
                >
                  <MaterialIcon name={selectedClassificationLabels.has(label) ? "check" : "sell"} />
                  <span>{label}</span>
                </button>
              ))}
              {classificationOptions.length === 0 ? <span className="info-chip">暂无分类标签</span> : null}
            </div>
            <md-filled-button disabled={selectedExamIds.size === 0} onClick={onGenerateAnalysis}>
              生成成绩分析
            </md-filled-button>
          </div>
        </div>
        <div className="cluster">
          <span className="info-chip info-chip--strong">当前筛选 {filteredExamItems.length} 场</span>
          <label className="select-all-control" data-disabled={filteredExamItems.length === 0}>
            <md-checkbox
              checked={allFilteredSelected}
              indeterminate={someFilteredSelected}
              disabled={filteredExamItems.length === 0}
              onInput={(event: Event) => onFilteredExamSelectionChange(checkedFrom(event))}
            />
            <span>全选当前筛选结果</span>
          </label>
        </div>
      </div>

      {examItems.length > 0 ? (
        <div className="exam-list">
          {examItems.map((exam) => {
            const classificationLabels = getExamClassificationLabels(exam, classificationRules);
            return (
              <ExamCard
                title={exam.examName}
                selected={selectedExamIds.has(getExamSelectionKey(exam))}
                selectionLabel={`选择 ${exam.examName}`}
                metadata={[
                  formatDate(exam.examCreateDateTime),
                  exam.academicYearName,
                  getExamTypeName(exam.examType),
                  ...classificationLabels
                ]}
                status={exam.isFinal ? "批阅完成" : "正在批阅"}
                key={getExamSelectionKey(exam)}
                onClick={() => onExamClick(exam)}
                onToggle={(checked) => onToggleExam(exam, checked)}
                onRefresh={() => onExamRefresh(exam)}
              />
            );
          })}
        </div>
      ) : (
        <section className="md-card empty-card">
          <MaterialIcon name="event_busy" />
          <h2>暂无考试</h2>
          <p>所选筛选条件下没有考试记录。</p>
        </section>
      )}

      <div className="cluster pagination">
        <md-outlined-button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          上一页
        </md-outlined-button>
        <span className="info-chip info-chip--strong">第 {currentPage}/{pageCount} 页</span>
        <md-filled-button disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>
          下一页
        </md-filled-button>
      </div>
    </section>
  );
}

function ExamCard({
  title,
  metadata,
  status,
  selected,
  selectionLabel,
  onToggle,
  onClick,
  onRefresh
}: {
  title: string;
  metadata: string[];
  status?: string;
  selected: boolean;
  selectionLabel: string;
  onToggle: (checked: boolean) => void;
  onClick: () => void;
  onRefresh?: () => void;
}) {
  return (
    <article className="md-card md-card--interactive exam-item" data-selected={selected}>
      <md-checkbox
        checked={selected}
        onClick={(event: Event) => event.stopPropagation()}
        onInput={(event: Event) => onToggle(checkedFrom(event))}
        aria-label={selectionLabel}
      />
      <button className="exam-item__open" type="button" aria-label={`打开 ${title}`} onClick={onClick}>
        <div className="exam-item__body">
          <h3>{title}</h3>
          <div className="record-chip-row">
            {metadata.filter(Boolean).map((item, index) => <span className="info-chip" key={`${item}-${index}`}>{item}</span>)}
            {status ? <span className="info-chip info-chip--strong">{status}</span> : null}
          </div>
        </div>
        <MaterialIcon name="chevron_right" />
      </button>
      {onRefresh ? (
        <button className="icon-button" type="button" aria-label={`刷新 ${title}`} onClick={(event) => { event.stopPropagation(); onRefresh(); }}>
          <MaterialIcon name="refresh" />
        </button>
      ) : null}
    </article>
  );
}

function ExamDetailView({
  detail,
  onBack,
  onSubjectClick
}: {
  detail: ExamDetailViewModel;
  onBack: () => void;
  onSubjectClick: (paper: PaperScore) => void;
}) {
  const [radarMetric, setRadarMetric] = useState<AnalysisMetric>("percentage");
  const totalScore = computeTotalFromSubjects(detail.reportMain);
  const classRankInfo = getClassRankInfo(detail.levelTrend);
  const paperList = detail.reportMain.result?.paperList ?? [];
  const radarData = paperList
    .map((paper) => {
      const percentage = Number.isFinite(paper.userScore) && Number.isFinite(paper.standardScore) && paper.standardScore > 0
        ? Math.round((paper.userScore / paper.standardScore) * 1000) / 10
        : null;
      const rank = getSubjectClassRankInfo(paper.paperId, detail.subjectLevelTrend);
      const rankValue = typeof rank?.rank === "number" ? rank.rank : null;
      const value = radarMetric === "percentage" ? percentage : rankValue;
      if (value === null) return null;
      return {
        subject: paper.subjectName,
        value,
        display: radarMetric === "percentage" ? `${percentage}% · ${paper.userScore}/${paper.standardScore}` : `第 ${rankValue}/${rank?.total ?? "?"} 名`,
        rankTotal: rank?.total
      };
    })
    .filter((item): item is { subject: string; value: number; display: string; rankTotal: number | undefined } => Boolean(item));
  const radarMaxRank = Math.max(1, ...radarData.map((item) => item.rankTotal ?? item.value));

  return (
    <section className="stack-lg">
      <div className="spread">
        <div>
          <p className="breadcrumb">Exam Detail</p>
          <h2 className="section-title">{detail.examName}</h2>
          {detail.academicYearName ? <p className="helper-text">{detail.academicYearName}</p> : null}
        </div>
        <md-outlined-button onClick={onBack}>返回列表</md-outlined-button>
      </div>

      <section className="score-hero md-card">
        <h3>全科成绩概览</h3>
        {totalScore.score !== null && totalScore.standardScore !== null ? (
          <>
            <div className="total-score">
              <strong>{totalScore.score}</strong>
              <span>/</span>
              <span>{totalScore.standardScore}</span>
            </div>
            <div className="record-chip-row centered">
              <span className="info-chip">有效科目：{totalScore.subjectCount} 科</span>
              <span className="info-chip">得分率：{formatNullable(totalScore.percentage)}%</span>
              <span className="info-chip">年级等第：{detail.reportMain.result?.totalScore?.userLevel ?? "未知"}</span>
              <span className="info-chip">班级等第：{classRankInfo?.level ?? "暂无数据"}</span>
              <span className="info-chip info-chip--strong">
                班级排名：{classRankInfo ? `${classRankInfo.rank}/${classRankInfo.total}` : "暂无数据"}
              </span>
            </div>
          </>
        ) : (
          <p>暂无成绩概览数据。</p>
        )}
      </section>

      {radarData.length >= 3 ? (
        <ChartCard title="本次考试科目结构" action={<MetricSwitch value={radarMetric} onChange={setRadarMetric} />}>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis
                angle={90}
                domain={radarMetric === "percentage" ? [0, 100] : [1, radarMaxRank]}
                reversed={radarMetric === "classRank"}
                tickFormatter={(value) => radarMetric === "percentage" ? `${value}%` : `第${value}名`}
              />
              <Radar name={metricLabel(radarMetric)} dataKey="value" stroke="var(--md-sys-color-primary)" fill="var(--md-sys-color-primary)" fillOpacity={0.24} />
              <Tooltip formatter={(_, name, item) => [(item.payload as { display?: string }).display ?? "暂无", name]} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}

      <section className="stack">
        <h3 className="section-title">各科成绩详情</h3>
        {paperList.length > 0 ? (
          <div className="md-grid">
            {paperList.map((paper) => (
              <SubjectCard key={paper.paperId} paper={paper} subjectLevelTrend={detail.subjectLevelTrend} onClick={() => onSubjectClick(paper)} />
            ))}
          </div>
        ) : (
          <p className="helper-text">暂无科目数据。</p>
        )}
      </section>
    </section>
  );
}

function SubjectCard({
  paper,
  subjectLevelTrend,
  onClick
}: {
  paper: PaperScore;
  subjectLevelTrend: Record<string, LevelTrendResponse>;
  onClick: () => void;
}) {
  const percentage =
    typeof paper.userScore === "number" && typeof paper.standardScore === "number" && paper.standardScore > 0
      ? Math.round((paper.userScore / paper.standardScore) * 1000) / 10
      : null;
  const rankInfo = getSubjectClassRankInfo(paper.paperId, subjectLevelTrend);

  return (
    <article className="md-card md-card--interactive subject-card" onClick={onClick}>
      <div className="spread">
        <h4 className="card-title">{paper.subjectName}</h4>
        <span className="badge">{paper.userLevel ?? "未知"}</span>
      </div>
      <div className="score-display">
        <strong>{paper.userScore}</strong>
        <span>/</span>
        <span>{paper.standardScore}</span>
      </div>
      <div className="progress-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, percentage ?? 0))}%` }} />
      </div>
      <div className="record-chip-row">
        <span className="info-chip">得分率：{percentage === null ? "暂无" : `${percentage}%`}</span>
        <span className="info-chip">班级等第：{rankInfo?.level ?? "暂无"}</span>
        <span className="info-chip">班级排名：{rankInfo ? `${rankInfo.rank}/${rankInfo.total}` : "暂无"}</span>
      </div>
      {paper.tag?.name ? <span className="badge badge--neutral">{paper.tag.name}</span> : null}
      <md-outlined-button onClick={(event: Event) => { event.stopPropagation(); onClick(); }}>查看单科</md-outlined-button>
    </article>
  );
}

function AnalysisView({
  analysisState,
  analysisMetric,
  analysisGroups,
  analysisAnomalies,
  classificationRules,
  analysisTarget,
  analysisNote,
  analysisPlans,
  analysisTemplates,
  selectedAnalysisTemplateId,
  selectedAnalysisPlanIds,
  cachedReportMainRecords,
  examNotes,
  loadingState,
  selectedCachedExamKeys,
  selectedExamCount,
  visibleSubjectNames,
  isDemoMode,
  onAnalysisMetricChange,
  onAnalysisNoteChange,
  onAnalysisTargetChange,
  onSavePlan,
  onLoadPlans,
  onDeletePlan,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onAnalysisPlanToggle,
  onExamNoteChange,
  onGenerate,
  onRefresh,
  onClose,
  onOpenExam,
  onGoExams,
  onCachedExamToggle,
  onCachedExamBatchToggle,
  onOpenCachedExam,
  onSubjectSelect,
  onVisibleSubjectToggle
}: {
  analysisState: AnalysisState;
  analysisMetric: AnalysisMetric;
  analysisGroups: ReturnType<typeof classifyAnalysisRecords>;
  analysisAnomalies: AnalysisAnomaly[];
  classificationRules: ExamClassificationRule[];
  analysisTarget: AnalysisTarget;
  analysisNote: string;
  analysisPlans: AnalysisPlan[];
  analysisTemplates: AnalysisTemplate[];
  selectedAnalysisTemplateId: string | null;
  selectedAnalysisPlanIds: Set<string>;
  cachedReportMainRecords: CachedScoreRecord<ReportMainResponse>[];
  examNotes: Record<string, string>;
  loadingState: LoadingState;
  selectedCachedExamKeys: Set<string>;
  selectedExamCount: number;
  visibleSubjectNames: Set<string>;
  isDemoMode: boolean;
  onAnalysisMetricChange: (metric: AnalysisMetric) => void;
  onAnalysisNoteChange: (note: string) => void;
  onAnalysisTargetChange: (target: AnalysisTarget) => void;
  onSavePlan: () => void;
  onLoadPlans: (planIds: string[]) => void;
  onDeletePlan: (planId: string) => void;
  onSaveTemplate: () => void;
  onLoadTemplate: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onAnalysisPlanToggle: (planId: string, checked: boolean) => void;
  onExamNoteChange: (examKey: string, note: string) => void;
  onGenerate: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onOpenExam: (record: AnalysisExamRecord) => void;
  onGoExams: () => void;
  onCachedExamToggle: (key: string, checked: boolean) => void;
  onCachedExamBatchToggle: (keys: string[], checked: boolean) => void;
  onOpenCachedExam: (record: CachedScoreRecord<ReportMainResponse>) => void;
  onSubjectSelect: (subject: SubjectDetailState) => void;
  onVisibleSubjectToggle: (subjectName: string) => void;
}) {
  if (loadingState.kind === "loading") return <LoadingStateView state={loadingState} />;
  if (loadingState.kind === "error") return <ErrorState message={loadingState.message} />;

  const records = analysisState.records;
  const totalSeries = buildTotalScoreSeries(records);
  const subjectSeries = buildSubjectSeries(records);
  const summary = summarizeAnalysis(records);
  const comparisonSummary = buildExamComparisonSummary(records, analysisMetric, analysisAnomalies);
  const metricTotalSeries = buildMetricSeries(totalSeries, analysisMetric);
  const metricSubjectSeries = buildSubjectMetricSeries(subjectSeries, analysisMetric, visibleSubjectNames);
  const subjectChartData = buildCombinedSubjectChartData(metricSubjectSeries, metricTotalSeries);
  const subjectNames = Object.keys(subjectSeries);
  const visibleSubjectList = subjectNames.filter((name) => visibleSubjectNames.has(name));
  const labels = buildAnalysisLabels(records);
  const totalTarget = analysisTarget.metric === analysisMetric ? analysisTarget.total : null;
  const subjectTargets = analysisTarget.metric === analysisMetric ? (analysisTarget.subjects ?? {}) : {};
  const cacheSelector = isDemoMode ? null : (
    <CachedExamSelector
      records={cachedReportMainRecords}
      classificationRules={classificationRules}
      selectedKeys={selectedCachedExamKeys}
      onToggle={onCachedExamToggle}
      onToggleMany={onCachedExamBatchToggle}
      onOpen={onOpenCachedExam}
    />
  );
  const templatePanel = (
    <AnalysisTemplatePanel
      templates={analysisTemplates}
      selectedTemplateId={selectedAnalysisTemplateId}
      onLoad={onLoadTemplate}
      onSave={onSaveTemplate}
      onDelete={onDeleteTemplate}
    />
  );

  if (records.length === 0) {
    return (
      <div className="stack-lg">
        <AnalysisPlanSelector
          plans={analysisPlans}
          selectedPlanIds={selectedAnalysisPlanIds}
          onToggle={onAnalysisPlanToggle}
          onDelete={onDeletePlan}
          onLoad={() => onLoadPlans(Array.from(selectedAnalysisPlanIds))}
          onSave={onSavePlan}
        />
        {templatePanel}
        {cacheSelector}
        <section className="md-card empty-card">
          <MaterialIcon name="query_stats" />
          <h2>等待生成成绩分析</h2>
          <p>{isDemoMode ? "先在考试列表中勾选演示考试。" : "先在考试列表中勾选考试，或在上方选择本地缓存成绩。"}</p>
          <div className="cluster">
            <md-outlined-button onClick={onGoExams}>去选择考试</md-outlined-button>
            <md-filled-button disabled={selectedExamCount === 0} onClick={onGenerate}>
              生成分析
            </md-filled-button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <section className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Analysis Plan</p>
            <h2 className="section-title">分析方案</h2>
            <p className="helper-text">当前图表比较用户选择的全部考试；分类只用于标记和理解考试来源。</p>
          </div>
          <div className="cluster">
            <md-outlined-button disabled={selectedAnalysisPlanIds.size === 0} onClick={() => onLoadPlans(Array.from(selectedAnalysisPlanIds))}>加载所选方案</md-outlined-button>
            <md-filled-button onClick={onSavePlan}>保存方案</md-filled-button>
          </div>
        </div>
        <AnalysisPlanChipGrid plans={analysisPlans} selectedPlanIds={selectedAnalysisPlanIds} onToggle={onAnalysisPlanToggle} onDelete={onDeletePlan} />
        {templatePanel}
        {analysisGroups.length > 0 ? (
          <div className="filter-chip-grid" role="list" aria-label="考试分类命中">
            {analysisGroups.map((group) => {
              return (
                <span className="filter-chip" role="listitem" key={group.id}>
                  <MaterialIcon name="category" />
                  <span>{group.label} · {group.records.length}</span>
                </span>
              );
            })}
          </div>
        ) : null}
        <label className="note-field">
          <span>分析备注</span>
          <textarea value={analysisNote} rows={3} onInput={(event) => onAnalysisNoteChange((event.currentTarget as HTMLTextAreaElement).value)} placeholder="记录这组考试的背景、复习状态或筛选原因" />
        </label>
      </section>

      <div className="spread">
        <div className="record-chip-row">
          <span className="info-chip info-chip--strong">考试 {summary.examCount} 场</span>
          <span className="info-chip">科目 {summary.subjectCount} 个</span>
          <span className="info-chip">平均得分率 {formatNullable(summary.averagePercentage)}%</span>
          <span className="info-chip">最近变化 {formatDelta(summary.latestDelta)}</span>
        </div>
        <div className="cluster">
          <md-outlined-button onClick={onClose}>关闭分析</md-outlined-button>
          <md-outlined-button onClick={onRefresh}>刷新数据</md-outlined-button>
          <md-filled-button onClick={onGenerate}>重新生成</md-filled-button>
        </div>
      </div>

      <section className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Targets</p>
            <h2 className="section-title">目标线</h2>
            <p className="helper-text">目标线跟随当前图表指标显示。</p>
          </div>
          <span className="info-chip">{metricLabel(analysisMetric)}</span>
        </div>
        <div className="target-grid">
          <label>
            <span>总分目标</span>
            <input type="number" value={totalTarget ?? ""} onInput={(event) => onAnalysisTargetChange({ ...analysisTarget, metric: analysisMetric, total: numberOrNull((event.currentTarget as HTMLInputElement).value) })} placeholder={analysisMetric === "classRank" ? "如 10" : "如 85"} />
          </label>
          {subjectNames.map((subjectName) => (
            <label key={subjectName}>
              <span>{subjectName}</span>
              <input
                type="number"
                value={subjectTargets[subjectName] ?? ""}
                onInput={(event) =>
                  onAnalysisTargetChange({
                    ...analysisTarget,
                    metric: analysisMetric,
                    subjects: {
                      ...(analysisTarget.metric === analysisMetric ? analysisTarget.subjects : {}),
                      [subjectName]: numberOrNull((event.currentTarget as HTMLInputElement).value)
                    }
                  })
                }
                placeholder={analysisMetric === "classRank" ? "班排" : "得分率"}
              />
            </label>
          ))}
        </div>
      </section>

      {analysisAnomalies.length > 0 ? (
        <details className="md-card anomaly-disclosure">
          <summary>
            <span><MaterialIcon name="warning" /><strong>成绩异常标记</strong></span>
            <span className="info-chip info-chip--strong">{analysisAnomalies.length} 条 · {groupAnomaliesByExam(analysisAnomalies).length} 场</span>
          </summary>
          <div className="anomaly-groups">
            {groupAnomaliesByExam(analysisAnomalies).map((group) => (
              <section className="anomaly-group" key={group.examKey}>
                <div className="spread"><h3 className="card-title">{group.examName}</h3><span className="info-chip">{group.items.length} 项</span></div>
                <div className="anomaly-list">
                  {group.items.map((anomaly) => (
                    <article className="anomaly-item" data-severity={anomaly.severity} key={anomaly.id}>
                      <MaterialIcon name={anomaly.severity === "critical" ? "priority_high" : "warning"} />
                      <span><strong>{anomaly.subjectName ?? "总分"}</strong><small>{anomaly.message}</small></span>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      ) : null}

      <div className="md-grid metric-grid">
        <MetricCard label="最佳考试" value={summary.bestExamName ?? "暂无"} detail={summary.bestPercentage === null ? "暂无得分率" : `${summary.bestPercentage}%`} />
        <MetricCard label="平均得分率" value={summary.averagePercentage === null ? "暂无" : `${summary.averagePercentage}%`} detail="基于总分得分率" />
        <MetricCard label="最近一次变化" value={formatDelta(summary.latestDelta)} detail="相对上一场考试" />
      </div>

      <section className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Comparison</p>
            <h2 className="section-title">同比 / 环比摘要</h2>
          </div>
          <span className="info-chip">{metricLabel(analysisMetric)}</span>
        </div>
        <div className="record-chip-row">
          {comparisonSummary.map((item) => (
            <span className={`info-chip ${item.strong ? "info-chip--strong" : ""}`} key={item.label}>
              {item.label}：{item.value}
            </span>
          ))}
        </div>
      </section>

      <ChartCard title={`总分${metricLabel(analysisMetric)}趋势`} action={<MetricSwitch value={analysisMetric} onChange={onAnalysisMetricChange} />}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={metricTotalSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis domain={analysisMetric === "percentage" ? [0, 100] : ["dataMin", "dataMax"]} reversed={analysisMetric === "classRank"} tickFormatter={(value) => formatAxisTick(Number(value), analysisMetric)} />
            <Tooltip formatter={(_, __, item) => [(item.payload as MetricPoint).display, metricLabel(analysisMetric)]} labelFormatter={(label) => findExamName(metricTotalSeries, String(label))} />
            {typeof totalTarget === "number" ? <ReferenceLine y={totalTarget} stroke="var(--md-sys-color-tertiary)" strokeDasharray="6 4" label="目标" /> : null}
            <Line type="monotone" dataKey="value" stroke="var(--md-sys-color-primary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {subjectNames.length > 0 ? (
        <ChartCard title={`各科${metricLabel(analysisMetric)}趋势`} action={<MetricSwitch value={analysisMetric} onChange={onAnalysisMetricChange} />}>
          <div className="subject-chart-actions" aria-label="选择显示科目">
            {subjectNames.map((subjectName) => {
              const selected = visibleSubjectNames.has(subjectName);
              return (
                <button className="filter-chip" type="button" data-selected={selected} key={subjectName} onClick={() => onVisibleSubjectToggle(subjectName)}>
                  <MaterialIcon name={selected ? "check" : "add"} />
                  <span>{subjectName}</span>
                </button>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={subjectChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={analysisMetric === "percentage" ? [0, 100] : ["dataMin", "dataMax"]} reversed={analysisMetric === "classRank"} tickFormatter={(value) => formatAxisTick(Number(value), analysisMetric)} />
              <Tooltip
                formatter={(value, name, item) => [
                  getSubjectMetricDisplay(item.payload as Record<string, unknown>, String(name), value, analysisMetric),
                  name
                ]}
              />
              <Legend />
              {visibleSubjectList.map((subjectName, index) => (
                <React.Fragment key={subjectName}>
                  {typeof subjectTargets[subjectName] === "number" ? <ReferenceLine y={subjectTargets[subjectName]} stroke={chartColors[index % chartColors.length]} strokeDasharray="6 4" label={`${subjectName}目标`} /> : null}
                  <Line
                    type="monotone"
                    dataKey={subjectName}
                    stroke={chartColors[index % chartColors.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </React.Fragment>
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="subject-chart-actions" aria-label="查看单科趋势">
            {visibleSubjectList.map((subjectName) => {
              const subject = records.flatMap((record) => record.subjects).find((item) => item.subjectName === subjectName);
              return subject ? (
                <button className="subject-link-button" type="button" key={subjectName} onClick={() => onSubjectSelect(buildSubjectDetailFromAnalysis(subject, records, "analysis"))}>
                  <MaterialIcon name="open_in_new" />
                  {subjectName}
                </button>
              ) : null;
            })}
          </div>
        </ChartCard>
      ) : null}

      <section className="table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>考试</th>
              <th>总分</th>
              <th>得分率</th>
              <th>班级排名</th>
              <th>科目数</th>
              <th>等第</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={getAnalysisRecordIdentity(record)}>
                <td>
                  <strong>{labels[getAnalysisRecordIdentity(record)] ?? record.examName}</strong>
                  <div className="helper-text">{record.examName}{record.academicYearName ? ` · ${record.academicYearName}` : ""}</div>
                </td>
                <td>{record.totalScore ?? "暂无"}</td>
                <td>
                  {record.totalScore !== null && record.standardScore
                    ? `${Math.round((record.totalScore / record.standardScore) * 1000) / 10}%`
                    : "暂无"}
                </td>
                <td>{formatRankInfo(record.classRank)}</td>
                <td>{record.subjects.length}</td>
                <td>{record.userLevel ?? "未知"}</td>
                <td>
                  <textarea
                    className="table-note"
                    value={examNotes[getAnalysisRecordIdentity(record)] ?? ""}
                    rows={2}
                    onInput={(event) => onExamNoteChange(getAnalysisRecordIdentity(record), (event.currentTarget as HTMLTextAreaElement).value)}
                    placeholder="备注"
                  />
                </td>
                <td>
                  <button className="subject-link-button" type="button" onClick={() => onOpenExam(record)}>
                    <MaterialIcon name="open_in_new" />
                    打开考试
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CachedExamSelector({
  records,
  classificationRules,
  selectedKeys,
  onToggle,
  onToggleMany,
  onOpen
}: {
  records: CachedScoreRecord<ReportMainResponse>[];
  classificationRules: ExamClassificationRule[];
  selectedKeys: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
  onToggleMany: (keys: string[], checked: boolean) => void;
  onOpen: (record: CachedScoreRecord<ReportMainResponse>) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set());
  const [selectedClassifications, setSelectedClassifications] = useState<Set<string>>(() => new Set());
  const typeOptions = useMemo(
    () => Array.from(new Set(records.map((record) => record.examType).filter((type): type is string => Boolean(type))))
      .sort((left, right) => getExamTypeName(left).localeCompare(getExamTypeName(right), "zh-Hans-CN")),
    [records]
  );
  const classificationOptions = useMemo(
    () => buildClassificationOptions(records.map(cachedRecordToExamItem), classificationRules),
    [classificationRules, records]
  );
  const normalizedSearch = searchText.trim().toLocaleLowerCase("zh-Hans-CN");
  const filteredRecords = useMemo(
    () => records.filter((record) => {
      const matchesType = selectedTypes.size === 0 || (record.examType ? selectedTypes.has(record.examType) : false);
      const classificationLabels = getExamClassificationLabels(cachedRecordToExamItem(record), classificationRules);
      const matchesClassification = selectedClassifications.size === 0 || classificationLabels.some((label) => selectedClassifications.has(label));
      const searchableText = `${record.examName ?? record.examId} ${record.academicYearName ?? record.academicYear?.name ?? ""}`.toLocaleLowerCase("zh-Hans-CN");
      return matchesType && matchesClassification && (!normalizedSearch || searchableText.includes(normalizedSearch));
    }),
    [classificationRules, normalizedSearch, records, selectedClassifications, selectedTypes]
  );
  const selectedFilteredCount = filteredRecords.filter((record) => selectedKeys.has(getCachedExamIdentity(record))).length;
  const allFilteredSelected = filteredRecords.length > 0 && selectedFilteredCount === filteredRecords.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  return (
    <section className="md-card stack">
      <div className="spread">
        <div>
          <p className="breadcrumb">Local Cache</p>
          <h2 className="section-title">缓存成绩</h2>
          <p className="helper-text">可直接勾选本地缓存的考试参与分析，不会额外请求智学网。</p>
        </div>
        <span className="info-chip">已缓存 {records.length} 场</span>
      </div>
      {records.length > 0 ? (
        <>
          <div className="stack">
            <md-outlined-text-field
              label="搜索缓存考试"
              value={searchText}
              onInput={(event: Event) => setSearchText(valueFrom(event))}
            />
            <div className="filter-chip-grid" role="group" aria-label="缓存考试类型筛选">
              {typeOptions.map((type) => {
                const selected = selectedTypes.has(type);
                return (
                  <button className="filter-chip" type="button" data-selected={selected} key={type} onClick={() => setSelectedTypes(toggleSetValue(selectedTypes, type))}>
                    <MaterialIcon name={selected ? "check" : "add"} />
                    <span>{getExamTypeName(type)}</span>
                  </button>
                );
              })}
            </div>
            <div className="filter-chip-grid" role="group" aria-label="缓存考试分类筛选">
              {classificationOptions.map((label) => {
                const selected = selectedClassifications.has(label);
                return (
                  <button className="filter-chip" type="button" data-selected={selected} key={label} onClick={() => setSelectedClassifications(toggleSetValue(selectedClassifications, label))}>
                    <MaterialIcon name={selected ? "check" : "sell"} />
                    <span>{label}</span>
                  </button>
                );
              })}
              {classificationOptions.length === 0 ? <span className="info-chip">暂无分类标签</span> : null}
            </div>
            <div className="cluster">
              <span className="info-chip info-chip--strong">当前筛选 {filteredRecords.length} 场</span>
              <label className="select-all-control" data-disabled={filteredRecords.length === 0}>
                <md-checkbox
                  checked={allFilteredSelected}
                  indeterminate={someFilteredSelected}
                  disabled={filteredRecords.length === 0}
                  onInput={(event: Event) => onToggleMany(filteredRecords.map(getCachedExamIdentity), checkedFrom(event))}
                />
                <span>全选当前筛选结果</span>
              </label>
            </div>
          </div>
        <div className="exam-list">
          {filteredRecords.map((record) => {
            const key = getCachedExamIdentity(record);
            const checked = selectedKeys.has(key);
            return (
              <ExamCard
                title={record.examName ?? record.examId}
                metadata={[
                  record.examCreateDateTime ? formatDate(record.examCreateDateTime) : "日期未知",
                  record.academicYearName ?? record.academicYear?.name ?? "学年未知",
                  record.examType ? getExamTypeName(record.examType) : "类型未知",
                  ...getExamClassificationLabels(cachedRecordToExamItem(record), classificationRules)
                ]}
                status={`缓存于 ${formatCacheTime(record.cachedAt)}`}
                selected={checked}
                selectionLabel={`选择缓存考试 ${record.examName ?? record.examId}`}
                onToggle={(next) => onToggle(key, next)}
                onClick={() => onOpen(record)}
                key={key}
              />
            );
          })}
        </div>
          {filteredRecords.length === 0 ? <StatusAlert message="当前筛选条件下没有缓存考试。" /> : null}
        </>
      ) : (
        <StatusAlert message="暂无缓存成绩。查看一次考试详情或生成一次分析后，这里会出现可复用的成绩。" />
      )}
    </section>
  );
}

function AnalysisPlanSelector({
  plans,
  selectedPlanIds,
  onToggle,
  onDelete,
  onLoad,
  onSave
}: {
  plans: AnalysisPlan[];
  selectedPlanIds: Set<string>;
  onToggle: (planId: string, checked: boolean) => void;
  onDelete: (planId: string) => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  return (
    <section className="md-card stack">
      <div className="spread">
        <div>
          <p className="breadcrumb">Analysis Plan</p>
          <h2 className="section-title">分析方案</h2>
          <p className="helper-text">可多选方案并合并加载考试选择、缓存成绩和科目显示。</p>
        </div>
        <div className="cluster">
          <md-outlined-button disabled={selectedPlanIds.size === 0} onClick={onLoad}>加载所选方案</md-outlined-button>
          <md-filled-button onClick={onSave}>保存当前方案</md-filled-button>
        </div>
      </div>
      <AnalysisPlanChipGrid plans={plans} selectedPlanIds={selectedPlanIds} onToggle={onToggle} onDelete={onDelete} />
    </section>
  );
}

function AnalysisPlanChipGrid({
  plans,
  selectedPlanIds,
  onToggle,
  onDelete
}: {
  plans: AnalysisPlan[];
  selectedPlanIds: Set<string>;
  onToggle: (planId: string, checked: boolean) => void;
  onDelete: (planId: string) => void;
}) {
  if (plans.length === 0) {
    return <StatusAlert message="暂无已保存分析方案。" />;
  }

  return (
    <div className="plan-grid" role="group" aria-label="分析方案多选">
      {plans.map((plan) => {
        const checked = selectedPlanIds.has(plan.id);
        return (
          <article className="plan-item" data-selected={checked} key={plan.id}>
            <md-checkbox checked={checked} onInput={(event: Event) => onToggle(plan.id, checkedFrom(event))} />
            <span className="plan-item__body">
              <strong>{plan.name}</strong>
              <small>{plan.selectedExamKeys.length + plan.selectedCachedExamKeys.length} 场 · {formatCacheTime(plan.updatedAt)}</small>
            </span>
            <button className="icon-button" type="button" aria-label={`删除 ${plan.name}`} onClick={() => onDelete(plan.id)}>
              <MaterialIcon name="delete" />
            </button>
          </article>
        );
      })}
    </div>
  );
}

function AnalysisTemplatePanel({
  templates,
  selectedTemplateId,
  onLoad,
  onSave,
  onDelete
}: {
  templates: AnalysisTemplate[];
  selectedTemplateId: string | null;
  onLoad: (templateId: string) => void;
  onSave: () => void;
  onDelete: (templateId: string) => void;
}) {
  return (
    <section className="md-card stack">
      <div className="spread">
        <div>
          <p className="breadcrumb">Analysis Template</p>
          <h2 className="section-title">分析模板</h2>
          <p className="helper-text">模板按考试类型选择考试；应用时会自动勾选全部匹配的在线和缓存考试。</p>
        </div>
        <md-filled-button onClick={onSave}>保存当前模板</md-filled-button>
      </div>
      {templates.length > 0 ? (
        <div className="plan-grid" role="group" aria-label="分析模板">
          {templates.map((template) => (
            <article className="plan-item" data-selected={selectedTemplateId === template.id} key={template.id}>
              <button className="icon-button" type="button" aria-label={`加载 ${template.name}`} onClick={() => onLoad(template.id)}>
                <MaterialIcon name={selectedTemplateId === template.id ? "check" : "rule_settings"} />
              </button>
              <span className="plan-item__body">
                <strong>{template.name}</strong>
                <small>{template.selectedExamTypes.length ? template.selectedExamTypes.map(getExamTypeName).join("、") : "全部类型"} · {formatCacheTime(template.updatedAt)}</small>
              </span>
              <button className="icon-button" type="button" aria-label={`删除 ${template.name}`} onClick={() => onDelete(template.id)}>
                <MaterialIcon name="delete" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <StatusAlert message="暂无分析模板。保存后可按考试类型与分类快速选择考试。" />
      )}
    </section>
  );
}

function SettingsView({
  settings,
  analysisSettings,
  cacheStats,
  cacheHealth,
  onAnalysisSettingsChange,
  onCacheClear,
  onExportData,
  onHydrateCache,
  onOpenRules,
  isDemoMode,
  onEnterDemo,
  onChange
}: {
  settings: OwlSettings;
  analysisSettings: AnalysisInsightSettings;
  cacheStats: CacheStats | null;
  cacheHealth: CacheHealth;
  onAnalysisSettingsChange: (settings: AnalysisInsightSettings) => void;
  onCacheClear: (filter: { academicYearName?: string; examType?: string }) => void;
  onExportData: () => void;
  onHydrateCache: () => void;
  onOpenRules: () => void;
  isDemoMode: boolean;
  onEnterDemo: () => void;
  onChange: (next: Partial<OwlSettings>) => void;
}) {
  const unhealthyCount = cacheHealth.missingRank.length + cacheHealth.missingSubjectTrend.length + cacheHealth.missingMetadata.length;
  return (
    <div className="stack-lg">
      <section className="md-card demo-entry-card">
        <div>
          <p className="breadcrumb">Demo</p>
          <h2 className="section-title">{isDemoMode ? "演示数据已隔离" : "体验公开演示模式"}</h2>
          <p className="helper-text">{isDemoMode ? "分析方案、模板、备注和规则只保留在当前演示中；真实 IndexedDB 不会被读取或改写。" : "使用固定虚拟数据体验趋势分析、考试详情和作业资源，不需要连接智学网。"}</p>
        </div>
        {!isDemoMode ? <md-outlined-button onClick={onEnterDemo}>体验演示</md-outlined-button> : <span className="badge">仅本次有效</span>}
      </section>
      <section className="md-card stack">
        <div>
          <p className="breadcrumb">Theme</p>
          <h2 className="section-title">主题外观</h2>
          <p className="helper-text">选择预设主题或自定义 HCT 颜色；改动会即时应用。</p>
        </div>
        <ThemePicker settings={settings} onChange={onChange} />
      </section>
      <section className="md-card stack">
        <div>
          <p className="breadcrumb">Insights</p>
          <h2 className="section-title">分析设置</h2>
          <p className="helper-text">配置异常标记阈值，修改后会即时影响当前分析。</p>
        </div>
        <div className="target-grid">
          <label>
            <span>得分率突降阈值</span>
            <input type="number" min={1} value={analysisSettings.scoreDropThreshold} onInput={(event) => onAnalysisSettingsChange({ ...analysisSettings, scoreDropThreshold: clamp(Number((event.currentTarget as HTMLInputElement).value), 1, 100) })} />
          </label>
          <label>
            <span>班排退步阈值</span>
            <input type="number" min={1} value={analysisSettings.rankDropThreshold} onInput={(event) => onAnalysisSettingsChange({ ...analysisSettings, rankDropThreshold: clamp(Number((event.currentTarget as HTMLInputElement).value), 1, 9999) })} />
          </label>
        </div>
        <div className="spread rule-settings-entry">
          <div>
            <h3 className="card-title">考试关键词分类</h3>
            <p className="helper-text">已配置 {(analysisSettings.classificationRules ?? []).length} 条全局规则。</p>
          </div>
          <md-filled-button onClick={onOpenRules}>配置分类规则</md-filled-button>
        </div>
      </section>
      {!isDemoMode ? <><section className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Cache</p>
            <h2 className="section-title">缓存管理</h2>
            <p className="helper-text">成绩缓存、分析方案和备注均存储在本地 IndexedDB。</p>
          </div>
          <div className="record-chip-row">
            <span className="info-chip">成绩缓存 {cacheStats?.scoreRecordCount ?? 0} 条</span>
            <span className="info-chip">考试 {cacheStats?.reportMainCount ?? 0} 场</span>
            <span className="info-chip">约 {formatBytes(cacheStats?.estimatedBytes ?? 0)}</span>
          </div>
        </div>
        <div className="filter-chip-grid">
          {cacheStats?.academicYears.map((yearName) => (
            <button className="filter-chip" type="button" key={yearName} onClick={() => onCacheClear({ academicYearName: yearName })}>
              <MaterialIcon name="delete" />
              <span>清理 {yearName}</span>
            </button>
          ))}
          {cacheStats?.examTypes.map((examType) => (
            <button className="filter-chip" type="button" key={examType} onClick={() => onCacheClear({ examType })}>
              <MaterialIcon name="delete" />
              <span>清理 {getExamTypeName(examType)}</span>
            </button>
          ))}
        </div>
        <div className="cluster">
          <md-outlined-button onClick={onExportData}>导出 JSON</md-outlined-button>
          <md-outlined-button disabled={unhealthyCount === 0} onClick={onHydrateCache}>补全缓存</md-outlined-button>
          <md-filled-button onClick={() => onCacheClear({})}>清理全部成绩缓存</md-filled-button>
        </div>
      </section>
      <section className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Cache Health</p>
            <h2 className="section-title">缓存健康检查</h2>
            <p className="helper-text">识别缺少排名、科目趋势或考试元信息的本地缓存。</p>
          </div>
          <span className={`info-chip ${unhealthyCount > 0 ? "info-chip--strong" : ""}`}>{unhealthyCount > 0 ? `${unhealthyCount} 项待补全` : "状态良好"}</span>
        </div>
        <div className="md-grid metric-grid">
          <MetricCard label="缺少总分排名" value={String(cacheHealth.missingRank.length)} detail={formatHealthExamples(cacheHealth.missingRank)} />
          <MetricCard label="缺少科目趋势" value={String(cacheHealth.missingSubjectTrend.length)} detail={formatHealthExamples(cacheHealth.missingSubjectTrend)} />
          <MetricCard label="缺少元信息" value={String(cacheHealth.missingMetadata.length)} detail={formatHealthExamples(cacheHealth.missingMetadata)} />
        </div>
      </section></> : null}
    </div>
  );
}

function RuleSettingsView({
  rules,
  examTypes,
  exams,
  cachedExams,
  onBack,
  onSave
}: {
  rules: ExamClassificationRule[];
  examTypes: string[];
  exams: ExamListItem[];
  cachedExams: ExamListItem[];
  onBack: () => void;
  onSave: (rules: ExamClassificationRule[]) => void;
}) {
  const [draftRules, setDraftRules] = useState<ExamClassificationRule[]>(() => prepareRuleDrafts(rules));
  const rulePreviews = useMemo(() => buildRulePreview(exams, cachedExams, cleanRuleDrafts(draftRules)), [exams, cachedExams, draftRules]);
  const classificationConflicts = useMemo(() => detectClassificationConflicts([...exams, ...cachedExams], cleanRuleDrafts(draftRules)), [exams, cachedExams, draftRules]);

  useEffect(() => {
    setDraftRules(prepareRuleDrafts(rules));
  }, [rules]);

  function updateRule(ruleId: string, next: Partial<ExamClassificationRule>) {
    setDraftRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, ...next } : rule)));
  }

  function updateCondition(ruleId: string, conditionId: string, next: Partial<ExamClassificationCondition>) {
    setDraftRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              conditions: getRuleConditions(rule).map((condition) => (condition.id === conditionId ? { ...condition, ...next } : condition))
            }
          : rule
      )
    );
  }

  function addCondition(ruleId: string, conjunction: ExamClassificationCondition["conjunction"]) {
    setDraftRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              conditions: [...getRuleConditions(rule), createCondition(conjunction)]
            }
          : rule
      )
    );
  }

  function removeCondition(ruleId: string, conditionId: string) {
    setDraftRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              conditions: getRuleConditions(rule).filter((condition) => condition.id !== conditionId)
            }
          : rule
      )
    );
  }

  function addRule() {
    setDraftRules((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: `分类 ${current.length + 1}`,
        conditions: [createCondition("and")]
      }
    ]);
  }

  function removeRule(ruleId: string) {
    setDraftRules((current) => current.filter((rule) => rule.id !== ruleId));
  }

  return (
    <section className="stack-lg">
      <div className="spread">
        <div>
          <p className="breadcrumb">Classification</p>
          <h2 className="section-title">当考试匹配时...</h2>
          <p className="helper-text">规则为全局设置。每条规则命中后，分析页会显示对应分类的考试数量。</p>
        </div>
        <div className="cluster">
          <md-outlined-button onClick={onBack}>返回设置</md-outlined-button>
          <md-filled-button onClick={() => onSave(cleanRuleDrafts(draftRules))}>保存规则</md-filled-button>
        </div>
      </div>

      <div className="rule-builder-list">
        {draftRules.map((rule) => {
          const conditions = getRuleConditions(rule);
          return (
            <article className="md-card rule-builder" key={rule.id}>
              <div className="spread">
                <label className="rule-name-field">
                  <span>分类名称</span>
                  <ImeSafeInput value={rule.name} onValueChange={(name) => updateRule(rule.id, { name })} placeholder="例如：期中考试" />
                </label>
                <button className="icon-button" type="button" aria-label={`删除 ${rule.name}`} onClick={() => removeRule(rule.id)}>
                  <MaterialIcon name="delete" />
                </button>
              </div>

              {conditions.map((condition, index) => (
                <div className="rule-condition-row" key={condition.id}>
                  <label>
                    <span>字段</span>
                    <select value={condition.field} onChange={(event) => updateCondition(rule.id, condition.id, { field: event.currentTarget.value as ExamClassificationCondition["field"], operator: defaultOperatorForField(event.currentTarget.value as ExamClassificationCondition["field"]) })}>
                      <option value="examName">考试名称</option>
                      <option value="examType">考试类型</option>
                      <option value="examDate">考试日期</option>
                    </select>
                  </label>
                  <label>
                    <span>运算符</span>
                    <select value={condition.operator} onChange={(event) => updateCondition(rule.id, condition.id, { operator: event.currentTarget.value as ExamClassificationCondition["operator"] })}>
                      {operatorOptionsForField(condition.field).map((operator) => (
                        <option value={operator.value} key={operator.value}>{operator.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rule-value-field">
                    <span>值</span>
                    {condition.field === "examDate" ? (
                      <input type="date" value={condition.value} onChange={(event) => updateCondition(rule.id, condition.id, { value: event.currentTarget.value })} />
                    ) : (
                      <>
                        <ImeSafeInput list={condition.field === "examType" ? `exam-type-options-${rule.id}-${condition.id}` : undefined} value={condition.value} onValueChange={(value) => updateCondition(rule.id, condition.id, { value })} placeholder={condition.field === "examName" ? "例如：期中、卓越" : "例如：monthlyExam"} />
                        {condition.field === "examType" ? (
                          <datalist id={`exam-type-options-${rule.id}-${condition.id}`}>
                            {examTypes.map((examType) => (
                              <option value={examType} key={examType} label={getExamTypeName(examType)} />
                            ))}
                          </datalist>
                        ) : null}
                      </>
                    )}
                  </label>
                  <div className="rule-condition-actions">
                    <button type="button" onClick={() => addCondition(rule.id, "and")}>And</button>
                    <button type="button" onClick={() => addCondition(rule.id, "or")}>Or</button>
                    {conditions.length > 1 ? (
                      <button type="button" aria-label="删除条件" onClick={() => removeCondition(rule.id, condition.id)}>
                        <MaterialIcon name="close" />
                      </button>
                    ) : null}
                  </div>
                  {index > 0 ? <span className="rule-connector">{condition.conjunction.toUpperCase()}</span> : null}
                </div>
              ))}

              <div className="spread">
                <span className="helper-text">表达式预览</span>
                <button className="text-link" type="button" onClick={() => addCondition(rule.id, "and")}>编辑表达式</button>
              </div>
              <pre className="expression-preview">{buildRuleExpression(rule)}</pre>
            </article>
          );
        })}
      </div>

      {draftRules.length === 0 ? <StatusAlert message="暂无分类规则。新增规则后，分析页会显示各分类命中的考试数量。" /> : null}
      <md-filled-button onClick={addRule}>新增规则</md-filled-button>
      <RulePreviewSection previews={rulePreviews} conflicts={classificationConflicts} />
    </section>
  );
}

function RulePreviewSection({ previews, conflicts }: { previews: RulePreview[]; conflicts: ClassificationConflict[] }) {
  return (
    <section className="md-card stack">
      <div className="spread">
        <div>
          <p className="breadcrumb">Preview</p>
          <h2 className="section-title">命中预览</h2>
          <p className="helper-text">预览只使用已加载考试和本地缓存成绩，不会主动请求智学网。</p>
        </div>
        <span className={`info-chip ${conflicts.length > 0 ? "info-chip--strong" : ""}`}>
          {conflicts.length > 0 ? `${conflicts.length} 场多分类` : "无冲突"}
        </span>
      </div>
      {previews.length > 0 ? (
        <div className="rule-preview-grid">
          {previews.map((preview) => (
            <article className="rule-preview-card" key={preview.ruleId}>
              <div className="spread">
                <strong>{preview.ruleName}</strong>
                <span className="info-chip info-chip--strong">{preview.count} 场</span>
              </div>
              <p className="helper-text">
                类型 {preview.examTypes.length || "暂无"} · 学年 {preview.academicYears.length || "暂无"}
              </p>
              <div className="record-chip-row">
                {preview.recentExams.length > 0 ? preview.recentExams.map((exam) => (
                  <span className="info-chip" key={`${exam.academicYearKey ?? ""}::${exam.examId}`}>{exam.examName}</span>
                )) : <span className="info-chip">暂无命中</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <StatusAlert message="暂无规则可预览。" />
      )}
      {conflicts.length > 0 ? (
        <div className="anomaly-list">
          {conflicts.slice(0, 8).map((conflict) => (
            <article className="anomaly-item" data-severity="warning" key={conflict.examKey}>
              <MaterialIcon name="label_important" />
              <span>{conflict.examName} 同时命中 {conflict.labels.join("、")}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ImeSafeInput({
  value,
  list,
  placeholder,
  onValueChange
}: {
  value: string;
  list?: string;
  placeholder?: string;
  onValueChange: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) {
      setDraftValue(value);
    }
  }, [value]);

  return (
    <input
      list={list}
      value={draftValue}
      placeholder={placeholder}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const next = event.currentTarget.value;
        setDraftValue(next);
        onValueChange(next);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraftValue(next);
        if (!composingRef.current) {
          onValueChange(next);
        }
      }}
      onBlur={() => onValueChange(draftValue)}
    />
  );
}

function prepareRuleDrafts(rules: ExamClassificationRule[]): ExamClassificationRule[] {
  return rules.map((rule) => ({ ...rule, conditions: getRuleConditions(rule) }));
}

function cleanRuleDrafts(rules: ExamClassificationRule[]): ExamClassificationRule[] {
  return rules
    .map((rule) => ({
      id: rule.id,
      name: rule.name.trim() || "未命名分类",
      conditions: getRuleConditions(rule)
        .map((condition, index) => ({
          ...condition,
          conjunction: index === 0 ? "and" as const : condition.conjunction,
          value: condition.value.trim()
        }))
        .filter((condition) => condition.value)
    }))
    .filter((rule) => rule.conditions.length > 0);
}

function getRuleConditions(rule: ExamClassificationRule): ExamClassificationCondition[] {
  if (rule.conditions?.length) return rule.conditions;
  const conditions: ExamClassificationCondition[] = [];
  if (rule.nameIncludes) conditions.push({ id: crypto.randomUUID(), field: "examName", operator: "contains", value: rule.nameIncludes, conjunction: "and" });
  if (rule.examType) conditions.push({ id: crypto.randomUUID(), field: "examType", operator: "equals", value: rule.examType, conjunction: "and" });
  if (rule.dateFrom) conditions.push({ id: crypto.randomUUID(), field: "examDate", operator: "after", value: rule.dateFrom, conjunction: "and" });
  if (rule.dateTo) conditions.push({ id: crypto.randomUUID(), field: "examDate", operator: "before", value: rule.dateTo, conjunction: "and" });
  return conditions.length > 0 ? conditions : [createCondition("and")];
}

function createCondition(conjunction: ExamClassificationCondition["conjunction"]): ExamClassificationCondition {
  return {
    id: crypto.randomUUID(),
    field: "examName",
    operator: "contains",
    value: "",
    conjunction
  };
}

function defaultOperatorForField(field: ExamClassificationCondition["field"]): ExamClassificationCondition["operator"] {
  if (field === "examDate") return "after";
  if (field === "examType") return "equals";
  return "contains";
}

function operatorOptionsForField(field: ExamClassificationCondition["field"]): Array<{ value: ExamClassificationCondition["operator"]; label: string }> {
  if (field === "examDate") {
    return [
      { value: "after", label: "不早于" },
      { value: "before", label: "不晚于" },
      { value: "equals", label: "等于" }
    ];
  }
  return [
    { value: "contains", label: "包含" },
    { value: "notContains", label: "不包含" },
    { value: "equals", label: "等于" }
  ];
}

function buildRuleExpression(rule: ExamClassificationRule): string {
  return getRuleConditions(rule)
    .map((condition, index) => `${index === 0 ? "" : ` ${condition.conjunction.toUpperCase()} `}(${fieldLabel(condition.field)} ${operatorLabel(condition.operator)} "${condition.value || ""}")`)
    .join("");
}

function fieldLabel(field: ExamClassificationCondition["field"]): string {
  if (field === "examType") return "exam.type";
  if (field === "examDate") return "exam.date";
  return "exam.name";
}

function operatorLabel(operator: ExamClassificationCondition["operator"]): string {
  if (operator === "contains") return "contains";
  if (operator === "notContains") return "not contains";
  if (operator === "equals") return "equals";
  if (operator === "after") return ">=";
  return "<=";
}

function ThemePicker({ settings, onChange }: { settings: OwlSettings; onChange: (next: Partial<OwlSettings>) => void }) {
  const [prideOpen, setPrideOpen] = useState(false);
  const [selectedPrideFlag, setSelectedPrideFlag] = useState<(typeof prideThemeFlags)[number]["id"]>("trans");
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customDraftColor, setCustomDraftColor] = useState(() => hctStateFromHex(resolveThemeSeed(settings.themeSeedColor)));
  const restoreSettingsRef = useRef<OwlSettings | null>(null);
  const prideSegmentsRef = useRef<HTMLDivElement | null>(null);
  const activePreset = settings.themePreset || inferThemePreset(settings.themeSeedColor);
  const standardPresets = themePresets.filter((preset) => preset.group === "standard");
  const pridePresets = themePresets.filter((preset) => preset.group === "pride" && preset.prideFlag === selectedPrideFlag);
  const hctGradients = useMemo(() => hctSliderGradients(customDraftColor.hex), [customDraftColor.hex]);
  const customDraftRgb = useMemo(() => rgbFromHex(customDraftColor.hex), [customDraftColor.hex]);
  const customDraftHexIsInvalid = !isValidHexColor(customDraftColor.hex);

  function selectPreset(themePreset: string, themeSeedColor: string) {
    onChange({ themePreset, themeSeedColor });
  }

  function openCustomDialog() {
    restoreSettingsRef.current = settings;
    setCustomDraftColor(hctStateFromHex(resolveThemeSeed(settings.themeSeedColor)));
    setCustomDialogOpen(true);
  }

  function closeCustomDialog(apply: boolean) {
    if (apply) {
      onChange({ themePreset: customThemePresetId, themeSeedColor: customDraftColor.hex });
    } else if (restoreSettingsRef.current) {
      applyTheme(restoreSettingsRef.current);
    }
    setCustomDialogOpen(false);
  }

  function previewDraft(hex: string) {
    const normalized = normalizeHexColor(hex);
    if (!isValidHexColor(normalized)) return;
    setCustomDraftColor(hctStateFromHex(normalized));
    applyTheme({ ...settings, themePreset: customThemePresetId, themeSeedColor: normalized });
  }

  function updateDraftHct(next: Partial<Pick<typeof customDraftColor, "hue" | "chroma" | "tone">>) {
    const hue = next.hue ?? customDraftColor.hue;
    const chroma = next.chroma ?? customDraftColor.chroma;
    const tone = next.tone ?? customDraftColor.tone;
    previewDraft(hctToHex(hue, chroma, tone));
  }

  function updateDraftHex(value: string) {
    previewDraft(`#${value.replace(/^#/, "")}`);
  }

  function updateDraftRgb(channel: "r" | "g" | "b", value: string) {
    const next = {
      ...customDraftRgb,
      [channel]: clamp(Number(value), 0, 255)
    };
    previewDraft(rgbToHex(next.r, next.g, next.b));
  }

  function scrollPrideFlags(direction: "left" | "right") {
    prideSegmentsRef.current?.scrollBy({
      left: direction === "left" ? -220 : 220,
      behavior: "smooth"
    });
  }

  return (
    <div className="theme-settings">
      <div className="theme-preset-section">
        <div className="theme-preset-row">
          <div className="theme-preset-grid" role="radiogroup" aria-label="主题预设颜色">
            {standardPresets.map((preset) => (
              <button
                className="theme-preset-circle"
                style={{ "--theme-preset-color": preset.seedColor, "--theme-preset-background": preset.seedColor } as React.CSSProperties}
                data-selected={activePreset === preset.id}
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={activePreset === preset.id}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => selectPreset(preset.id, preset.seedColor)}
              />
            ))}
          </div>
          <div className="theme-preset-actions" aria-label="更多主题选项">
            <button className="theme-action-circle" type="button" aria-expanded={prideOpen} aria-controls="pride-color-panel" aria-label="Pride Color" title="Pride Color" onClick={() => setPrideOpen((value) => !value)}>
              <MaterialIcon name="question_mark" />
            </button>
            <button className="theme-action-circle" type="button" aria-label="自定义主题色" title="自定义主题色" data-selected={activePreset === customThemePresetId} onClick={openCustomDialog}>
              <MaterialIcon name="palette" />
            </button>
          </div>
        </div>
      </div>

      <section className="theme-preset-popover" id="pride-color-panel" aria-label="Pride Color" data-open={prideOpen} inert={!prideOpen ? true : undefined}>
        <div className="theme-preset-panel-title">
          <span>Pride Color</span>
          <button className="theme-panel-close" type="button" onClick={() => setPrideOpen(false)} aria-label="收起 Pride Color">
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="pride-picker">
          <div className="pride-scroll-hint">
            <MaterialIcon name="swipe" />
            <span>横向滚动查看更多旗帜</span>
          </div>
          <div className="pride-flag-scroll">
            <button className="pride-scroll-button" type="button" aria-label="向左查看更多 Pride 旗帜" onClick={() => scrollPrideFlags("left")}>
              <MaterialIcon name="chevron_left" />
            </button>
            <div ref={prideSegmentsRef} className="pride-flag-segments" role="tablist" aria-label="选择 Pride 旗帜">
              {prideThemeFlags.map((flag) => (
                <button type="button" role="tab" aria-selected={selectedPrideFlag === flag.id} data-selected={selectedPrideFlag === flag.id} onClick={() => setSelectedPrideFlag(flag.id)} key={flag.id}>
                  {flag.name}
                </button>
              ))}
            </div>
            <button className="pride-scroll-button" type="button" aria-label="向右查看更多 Pride 旗帜" onClick={() => scrollPrideFlags("right")}>
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
          <div className="theme-preset-grid theme-preset-grid--compact" role="radiogroup" aria-label={`Pride Color ${selectedPrideFlag}`}>
            {pridePresets.map((preset) => (
              <button
                className="theme-preset-circle"
                style={{ "--theme-preset-color": preset.seedColor, "--theme-preset-background": preset.seedColor } as React.CSSProperties}
                data-selected={activePreset === preset.id}
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={activePreset === preset.id}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => selectPreset(preset.id, preset.seedColor)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="custom-theme-row">
        <span className="custom-color-readout" style={{ "--theme-preset-color": resolveThemeSeed(settings.themeSeedColor) } as React.CSSProperties}>
          {resolveThemeSeed(settings.themeSeedColor).toUpperCase()}
        </span>
        <md-outlined-button onClick={() => onChange(defaultSettings)}>恢复默认主题</md-outlined-button>
      </div>
      <div className="theme-mode-row">
        <div>
          <h3 className="card-title">颜色模式</h3>
          <p className="helper-text">默认跟随系统，也可以固定为浅色或深色。</p>
        </div>
        <md-filled-select value={settings.colorMode ?? "system"} onInput={(event: Event) => onChange({ colorMode: valueFrom(event) as OwlSettings["colorMode"] })}>
          <md-select-option value="system">
            <div slot="headline">跟随系统</div>
          </md-select-option>
          <md-select-option value="light">
            <div slot="headline">浅色</div>
          </md-select-option>
          <md-select-option value="dark">
            <div slot="headline">深色</div>
          </md-select-option>
        </md-filled-select>
      </div>

      {createPortal(
        <md-dialog className="app-dialog hct-dialog" open={customDialogOpen} onClosed={() => setCustomDialogOpen(false)} onClose={() => setCustomDialogOpen(false)} onCancel={() => closeCustomDialog(false)}>
          <div slot="headline">HCT 颜色选择</div>
          <div slot="content" className="hct-color-dialog">
            <div className="hct-color-preview" style={{ background: customDraftColor.hex }} aria-hidden="true" />
            <div className="hct-field-grid">
              <label className="hex-field" data-error={customDraftHexIsInvalid}>
                <span>HEX</span>
                <div className="hex-input-shell">
                  <span aria-hidden="true">#</span>
                  <input aria-invalid={customDraftHexIsInvalid} aria-label="HEX" value={customDraftColor.hex.replace(/^#/, "")} maxLength={6} onInput={(event) => updateDraftHex((event.currentTarget as HTMLInputElement).value)} />
                </div>
                {customDraftHexIsInvalid ? <small>请输入 #RRGGBB 格式</small> : null}
              </label>
              <div className="rgb-field" aria-label="RGB">
                <span>RGB</span>
                <div className="rgb-inputs">
                  <input aria-label="Red" inputMode="numeric" maxLength={3} value={customDraftRgb.r} onInput={(event) => updateDraftRgb("r", (event.currentTarget as HTMLInputElement).value)} />
                  <input aria-label="Green" inputMode="numeric" maxLength={3} value={customDraftRgb.g} onInput={(event) => updateDraftRgb("g", (event.currentTarget as HTMLInputElement).value)} />
                  <input aria-label="Blue" inputMode="numeric" maxLength={3} value={customDraftRgb.b} onInput={(event) => updateDraftRgb("b", (event.currentTarget as HTMLInputElement).value)} />
                </div>
              </div>
            </div>
            <HctSlider label="Hue" min={0} max={360} value={customDraftColor.hue} gradient={hctGradients.hue} onChange={(hue) => updateDraftHct({ hue })} />
            <HctSlider label="Chroma" min={0} max={150} value={customDraftColor.chroma} gradient={hctGradients.chroma} onChange={(chroma) => updateDraftHct({ chroma })} />
            <HctSlider label="Tone" min={0} max={100} value={customDraftColor.tone} gradient={hctGradients.tone} onChange={(tone) => updateDraftHct({ tone })} />
          </div>
          <div slot="actions">
            <md-text-button onClick={() => closeCustomDialog(false)}>取消</md-text-button>
            <md-filled-button onClick={() => closeCustomDialog(true)}>应用</md-filled-button>
          </div>
        </md-dialog>,
        document.body
      )}
    </div>
  );
}

function HctSlider({
  label,
  min,
  max,
  value,
  gradient,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  gradient: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="hct-slider" style={{ "--hct-slider-track": gradient } as React.CSSProperties}>
      <span>{label}</span>
      <input className="hct-slider__value" type="number" min={min} max={max} value={value} onInput={(event) => onChange(Number((event.currentTarget as HTMLInputElement).value))} />
      <input className="hct-slider__range" type="range" min={min} max={max} value={value} onInput={(event) => onChange(Number((event.currentTarget as HTMLInputElement).value))} />
    </label>
  );
}

function LoadingStateView({ state }: { state: Extract<LoadingState, { kind: "loading" }> }) {
  const percent =
    typeof state.current === "number" && typeof state.total === "number" && state.total > 0
      ? Math.round((state.current / state.total) * 100)
      : null;

  return (
    <section className="md-card empty-card" aria-live="polite">
      <md-circular-progress indeterminate />
      <h2>数据加载中</h2>
      <p>{state.message}</p>
      {percent !== null ? (
        <div className="progress-bar labeled">
          <span style={{ width: `${percent}%` }} />
          <strong>{percent}%</strong>
        </div>
      ) : null}
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="md-card error-state" role="alert">
      <MaterialIcon name="error" />
      <h2>操作失败</h2>
      <p>{message}</p>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="md-card metric-card">
      <p className="breadcrumb">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </section>
  );
}

function ChartCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="md-card chart-card">
      <div className="chart-card__header">
        <h2 className="section-title">{title}</h2>
        {action ? <div className="chart-card__action">{action}</div> : null}
      </div>
      <div className="chart-frame">{children}</div>
    </section>
  );
}

function MetricSwitch({ value, onChange }: { value: AnalysisMetric; onChange: (metric: AnalysisMetric) => void }) {
  return (
    <div className="segmented-control" role="group" aria-label="图表指标">
      <button type="button" data-selected={value === "percentage"} onClick={() => onChange("percentage")}>
        得分率
      </button>
      <button type="button" data-selected={value === "classRank"} onClick={() => onChange("classRank")}>
        班级排名
      </button>
    </div>
  );
}

function SubjectDetailPage({
  detail,
  metric,
  onMetricChange,
  onBack
}: {
  detail: SubjectDetailState;
  metric: AnalysisMetric;
  onMetricChange: (metric: AnalysisMetric) => void;
  onBack: () => void;
}) {
  if (!detail) {
    return (
      <section className="md-card empty-card">
        <MaterialIcon name="subject" />
        <h2>暂无单科数据</h2>
        <md-filled-button onClick={onBack}>返回</md-filled-button>
      </section>
    );
  }

  const subject = detail.subject;
  const trend = buildMetricSeriesFromSubjectTrend(detail.trend, metric);

  return (
    <section className="stack-lg" aria-label="单科详情">
      <div className="spread">
        <div>
          <p className="breadcrumb">{subject.examName}</p>
          <h2 className="section-title">{subject.subjectName}</h2>
        </div>
        <div className="cluster">
          <md-outlined-button onClick={onBack}>返回</md-outlined-button>
        </div>
      </div>
      <div className="md-grid metric-grid">
        <MetricCard label="单科成绩" value={`${subject.score}/${subject.standardScore}`} detail={`得分率 ${subject.percentage}%`} />
        <MetricCard label="等第" value={subject.level ?? "未知"} detail="来自智学网报告" />
        <MetricCard label="班级排名" value={detail.rankLabel ?? "暂无"} detail="按当前排名数据估算" />
      </div>
      {trend.length > 0 ? (
        <ChartCard title={`${subject.subjectName}${metricLabel(metric)}趋势`} action={<MetricSwitch value={metric} onChange={onMetricChange} />}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={metric === "percentage" ? [0, 100] : ["dataMin", "dataMax"]} reversed={metric === "classRank"} tickFormatter={(value) => formatAxisTick(Number(value), metric)} />
              <Tooltip formatter={(_, __, item) => [(item.payload as MetricPoint).display, metricLabel(metric)]} labelFormatter={(label) => findExamName(trend, String(label))} />
              <Line type="monotone" dataKey="value" stroke="var(--md-sys-color-primary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
    </section>
  );
}

const chartColors = ["#1a53d6", "#006b5f", "#b65d00", "#7257b8", "#ba1a1a", "#0077b6", "#8a5a00", "#2f6f4e"];

function buildCombinedSubjectChartData(
  series: Record<string, MetricPoint[]>,
  totalSeries: MetricPoint[]
): Array<Record<string, string | number | null>> {
  const rows: Record<string, Record<string, string | number | null>> = {};

  totalSeries.forEach((point) => {
    rows[point.key] = { key: point.key, examId: point.examId, label: point.label, examName: point.examName };
  });

  Object.entries(series).forEach(([subjectName, points]) => {
    points.forEach((point) => {
      rows[point.key] ??= { key: point.key, examId: point.examId, label: point.label, examName: point.examName };
      rows[point.key][subjectName] = point.value;
      rows[point.key][`${subjectName}__display`] = point.display;
    });
  });

  return totalSeries.map((point) => rows[point.key]).filter((row): row is Record<string, string | number | null> => Boolean(row));
}

function findExamName(points: Array<{ label: string; examName: string }>, label: string): string {
  return points.find((point) => point.label === label)?.examName ?? label;
}

function getSubjectMetricDisplay(
  payload: Record<string, unknown>,
  subjectName: string,
  value: unknown,
  metric: AnalysisMetric
): string {
  const display = payload[`${subjectName}__display`];
  if (typeof display === "string") return display;
  return typeof value === "number" ? formatMetricValue(value, metric) : "暂无";
}

function buildMetricSeriesFromSubjectTrend(points: SubjectTrendPoint[], metric: AnalysisMetric): MetricPoint[] {
  return points.map((point) => ({
    key: point.key,
    examId: point.examId,
    examName: point.examName,
    academicYearName: point.academicYearName,
    label: point.label,
    value: metric === "classRank" ? point.classRank : point.percentage,
    display: metric === "classRank" ? formatRankValue(point.classRank, point.classRankTotal) : formatMetricValue(point.percentage, "percentage")
  }));
}

function buildSubjectDetailFromExamDetail(
  detail: ExamDetailViewModel | null,
  paper: PaperScore,
  records: AnalysisExamRecord[]
): SubjectDetailState {
  if (!detail) return null;

  const score = Number(paper.userScore);
  const standardScore = Number(paper.standardScore);
  if (!Number.isFinite(score) || !Number.isFinite(standardScore) || standardScore <= 0) return null;

  const rankInfo = getSubjectClassRankInfo(paper.paperId, detail.subjectLevelTrend);
  const subject: AnalysisSubjectRecord = {
    examId: detail.examId,
    examName: detail.examName,
    examCreateDateTime: detail.examCreateDateTime ?? Date.now(),
    examType: detail.examType,
    academicYearName: detail.academicYearName,
    paperId: paper.paperId,
    subjectName: paper.subjectName,
    score,
    standardScore,
    percentage: Math.round((score / standardScore) * 1000) / 10,
    classRank: rankInfo,
    level: paper.userLevel
  };

  return {
    subject,
    trend: buildSubjectTrendForName(subject.subjectName, records),
    sourceView: "exams",
    rankLabel: rankInfo ? `${rankInfo.rank}/${rankInfo.total}` : undefined
  };
}

function buildSubjectDetailFromAnalysis(subject: AnalysisSubjectRecord, records: AnalysisExamRecord[], sourceView: "analysis" | "exams"): SubjectDetailState {
  return {
    subject,
    trend: buildSubjectTrendForName(subject.subjectName, records),
    sourceView,
    rankLabel: subject.classRank ? `${subject.classRank.rank}/${subject.classRank.total}` : undefined
  };
}

function buildSubjectTrendForName(subjectName: string, records: AnalysisExamRecord[]): SubjectTrendPoint[] {
  return buildSubjectSeries(records)[subjectName] ?? [];
}

function cachedRecordToExamItem(record: CachedScoreRecord<ReportMainResponse>): ExamListItem {
  const academicYear = record.academicYear ?? {
    name: record.academicYearName ?? "缓存学年",
    beginTime: "unknown",
    endTime: "unknown"
  };
  const academicYearKey = record.academicYearKey ?? getAcademicYearKey(academicYear);

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

function getAnalysisRecordIdentity(record: AnalysisExamRecord): string {
  return `${record.academicYearKey ?? ""}::${record.examId}`;
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function setCheckedValue(current: Set<string>, value: string, checked: boolean): Set<string> {
  const next = new Set(current);
  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}

function sortExamItems(exams: ExamListItem[]): ExamListItem[] {
  return sortByExamTimeDesc(exams);
}

function getExamSelectionKey(exam: ExamListItem): string {
  return `${exam.academicYearKey}::${exam.examId}`;
}

function buildCacheHealth(reportRecords: CachedScoreRecord<ReportMainResponse>[], allRecords: CachedScoreRecord[]): CacheHealth {
  const keySet = new Set(allRecords.map((record) => record.key).filter((key): key is string => Boolean(key)));
  return {
    missingRank: reportRecords.filter((record) =>
      !keySet.has(buildScoreCacheKey({ academicYearKey: getRecordAcademicYearKey(record), examId: record.examId, detailType: "getLevelTrend" }))
    ),
    missingSubjectTrend: reportRecords.filter((record) => {
      const academicYearKey = getRecordAcademicYearKey(record);
      return (record.data.result?.paperList ?? []).some((paper) =>
        !keySet.has(buildScoreCacheKey({ academicYearKey, examId: record.examId, detailType: "getSubjectLevelTrend", paperId: paper.paperId }))
      );
    }),
    missingMetadata: reportRecords.filter((record) => !record.examType || !record.examCreateDateTime || !record.academicYearName)
  };
}

function getRecordAcademicYearKey(record: CachedScoreRecord): string {
  return record.academicYearKey ?? (record.academicYear ? getAcademicYearKey(record.academicYear) : "unknown-year");
}

function buildExamComparisonSummary(records: AnalysisExamRecord[], metric: AnalysisMetric, anomalies: AnalysisAnomaly[]): Array<{ label: string; value: string; strong?: boolean }> {
  const sorted = sortByExamTimeAsc(records);
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.at(-2) ?? null;
  if (!latest) return [{ label: "状态", value: "暂无分析数据" }];

  const latestValue = metric === "classRank" ? latest.classRank?.rank ?? null : latest.percentage;
  const previousValue = previous ? (metric === "classRank" ? previous.classRank?.rank ?? null : previous.percentage) : null;
  const totalDelta = typeof latestValue === "number" && typeof previousValue === "number"
    ? roundMetric(metric === "classRank" ? previousValue - latestValue : latestValue - previousValue)
    : null;
  const subjectDeltas = previous
    ? latest.subjects
        .map((subject) => {
          const previousSubject = previous.subjects.find((item) => item.subjectName === subject.subjectName);
          if (!previousSubject) return null;
          const current = metric === "classRank" ? subject.classRank?.rank ?? null : subject.percentage;
          const before = metric === "classRank" ? previousSubject.classRank?.rank ?? null : previousSubject.percentage;
          if (typeof current !== "number" || typeof before !== "number") return null;
          return {
            subjectName: subject.subjectName,
            delta: roundMetric(metric === "classRank" ? before - current : current - before)
          };
        })
        .filter((item): item is { subjectName: string; delta: number } => Boolean(item))
    : [];
  const bestSubject = subjectDeltas
    .filter((item) => item.delta > 0)
    .reduce<{ subjectName: string; delta: number } | null>((best, item) => (!best || item.delta > best.delta ? item : best), null);
  const worstSubject = subjectDeltas
    .filter((item) => item.delta < 0)
    .reduce<{ subjectName: string; delta: number } | null>((worst, item) => (!worst || item.delta < worst.delta ? item : worst), null);

  return [
    { label: "最近考试", value: latest.examName, strong: true },
    { label: metric === "classRank" ? "班排变化" : "总分变化", value: totalDelta === null ? "暂无" : formatDelta(totalDelta) },
    { label: "提升最多", value: bestSubject ? `${bestSubject.subjectName} ${formatDelta(bestSubject.delta)}` : "暂无提升" },
    { label: "下降最多", value: worstSubject ? `${worstSubject.subjectName} ${formatDelta(worstSubject.delta)}` : "暂无下降", strong: Boolean(worstSubject) },
    { label: "异常标记", value: `${anomalies.length} 条`, strong: anomalies.length > 0 }
  ];
}

function groupAnomaliesByExam(anomalies: AnalysisAnomaly[]): Array<{ examKey: string; examName: string; items: AnalysisAnomaly[] }> {
  const groups = new Map<string, { examKey: string; examName: string; items: AnalysisAnomaly[] }>();
  anomalies.forEach((anomaly) => {
    const group = groups.get(anomaly.examKey) ?? { examKey: anomaly.examKey, examName: anomaly.examName, items: [] };
    group.items.push(anomaly);
    groups.set(anomaly.examKey, group);
  });
  return Array.from(groups.values());
}

function formatHealthExamples(records: CachedScoreRecord<ReportMainResponse>[]): string {
  if (records.length === 0) return "暂无";
  return records.slice(0, 2).map((record) => record.examName ?? record.examId).join("、");
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatCacheTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "缓存时间未知";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatNullable(value: number | null): string {
  return value === null ? "暂无" : String(value);
}

function formatDelta(value: number | null): string {
  if (value === null) return "暂无";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function mergeAnalysisNotes(plans: AnalysisPlan[]): string {
  return plans
    .filter((plan) => plan.note.trim())
    .map((plan) => `【${plan.name}】\n${plan.note.trim()}`)
    .join("\n\n");
}

function getPlanInsightSettings(settings: AnalysisInsightSettings): AnalysisInsightSettings {
  return {
    scoreDropThreshold: settings.scoreDropThreshold,
    rankDropThreshold: settings.rankDropThreshold
  };
}

function metricLabel(metric: AnalysisMetric): string {
  return metric === "classRank" ? "班级排名" : "得分率";
}

function formatAxisTick(value: number, metric: AnalysisMetric): string {
  return metric === "classRank" ? String(value) : `${value}%`;
}

function formatMetricValue(value: number | null, metric: AnalysisMetric): string {
  if (value === null || Number.isNaN(value)) return "暂无";
  return metric === "classRank" ? String(value) : `${value}%`;
}

function formatRankValue(rank: number | null, total?: number): string {
  if (rank === null || Number.isNaN(rank)) return "暂无";
  return total ? `${rank}/${total}` : String(rank);
}

function formatRankInfo(rankInfo: AnalysisExamRecord["classRank"] | AnalysisSubjectRecord["classRank"]): string {
  if (!rankInfo) return "暂无";
  return `${rankInfo.rank}/${rankInfo.total ?? "?"}`;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function valueFrom(event: Event | React.FormEvent<HTMLElement>): string {
  return String((event.currentTarget as HTMLElement & { value?: string }).value ?? "");
}

function checkedFrom(event: Event | React.FormEvent<HTMLElement>): boolean {
  return Boolean((event.currentTarget as HTMLElement & { checked?: boolean }).checked);
}

function getAcademicYearKey(year: AcademicYear): string {
  return year.code ?? `${year.beginTime}-${year.endTime}-${year.name}`;
}

function isConnectableZhixueTab(tab: chrome.tabs.Tab): boolean {
  try {
    return new URL(tab.url ?? "").hostname === "www.zhixue.com";
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logHomeworkError(stage: string, action: string, tabId: number, errorType: string, error: unknown): void {
  console.error("[Owl Insight][homework] request failed", {
    module: "homework",
    stage,
    action,
    tabId,
    errorType,
    message: getErrorMessage(error),
    time: new Date().toISOString()
  });
}

function isMissingMessageReceiver(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("receiving end does not exist") || message.includes("could not establish connection");
}

function getHomeworkErrorType(error: unknown): string {
  if (!(error instanceof Error)) return "HOMEWORK_REQUEST_FAILED";
  if (error.name === "BACKGROUND_UNREACHABLE" || error.name === "CORS_RULE_UNAVAILABLE" || error.name === "CORS_RULE_SETUP_FAILED") {
    return error.name;
  }
  return "HOMEWORK_REQUEST_FAILED";
}

function isCorsRuleError(error: unknown): boolean {
  return error instanceof Error && (error.name === "CORS_RULE_UNAVAILABLE" || error.name === "CORS_RULE_SETUP_FAILED");
}

function isHomeworkAction(action: ExtensionRequest["action"]): boolean {
  return action === "getHomeworkSubjects" || action === "getHomeworkList" || action === "getHomeworkResources";
}

function hctStateFromHex(hex: string) {
  const normalized = resolveThemeSeed(hex);
  const hct = Hct.fromInt(argbFromHex(normalized));
  return {
    hex: normalized,
    hue: Math.round(hct.hue),
    chroma: Math.round(hct.chroma),
    tone: Math.round(hct.tone)
  };
}

function hctToHex(hue: number, chroma: number, tone: number): string {
  return hexFromArgb(Hct.from(hue, chroma, tone).toInt());
}

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const normalized = resolveThemeSeed(hex).replace(/^#/, "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function hctSliderGradients(hex: string) {
  const safeHex = resolveThemeSeed(hex);
  const palette = CorePalette.of(argbFromHex(safeHex));
  const tones = Array.from({ length: 101 }, (_, tone) => {
    const color = hexFromArgb(palette.a1.tone(tone));
    return `${color} ${tone}%`;
  });
  return {
    hue:
      "linear-gradient(to right, #e7007d 0%, #d84200 10%, #a56a00 20%, #7f7a00 30%, #008b18 40%, #008673 50%, #008398 60%, #007bc8 70%, #695fff 80%, #c400f6 90%, #e60080 100%)",
    chroma: `linear-gradient(to right, #777777 0%, ${hexFromArgb(palette.a1.tone(50))} 70%)`,
    tone: `linear-gradient(to right, ${tones.join(",")})`
  };
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

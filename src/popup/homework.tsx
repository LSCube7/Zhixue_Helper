import { useEffect, useMemo, useRef, useState } from "react";

import type {
  HomeworkItem,
  HomeworkListPage,
  HomeworkResource,
  HomeworkStatus,
  HomeworkSubject
} from "../shared/types";
import { MaterialIcon } from "./icons";

const PAGE_SIZE = 20;

export function HomeworkView({
  onLoadSubjects,
  onLoadList,
  onLoadResources
}: {
  onLoadSubjects: () => Promise<HomeworkSubject[]>;
  onLoadList: (input: { status: HomeworkStatus; subjectCode: string; pageSize: number; createTime?: number }) => Promise<HomeworkListPage>;
  onLoadResources: (homework: HomeworkItem) => Promise<HomeworkResource[]>;
}) {
  const [subjects, setSubjects] = useState<HomeworkSubject[]>([]);
  const [status, setStatus] = useState<HomeworkStatus>(0);
  const [subjectCode, setSubjectCode] = useState("-1");
  const [items, setItems] = useState<HomeworkItem[]>([]);
  const [nextCreateTime, setNextCreateTime] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [resources, setResources] = useState<HomeworkResource[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(() => new Set());
  const [previewResource, setPreviewResource] = useState<HomeworkResource | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<{ completed: number; total: number; failed: number; errors: string[] } | null>(null);
  const initializedRef = useRef(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void initialize();
  }, []);

  useEffect(() => {
    if (selectedHomework) detailHeadingRef.current?.focus();
  }, [selectedHomework]);

  const selectedResources = useMemo(() => resources.filter((resource) => selectedResourceIds.has(resource.id)), [resources, selectedResourceIds]);

  async function initialize() {
    setLoading(true);
    setMessage("");
    try {
      const values = await onLoadSubjects();
      setSubjects(values);
      await loadList(true, 0, "-1");
    } catch (error) {
      setMessage(`作业初始化失败：${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadList(reset: boolean, nextStatus = status, nextSubjectCode = subjectCode) {
    setLoading(true);
    setMessage("");
    try {
      const page = await onLoadList({
        status: nextStatus,
        subjectCode: nextSubjectCode,
        pageSize: PAGE_SIZE,
        createTime: reset ? undefined : nextCreateTime ?? undefined
      });
      setItems((current) => reset ? page.items : dedupeHomework([...current, ...page.items]));
      setNextCreateTime(page.nextCreateTime);
      setHasMore(page.hasMore);
      if (reset) {
        setSelectedHomework(null);
        setResources([]);
        setSelectedResourceIds(new Set());
      }
    } catch (error) {
      setMessage(`作业列表加载失败：${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(next: HomeworkStatus) {
    setStatus(next);
    await loadList(true, next, subjectCode);
  }

  async function changeSubject(next: string) {
    setSubjectCode(next);
    await loadList(true, status, next);
  }

  async function openHomework(homework: HomeworkItem) {
    setSelectedHomework(homework);
    setResourceLoading(true);
    setMessage("");
    setSelectedResourceIds(new Set());
    setDownloadProgress(null);
    setPreviewResource(null);
    setPreviewError("");
    try {
      setResources(await onLoadResources(homework));
    } catch (error) {
      setResources([]);
      setMessage(`资源获取失败：${getErrorMessage(error)}`);
    } finally {
      setResourceLoading(false);
    }
  }

  function closeHomework() {
    setSelectedHomework(null);
    setMessage("");
    setDownloadProgress(null);
    setPreviewResource(null);
    setPreviewError("");
  }

  function openResourcePreview(resource: HomeworkResource) {
    setPreviewError("");
    setPreviewResource(resource);
  }

  function openPreviewInNewTab() {
    const url = previewResource?.url;
    if (url) void chrome.tabs.create({ url });
  }

  async function downloadResources(values: HomeworkResource[]) {
    if (!selectedHomework || values.length === 0) return;
    let failed = 0;
    const errors: string[] = [];
    setDownloadProgress({ completed: 0, total: values.length, failed: 0, errors: [] });
    for (let index = 0; index < values.length; index += 1) {
      try {
        await downloadResource(selectedHomework, values[index]);
      } catch (error) {
        failed += 1;
        errors.push(`${values[index].name}：${getErrorMessage(error)}`);
      }
      setDownloadProgress({ completed: index + 1, total: values.length, failed, errors: [...errors] });
    }
    setMessage(failed > 0 ? `下载已完成：成功 ${values.length - failed} 项，失败 ${failed} 项。` : `已开始下载 ${values.length} 项资源。`);
  }

  if (selectedHomework) {
    return (
      <div className="stack-lg homework-detail-page" aria-label={`作业详情：${selectedHomework.title}`}>
        <section className="md-card homework-detail-header">
          <button className="icon-button homework-back-button" type="button" aria-label="返回作业列表" onClick={closeHomework}>
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="homework-detail-header__body">
            <p className="breadcrumb">Homework detail</p>
            <h2 className="section-title" ref={detailHeadingRef} tabIndex={-1}>{selectedHomework.title}</h2>
            <div className="record-chip-row" aria-label="作业信息">
              <span className="info-chip">{subjects.find((subject) => subject.code === selectedHomework.subjectCode)?.name ?? selectedHomework.subjectName}</span>
              <span className="info-chip">{selectedHomework.typeName}</span>
              <span className={`info-chip ${selectedHomework.status === 0 ? "" : "info-chip--strong"}`}>{selectedHomework.status === 0 ? "未提交" : "已提交"}</span>
              <span className="info-chip">{selectedHomework.allowMakeup ? "允许补交" : "不可补交"}</span>
            </div>
            <p className="helper-text">{formatHomeworkTime(selectedHomework.beginTime)} 至 {formatHomeworkTime(selectedHomework.endTime)}</p>
          </div>
        </section>

        {message ? <div className="status-alert" role="status">{message}</div> : null}

        <section className="md-card stack resource-panel">
          <div className="spread resource-panel__header">
            <div><p className="breadcrumb">Resources</p><h2 className="section-title">作业资源</h2></div>
            <div className="cluster">
              <md-outlined-button disabled={resources.length === 0} onClick={() => setSelectedResourceIds(new Set(resources.map((resource) => resource.id)))}>全选</md-outlined-button>
              <md-filled-button disabled={selectedResources.length === 0 || Boolean(downloadProgress && downloadProgress.completed < downloadProgress.total)} onClick={() => void downloadResources(selectedResources)}>下载所选</md-filled-button>
            </div>
          </div>
          {downloadProgress ? (
            <div className="download-progress">
              <md-linear-progress value={downloadProgress.total ? downloadProgress.completed / downloadProgress.total : 0} />
              <span>{downloadProgress.completed}/{downloadProgress.total}{downloadProgress.failed ? ` · 失败 ${downloadProgress.failed}` : ""}</span>
              {downloadProgress.errors.length > 0 ? (
                <div className="download-errors">
                  <code>{downloadProgress.errors.join("\n")}</code>
                  <md-outlined-button onClick={() => void navigator.clipboard.writeText(downloadProgress.errors.join("\n"))
                    .then(() => setMessage("已复制下载失败信息。"))
                    .catch(() => setMessage("复制失败，请手动选择上方信息。"))}>
                    复制失败信息
                  </md-outlined-button>
                </div>
              ) : null}
            </div>
          ) : null}
          {resourceLoading ? (
            <div className="empty-card"><md-circular-progress indeterminate /><p>正在解析作业资源...</p></div>
          ) : resources.length > 0 ? (
            <div className="resource-list">
              {resources.map((resource) => {
                const checked = selectedResourceIds.has(resource.id);
                return (
                  <article className="resource-item" data-selected={checked} key={resource.id}>
                    <md-checkbox checked={checked} onInput={(event: Event) => {
                      const nextChecked = (event.currentTarget as HTMLInputElement).checked;
                      setSelectedResourceIds((current) => setChecked(current, resource.id, nextChecked));
                    }} />
                    <span className="resource-item__body"><strong>{resource.name}</strong><small>{resource.category} · {resource.text ? "文本" : "文件"}</small></span>
                    {isPreviewableResource(resource) ? (
                      <button className="icon-button" type="button" aria-label={`预览 ${resource.name}`} onClick={() => openResourcePreview(resource)}>
                        <MaterialIcon name="visibility" />
                      </button>
                    ) : resource.url ? (
                      <a className="icon-button" href={resource.url} target="_blank" rel="noreferrer" aria-label={`新窗口打开 ${resource.name}`}><MaterialIcon name="open_in_new" /></a>
                    ) : null}
                    <button className="icon-button" type="button" aria-label={`下载 ${resource.name}`} onClick={() => void downloadResources([resource])}><MaterialIcon name="download" /></button>
                  </article>
                );
              })}
            </div>
          ) : <div className="status-alert" role="status">此作业没有返回可用资源。</div>}
        </section>

        <md-dialog
          className="resource-preview-dialog"
          open={Boolean(previewResource)}
          onClosed={() => setPreviewResource(null)}
          onCancel={() => setPreviewResource(null)}
        >
          <div slot="headline">{previewResource?.name ?? "资源预览"}</div>
          <div slot="content" className="resource-preview-content">
            {previewError ? <div className="status-alert" role="alert">{previewError}</div> : null}
            {previewResource ? (
              previewResource.text !== undefined ? (
                <pre className="resource-text-preview">{previewResource.text}</pre>
              ) : isImageResource(previewResource) && previewResource.url ? (
                <img className="resource-image-preview" src={previewResource.url} alt={previewResource.name} onError={() => setPreviewError("图片预览加载失败，可以尝试在新窗口打开或直接下载。")}/>
              ) : isTextUrlResource(previewResource) && previewResource.url ? (
                <iframe className="resource-document-preview" src={previewResource.url} title={`预览 ${previewResource.name}`} sandbox="" />
              ) : null
            ) : null}
          </div>
          <div slot="actions">
            {previewResource?.url ? <md-outlined-button onClick={openPreviewInNewTab}>新窗口打开</md-outlined-button> : null}
            <md-filled-button onClick={() => setPreviewResource(null)}>关闭</md-filled-button>
          </div>
        </md-dialog>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <section className="md-card stack">
        <div className="spread">
          <div>
            <p className="breadcrumb">Homework</p>
            <h2 className="section-title">作业资源</h2>
            <p className="helper-text">按提交状态和科目查找作业，资源只保留在当前页面中。</p>
          </div>
          <md-outlined-button disabled={loading} onClick={() => void loadList(true)}>刷新列表</md-outlined-button>
        </div>
        <div className="cluster homework-filters">
          <div className="filter-chip-grid" role="group" aria-label="提交状态">
            {([0, 1] as HomeworkStatus[]).map((value) => (
              <button className="filter-chip" data-selected={status === value} type="button" onClick={() => void changeStatus(value)} key={value}>
                <MaterialIcon name={status === value ? "check" : value === 0 ? "pending_actions" : "task_alt"} />
                <span>{value === 0 ? "未提交" : "已提交"}</span>
              </button>
            ))}
          </div>
          <md-filled-select
            className="homework-subject-select"
            label="科目"
            value={subjectCode}
            onInput={(event: Event) => void changeSubject(String((event.currentTarget as HTMLElement & { value?: string }).value ?? "-1"))}
          >
            <md-select-option value="-1"><div slot="headline">全部科目</div></md-select-option>
            {subjects.map((subject) => <md-select-option value={subject.code} key={subject.code}><div slot="headline">{subject.name}</div></md-select-option>)}
          </md-filled-select>
        </div>
        {message ? <div className="status-alert" role="status">{message}</div> : null}
      </section>

      {loading && items.length === 0 ? (
        <section className="md-card empty-card"><md-circular-progress indeterminate /><h2>正在加载作业</h2></section>
      ) : items.length > 0 ? (
        <section className="homework-list" aria-label="作业列表">
          {items.map((homework) => (
            <button className="md-card md-card--interactive homework-item" type="button" aria-label={`打开作业：${homework.title}`} onClick={() => void openHomework(homework)} key={`${homework.status}-${homework.id}`}>
              <span className="homework-item__body">
                <strong>{homework.title}</strong>
                <span className="record-chip-row">
                  <span className="info-chip">{subjects.find((subject) => subject.code === homework.subjectCode)?.name ?? homework.subjectName}</span>
                  <span className="info-chip">{homework.typeName}</span>
                  <span className="info-chip">{formatHomeworkTime(homework.beginTime)} 至 {formatHomeworkTime(homework.endTime)}</span>
                  <span className={`info-chip ${homework.status === 0 ? "" : "info-chip--strong"}`}>{homework.status === 0 ? "未提交" : "已提交"}</span>
                  <span className="info-chip">{homework.allowMakeup ? "允许补交" : "不可补交"}</span>
                </span>
              </span>
              <MaterialIcon name="chevron_right" />
            </button>
          ))}
          {hasMore ? <md-filled-button disabled={loading} onClick={() => void loadList(false)}>{loading ? "正在加载..." : "加载更多"}</md-filled-button> : <span className="info-chip">已加载全部结果</span>}
        </section>
      ) : (
        <section className="md-card empty-card"><MaterialIcon name="assignment_late" /><h2>暂无作业</h2><p>当前筛选条件下没有作业记录。</p></section>
      )}

    </div>
  );
}

async function downloadResource(homework: HomeworkItem, resource: HomeworkResource): Promise<number> {
  let url = resource.url;
  let objectUrl: string | null = null;
  if (!url && resource.text !== undefined) {
    objectUrl = URL.createObjectURL(new Blob([resource.text], { type: "text/plain;charset=utf-8" }));
    url = objectUrl;
  }
  if (!url) throw new Error("资源没有可下载内容");
  try {
    return await chrome.downloads.download({
      url,
      filename: ["Owl Insight", safePathSegment(homework.title), safePathSegment(resource.category), safePathSegment(resource.name)].join("/"),
      conflictAction: "uniquify",
      saveAs: false
    });
  } finally {
    if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\.+/g, "_").trim();
  return cleaned.slice(0, 96) || "未命名";
}

function setChecked(current: Set<string>, id: string, checked: boolean): Set<string> {
  const next = new Set(current);
  if (checked) next.add(id); else next.delete(id);
  return next;
}

function dedupeHomework(items: HomeworkItem[]): HomeworkItem[] {
  return Array.from(new Map(items.map((item) => [`${item.status}-${item.id}`, item])).values());
}

function formatHomeworkTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPreviewableResource(resource: HomeworkResource): boolean {
  return resource.text !== undefined || isImageResource(resource) || isTextUrlResource(resource);
}

function isImageResource(resource: HomeworkResource): boolean {
  return /\.(?:png|jpe?g|gif|webp|bmp|svg)(?:$|[?#\s])/i.test(`${resource.name} ${resource.url ?? ""}`);
}

function isTextUrlResource(resource: HomeworkResource): boolean {
  return Boolean(resource.url && /\.txt(?:$|[?#\s])/i.test(`${resource.name} ${resource.url}`));
}

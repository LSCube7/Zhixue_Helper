import { useEffect, useState } from "react";

import type { ConnectionProfile } from "../shared/types";
import { MaterialIcon } from "./icons";

export function ConnectionView({
  availableTabs,
  selectedTabId,
  profile,
  status,
  connecting,
  onOpenZhixue,
  onRefreshTabs,
  onSelectTab,
  onConnect
}: {
  availableTabs: chrome.tabs.Tab[];
  selectedTabId: number | null;
  profile: ConnectionProfile | null;
  status: string;
  connecting: boolean;
  onOpenZhixue: () => void;
  onRefreshTabs: () => void;
  onSelectTab: (tabId: number | null) => void;
  onConnect: () => void;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => setAvatarFailed(false), [profile?.avatar]);

  return (
    <div className="stack-lg">
      <section className="md-card connection-hero">
        <div>
          <p className="breadcrumb">Connection</p>
          <h2 className="section-title">连接智学网页面</h2>
          <p className="helper-text">Owl Insight 会自动连接合适页面，也支持手动切换；不会读取或保存 Cookie 内容。</p>
        </div>
        <div className="connection-status" data-ready={Boolean(profile)}>
          <MaterialIcon name={profile ? "verified_user" : "link"} />
          <span>{status}</span>
        </div>
      </section>

      <section className="tutorial-grid" aria-label="连接教程">
        {[
          ["1", "打开智学网", "在浏览器中打开智学网并完成学生账号登录。"],
          ["2", "检测页面", "返回 Owl Insight，点击重新检测获取可连接页面。"],
          ["3", "自动连接", "Owl Insight 会优先连接当前活动的智学网页面。"],
          ["4", "确认资料", "验证成功后确认学生资料，即可查看考试、分析和作业。"]
        ].map(([step, title, description]) => (
          <article className="md-card tutorial-step" key={step}>
            <span className="tutorial-step__number">{step}</span>
            <div>
              <h3 className="card-title">{title}</h3>
              <p className="helper-text">{description}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="md-card stack">
        <div className="spread">
          <div>
            <h2 className="section-title">选择页面</h2>
            <p className="helper-text">默认自动选择并连接合适页面，也可以在这里手动切换。</p>
          </div>
          <div className="cluster">
            <md-outlined-button onClick={onOpenZhixue}>打开智学网</md-outlined-button>
            <md-outlined-button onClick={onRefreshTabs}>重新检测</md-outlined-button>
          </div>
        </div>

        {availableTabs.length > 0 ? (
          <md-filled-select
            label="智学网页面"
            value={String(selectedTabId ?? "")}
            onInput={(event: Event) => {
              const value = String((event.currentTarget as HTMLElement & { value?: string }).value ?? "");
              onSelectTab(value ? Number(value) : null);
            }}
          >
              <md-select-option value=""><div slot="headline">请选择一个页面</div></md-select-option>
              {availableTabs.map((tab) => (
                <md-select-option value={String(tab.id)} key={tab.id}><div slot="headline">{formatTabTitle(tab)}</div></md-select-option>
              ))}
          </md-filled-select>
        ) : (
          <div className="status-alert" role="status">未检测到智学网页面，请先打开并登录后重新检测。</div>
        )}

        <div className="cluster">
          <md-filled-button disabled={!selectedTabId || connecting} onClick={onConnect}>
            {connecting ? "正在连接..." : "连接并验证"}
          </md-filled-button>
        </div>
      </section>

      {profile ? (
        <section className="md-card profile-card" aria-label="已连接学生资料">
          <div className="profile-avatar">
            {profile.avatar && !avatarFailed ? (
              <img src={profile.avatar} alt={`${profile.name}的头像`} onError={() => setAvatarFailed(true)} />
            ) : (
              <MaterialIcon name="person" />
            )}
          </div>
          <div className="profile-card__body">
            <div className="spread">
              <div>
                <p className="breadcrumb">Connected Student</p>
                <h2 className="section-title">{profile.name}</h2>
              </div>
              <span className="badge">已连接</span>
            </div>
            <dl className="profile-facts">
              <div><dt>登录账号</dt><dd>{profile.loginName}</dd></div>
              <div><dt>学生编号</dt><dd>{profile.code ?? profile.id}</dd></div>
              <div><dt>学校</dt><dd>{profile.school.name}</dd></div>
              <div><dt>年级</dt><dd>{profile.grade?.name ?? "未知"}</dd></div>
              <div><dt>班级</dt><dd>{profile.class.name}</dd></div>
            </dl>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatTabTitle(tab: chrome.tabs.Tab): string {
  const title = tab.title?.trim() || "未命名页面";
  try {
    return `${title} · ${new URL(tab.url ?? "").hostname}`;
  } catch {
    return title;
  }
}

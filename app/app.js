const DB_NAME = "lifebook-local-demo";
const DB_VERSION = 1;
const STORE_NAME = "records";
const TREE_COLLECTION_KEY = "lifebook-tree-collections";
const AI_ANALYSIS_ENDPOINT = window.LIFEBOOK_AI_ENDPOINT || "/api/analyze";
const AI_ANALYSIS_TIMEOUT_MS = 45000;
const AI_IMAGE_LIMIT = 3;
const AI_IMAGE_MAX_EDGE = 1280;
const AI_IMAGE_QUALITY = 0.78;

const viewMeta = {
  dashboard: {
    title: "今日总览",
    eyebrow: "Capture · Understand · Companion · Create",
  },
  capture: {
    title: "记录成长",
    eyebrow: "每一次上传，都是一颗成长种子",
  },
  timeline: {
    title: "成长时间线",
    eyebrow: "把碎片记录整理成连续故事",
  },
  tree: {
    title: "成长树",
    eyebrow: "用温柔的方式看见阶段变化",
  },
  report: {
    title: "生命之书",
    eyebrow: "生成成长卡、周报与月度报告",
  },
  family: {
    title: "家庭共育",
    eyebrow: "让父母、祖辈与老师一起参与",
  },
};

const defaultProfile = {
  profileId: "xiaohe",
  childName: "小禾",
  age: "6岁",
  familyName: "星河家庭",
  focus: "表达与创造",
};

const DEMO_PROFILES = [
  {
    id: "xiaohe",
    childName: "小禾",
    age: "6岁",
    familyName: "星河家庭",
    focus: "表达与创造",
    label: "当前默认",
    note: "幼儿园到小学低龄段，适合展示亲子陪伴和创造表达。",
  },
  {
    id: "qingtian",
    childName: "晴天",
    age: "8岁",
    familyName: "晴天家庭",
    focus: "探索与自主",
    label: "8岁男孩",
    note: "小学低年级，适合展示探索、运动、习惯和同伴合作。",
  },
  {
    id: "zhangbaoxin",
    childName: "张宝心",
    age: "12岁",
    familyName: "宝心家庭",
    focus: "自我表达与关系",
    label: "12岁女孩",
    note: "小学高年级，适合展示兴趣发展、情绪支持和自我叙事。",
  },
];

const dimensionNames = [
  "情绪枝",
  "表达枝",
  "社交枝",
  "创造枝",
  "习惯枝",
  "运动枝",
  "亲子枝",
  "探索枝",
];

const treeAbilityMeta = {
  情绪枝: { label: "情绪觉察", short: "情绪", accent: "#da6f58", x: 18, y: 28, delay: 0.1 },
  表达枝: { label: "表达能量", short: "表达", accent: "#356e9e", x: 46, y: 14, delay: 0.22 },
  社交枝: { label: "合作分享", short: "社交", accent: "#7a5aa8", x: 73, y: 30, delay: 0.34 },
  创造枝: { label: "创意火花", short: "创造", accent: "#d69a2d", x: 31, y: 48, delay: 0.46 },
  习惯枝: { label: "自主习惯", short: "习惯", accent: "#24785d", x: 63, y: 52, delay: 0.58 },
  运动枝: { label: "身体力量", short: "运动", accent: "#4f8f6f", x: 82, y: 58, delay: 0.7 },
  亲子枝: { label: "亲子温度", short: "亲子", accent: "#c86f4a", x: 13, y: 62, delay: 0.82 },
  探索枝: { label: "好奇探索", short: "探索", accent: "#2d8e9d", x: 52, y: 36, delay: 0.94 },
};

const state = {
  db: null,
  view: "dashboard",
  records: [],
  pendingFiles: [],
  filter: "全部",
  profile: loadProfile(),
  mediaUrls: new Map(),
  demoPickerOpen: false,
  treeCollections: loadTreeCollections(),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderLoading();
  state.db = await openDatabase();
  state.records = await getAllRecords();
  bindGlobalEvents();
  render();
}

function bindGlobalEvents() {
  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      setView(viewButton.dataset.view);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id;

    if (action === "open-demo-picker") {
      state.demoPickerOpen = true;
      renderDemoPicker();
    }

    if (action === "close-demo-picker") {
      if (actionButton.classList.contains("modal-backdrop") && event.target !== actionButton) return;
      state.demoPickerOpen = false;
      renderDemoPicker();
    }

    if (action === "import-demo") {
      await importDemoRecords(actionButton.dataset.profileId || "xiaohe");
    }

    if (action === "collect-energy") {
      collectGrowthEnergy(actionButton);
      return;
    }

    if (action === "choose-files") {
      const input = document.querySelector("#mediaInput");
      if (input) input.click();
    }

    if (action === "download-card") {
      const record = findRecord(id) || state.records[0];
      if (record) await downloadGrowthCard(record);
    }

    if (action === "delete-record") {
      await deleteRecordById(id);
    }

    if (action === "clear-records") {
      await clearAllRecords();
    }

    if (action === "download-interactive-book") {
      await downloadInteractiveLifeBook();
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.matches("#recordForm")) {
      event.preventDefault();
      await saveRecordFromForm(event.target);
    }

    if (event.target.matches("#profileForm")) {
      event.preventDefault();
      saveProfileFromForm(event.target);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("#mediaInput")) {
      state.pendingFiles = Array.from(event.target.files || []).filter((file) => {
        const max = 120 * 1024 * 1024;
        if (file.size > max) {
          toast("文件过大", `${file.name} 超过 120MB，演示版先跳过它。`);
          return false;
        }
        return true;
      });
      renderFileList();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.demoPickerOpen) {
      state.demoPickerOpen = false;
      renderDemoPicker();
    }
  });
}

function renderLoading() {
  document.querySelector("#viewRoot").innerHTML = '<div class="loading">正在打开生命之书...</div>';
}

function setView(view) {
  state.view = view;
  state.filter = "全部";
  render();
}

function render() {
  const meta = viewMeta[state.view] || viewMeta.dashboard;
  document.querySelector("#viewTitle").textContent = meta.title;
  document.querySelector("#viewEyebrow").textContent = meta.eyebrow;
  renderProfileSummary();
  updateNavState();

  const root = document.querySelector("#viewRoot");
  if (state.view === "dashboard") root.innerHTML = renderDashboard();
  if (state.view === "capture") root.innerHTML = renderCapture();
  if (state.view === "timeline") root.innerHTML = renderTimeline();
  if (state.view === "tree") root.innerHTML = renderTree();
  if (state.view === "report") root.innerHTML = renderReport();
  if (state.view === "family") root.innerHTML = renderFamily();

  if (state.view === "capture") attachCaptureSurface();
  renderDemoPicker();
}

function updateNavState() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
}

function renderProfileSummary() {
  const stats = computeStats(state.records);
  const initials = state.profile.childName.slice(0, 2) || "LB";
  const portraitPath = getProfilePortraitPath(getCurrentProfileId(), 1);
  document.querySelector("#profileSummary").innerHTML = `
    <div class="profile-row">
      <div class="child-avatar">
        ${portraitPath ? `<img src="${h(portraitPath)}" alt="${h(state.profile.childName)}头像" />` : h(initials)}
      </div>
      <div>
        <h2>${h(state.profile.childName)}</h2>
        <p>${h(state.profile.familyName)} · ${h(state.profile.age)}</p>
      </div>
    </div>
    <div class="profile-meta">
      <div class="profile-pill">
        <span>成长种子</span>
        <strong>${stats.total}</strong>
      </div>
      <div class="profile-pill">
        <span>主成长枝</span>
        <strong>${h(stats.leadingDimension.replace("枝", ""))}</strong>
      </div>
    </div>
  `;
}

function renderDashboard() {
  if (!state.records.length) return renderEmptyState();

  const stats = computeStats(state.records);
  const latest = state.records[0];
  const weekly = filterLastDays(state.records, 7);
  const tasks = buildCompanionTasks(latest);

  return `
    <div class="grid four">
      <article class="metric-card create">
        <span>成长种子</span>
        <strong>${stats.total}</strong>
        <small>${stats.mediaCount} 条素材已沉淀</small>
      </article>
      <article class="metric-card expression">
        <span>本周记录</span>
        <strong>${weekly.length}</strong>
        <small>${stats.thisWeekTrend}</small>
      </article>
      <article class="metric-card emotion">
        <span>近期情绪</span>
        <strong>${h(stats.mainMood)}</strong>
        <small>来自文字与场景描述</small>
      </article>
      <article class="metric-card relation">
        <span>家庭参与</span>
        <strong>${stats.contributors}</strong>
        <small>位成员留下记录</small>
      </article>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>AI 成长 Agent</h2>
          <p>最新记录已进入成长理解流程，演示版使用本地分析引擎生成结果。</p>
        </div>
        <button class="soft-button" data-action="download-card" data-id="${latest.id}">
          <svg class="button-icon"><use href="#icon-card"></use></svg>
          <span>导出成长卡</span>
        </button>
      </div>
      <div class="agent-flow">
        <div class="agent-step">
          <strong>Capture</strong>
          <p>${h(latest.title)} · ${h(latest.media.length ? mediaTypeLabel(latest.media[0].type) : "文字记录")}</p>
        </div>
        <div class="agent-step">
          <strong>Understand</strong>
          <p>${h(latest.analysis.tags.slice(0, 3).join("、"))}</p>
        </div>
        <div class="agent-step">
          <strong>Companion</strong>
          <p>${h(latest.analysis.companion.parentQuestion)}</p>
        </div>
        <div class="agent-step">
          <strong>Create</strong>
          <p>${h(latest.analysis.bookLine)}</p>
        </div>
      </div>
    </section>

    <div class="grid two">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>最近成长记录</h2>
            <p>时间线会自动把照片、视频、语音和文字整理到同一条成长线。</p>
          </div>
          <button class="ghost-button" data-view="timeline">查看全部</button>
        </div>
        <div class="record-list">
          ${state.records.slice(0, 3).map((record) => renderRecordCard(record)).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>今日陪伴建议</h2>
            <p>建议保持轻量、具体、可执行。</p>
          </div>
        </div>
        <div class="task-list">
          ${tasks.map(renderTaskCard).join("")}
        </div>
      </section>
    </div>

    <div class="grid two">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>本周成长摘要</h2>
            <p>${h(buildWeeklyNarrative(weekly))}</p>
          </div>
        </div>
        ${renderKeywordCloud(weekly)}
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>成长树速览</h2>
            <p>记录越持续，枝干越清晰，但不会把孩子固定成某种标签。</p>
          </div>
          <button class="ghost-button" data-view="tree">打开</button>
        </div>
        ${renderDimensionBars(state.records)}
      </section>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <section class="empty-state">
      <div>
        <div class="empty-visual" aria-hidden="true"></div>
        <h2>开始记录第一颗成长种子</h2>
        <p>上传孩子的一张照片、一段视频、一条语音，或写下今天发生的小故事。系统会生成成长总结、标签、陪伴建议和可分享成长卡。</p>
        <div class="row-actions" style="justify-content:center">
          <button class="primary-button" data-view="capture">
            <svg class="button-icon"><use href="#icon-plus"></use></svg>
            <span>新增记录</span>
          </button>
          <button class="icon-button" data-action="open-demo-picker" title="导入演示样本" aria-label="导入演示样本">
            <svg class="button-icon"><use href="#icon-magic"></use></svg>
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderDemoPicker() {
  const root = document.querySelector("#demoPickerRoot");
  if (!root) return;

  if (!state.demoPickerOpen) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = `
    <div class="modal-backdrop" data-action="close-demo-picker">
      <section class="demo-picker" role="dialog" aria-modal="true" aria-labelledby="demoPickerTitle" data-modal-panel>
        <div class="panel-header">
          <div>
            <p class="eyebrow">Demo Profiles</p>
            <h2 id="demoPickerTitle">选择演示孩子</h2>
            <p>会同步切换孩子档案，并替换为该角色专属成长样本。</p>
          </div>
          <button class="icon-button" data-action="close-demo-picker" title="关闭" aria-label="关闭">
            <svg><use href="#icon-plus"></use></svg>
          </button>
        </div>
        <div class="demo-profile-grid">
          ${DEMO_PROFILES.map(renderDemoProfileCard).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderDemoProfileCard(profile) {
  const initials = profile.childName.slice(0, 2);
  const active = profile.childName === state.profile.childName && profile.age === state.profile.age;
  const portraitPath = getProfilePortraitPath(profile.id, 1);
  return `
    <button class="demo-profile-card ${active ? "is-active" : ""}" data-action="import-demo" data-profile-id="${h(profile.id)}">
      <span class="demo-avatar">
        ${portraitPath ? `<img src="${h(portraitPath)}" alt="${h(profile.childName)}头像" />` : h(initials)}
      </span>
      <span class="demo-profile-copy">
        <strong>${h(profile.childName)}</strong>
        <small>${h(profile.label)} · ${h(profile.age)} · ${h(profile.focus)}</small>
        <em>${h(profile.note)}</em>
      </span>
    </button>
  `;
}

function renderCapture() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="grid two">
      <section class="upload-panel">
        <div class="panel-header">
          <div>
            <h2>新增成长记录</h2>
            <p>支持照片、视频、语音和文字。配置服务端后，可以上传压缩图片生成真实 AI 看图分析。</p>
          </div>
        </div>
        <form id="recordForm" class="form-grid">
          <div class="field wide">
            <label for="mediaInput">成长素材</label>
            <div class="dropzone" id="dropzone" role="button" tabindex="0" data-action="choose-files">
              <input class="hidden-input" id="mediaInput" type="file" accept="image/*,video/*,audio/*" multiple />
              <div>
                <svg><use href="#icon-upload"></use></svg>
                <strong>选择或拖入照片、视频、语音</strong>
                <p>可以只写文字；大文件建议先用短视频片段演示。</p>
              </div>
            </div>
            <div class="file-list" id="fileList"></div>
          </div>

          <label class="ai-consent-card wide" for="aiConsent">
            <input id="aiConsent" name="aiConsent" type="checkbox" />
            <span>
              <strong>使用 AI 看图分析</strong>
              <small>勾选后，本次照片会在浏览器内压缩并移除 EXIF 信息，再上传到服务端调用大模型；未配置服务端时会自动使用本地规则分析。</small>
            </span>
          </label>

          <div class="field">
            <label for="title">记录标题</label>
            <input id="title" name="title" placeholder="例如：第一次站上小舞台；留空可由 AI 生成" />
          </div>

          <div class="field">
            <label for="recordDate">发生日期</label>
            <input id="recordDate" name="recordDate" type="date" value="${today}" required />
          </div>

          <div class="field">
            <label for="source">记录者</label>
            <select id="source" name="source">
              <option>妈妈</option>
              <option>爸爸</option>
              <option>爷爷</option>
              <option>奶奶</option>
              <option>外公</option>
              <option>外婆</option>
              <option>老师</option>
              <option>孩子</option>
            </select>
          </div>

          <div class="field">
            <label for="scene">场景</label>
            <select id="scene" name="scene">
              <option>家庭</option>
              <option>学校</option>
              <option>兴趣活动</option>
              <option>旅行</option>
              <option>生日节日</option>
              <option>亲子对话</option>
              <option>作品成果</option>
            </select>
          </div>

          <div class="field">
            <label for="mood">观察到的情绪</label>
            <select id="mood" name="mood">
              <option>开心</option>
              <option>兴奋</option>
              <option>平静</option>
              <option>勇敢</option>
              <option>紧张</option>
              <option>低落</option>
              <option>生气</option>
              <option>好奇</option>
            </select>
          </div>

          <div class="field">
            <label for="visibility">可见范围</label>
            <select id="visibility" name="visibility">
              <option>父母可见</option>
              <option>家庭成员可见</option>
              <option>可分享给祖辈</option>
              <option>家校共育可见</option>
            </select>
          </div>

          <div class="field wide">
            <label for="story">成长故事</label>
            <textarea id="story" name="story" placeholder="写下当时发生了什么、孩子说了什么、你观察到的情绪或变化；勾选 AI 看图时可先留空。"></textarea>
          </div>

          <div class="wide row-actions">
            <button class="ghost-button" type="reset">清空</button>
            <button class="primary-button" type="submit">
              <svg class="button-icon"><use href="#icon-seed"></use></svg>
              <span>保存并分析</span>
            </button>
          </div>
        </form>
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h2>分析会生成</h2>
            <p>有服务端密钥时使用大模型看图；否则保留本地规则引擎兜底。</p>
          </div>
        </div>
        <div class="agent-flow" style="grid-template-columns: 1fr">
          <div class="agent-step">
            <strong>图片场景理解</strong>
            <p>识别照片里的可观察片段，生成标题、故事草稿、情绪和场景建议。</p>
          </div>
          <div class="agent-step">
            <strong>一句成长总结</strong>
            <p>把记录从“发生了什么”转成“孩子正在发展什么”。</p>
          </div>
          <div class="agent-step">
            <strong>成长标签</strong>
            <p>兴趣、表达、社交、情绪、习惯、亲子互动等维度。</p>
          </div>
          <div class="agent-step">
            <strong>陪伴建议</strong>
            <p>给父母一个问题，给祖辈一句鼓励，给家庭一个轻任务。</p>
          </div>
          <div class="agent-step">
            <strong>成长卡与报告</strong>
            <p>记录会进入时间线、成长树、周报和月度生命之书。</p>
          </div>
        </div>
      </aside>
    </div>
  `;
}

function renderTimeline() {
  if (!state.records.length) return renderEmptyState();

  const filters = ["全部", "照片", "视频", "语音", "文字", "家庭", "学校", "祖辈", "表达", "情绪", "创造"];
  const filtered = state.records.filter((record) => matchFilter(record, state.filter));

  return `
    <div class="filter-row">
      ${filters
        .map(
          (filter) => `
            <button class="filter-chip ${state.filter === filter ? "is-active" : ""}" data-filter="${h(filter)}">${h(filter)}</button>
          `,
        )
        .join("")}
    </div>
    <div class="timeline-list">
      ${filtered.map(renderTimelineCard).join("") || "<p class=\"muted\">当前筛选下没有记录。</p>"}
    </div>
  `;
}

function renderTree() {
  if (!state.records.length) return renderEmptyState();
  const scores = computeDimensionScores(state.records);
  const topTags = collectTopTags(state.records).slice(0, 6);
  const energyPoints = buildTreeEnergyPoints(scores);
  const collectedCount = energyPoints.filter((point) => point.collected).length;
  const strongestPoint = [...energyPoints].sort((a, b) => b.score - a.score)[0];
  const cssScore = (dimension) => Math.min(6, scores[dimension] || 0);

  return `
    <div class="tree-layout">
      <section class="tree-stage" aria-label="成长树可视化">
        <div class="garden-sky">
          <div class="energy-summary">
            <span>成长能量</span>
            <strong>${collectedCount}/${energyPoints.length}</strong>
            <small>轻触漂浮能力点，收进今天的成长树。</small>
          </div>
          <div class="growth-tree" style="--lush:${Math.min(1.18, 0.88 + state.records.length * 0.012).toFixed(2)}">
            <div class="canopy"></div>
            <div class="branch b1" style="--score:${cssScore("表达枝")}"></div>
            <div class="branch b2" style="--score:${cssScore("亲子枝")}"></div>
            <div class="branch b3" style="--score:${cssScore("创造枝")}"></div>
            <div class="trunk"></div>
          </div>
          <div class="energy-layer" aria-label="可收集能力点">
            ${energyPoints.map(renderTreeEnergyPoint).join("")}
          </div>
          <div class="garden-hint">
            <strong>${h(strongestPoint?.label || "成长能量")}最亮</strong>
            <p>${h(state.profile.childName)}最近在「${h(strongestPoint?.dimension || "成长枝")}」上的记录最多，可以继续用具体瞬间来喂养这根枝干。</p>
          </div>
        </div>
        <div class="tree-ground">
          <span>成长种子 ${state.records.length} 颗</span>
          <span>已收集 ${collectedCount} 个能力点</span>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h2>成长画像</h2>
            <p>基于 ${state.records.length} 条记录生成，分数表示近期出现频率。</p>
          </div>
        </div>
        ${renderDimensionBars(state.records)}
        <div class="report-section">
          <h3>近期关键词</h3>
          ${renderKeywordCloud(state.records)}
        </div>
        <div class="report-section">
          <h3>观察提醒</h3>
          <p>${h(buildTreeInsight(scores))}</p>
        </div>
      </aside>
    </div>
  `;
}

function buildTreeEnergyPoints(scores) {
  return dimensionNames.map((dimension) => {
    const meta = treeAbilityMeta[dimension];
    const score = Number(scores[dimension] || 0);
    const energy = Math.max(1, Math.round(score));
    const level = Math.min(5, Math.max(1, Math.ceil(score / 3)));
    const key = getTreePointKey(dimension, score);
    return {
      ...meta,
      dimension,
      score,
      energy,
      level,
      key,
      collected: state.treeCollections.has(key),
      available: score > 0,
    };
  });
}

function renderTreeEnergyPoint(point) {
  const classes = [
    "energy-point",
    point.collected ? "is-collected" : "",
    point.available ? "" : "is-waiting",
  ]
    .filter(Boolean)
    .join(" ");
  const disabled = point.available ? "" : " disabled";
  const pressed = point.collected ? "true" : "false";
  return `
    <button
      type="button"
      class="${classes}"
      data-action="collect-energy"
      data-key="${h(point.key)}"
      data-label="${h(point.label)}"
      data-energy="${point.energy}"
      style="--x:${point.x}%;--y:${point.y}%;--point-accent:${point.accent};--delay:${point.delay}s;--level:${point.level}"
      aria-pressed="${pressed}"
      aria-label="${h(point.label)}，${point.available ? `可收集 ${point.energy} 点成长能量` : "等待更多记录"}"
      ${disabled}
    >
      <span class="energy-orb"><span>${point.collected ? "已收" : `+${point.energy}`}</span></span>
      <span class="energy-label">${h(point.label)}</span>
      <small>${h(point.short)}</small>
    </button>
  `;
}

function collectGrowthEnergy(button) {
  const key = button.dataset.key;
  const label = button.dataset.label || "成长能量";
  const energy = Number(button.dataset.energy || 1);
  if (!key) return;

  if (state.treeCollections.has(key)) {
    toast("已经收集过", `「${label}」已经在 ${state.profile.childName} 的成长树里了。`);
    return;
  }

  state.treeCollections.add(key);
  saveTreeCollections();
  button.classList.add("is-collected", "is-popping");
  button.setAttribute("aria-pressed", "true");
  button.querySelector(".energy-orb span").textContent = "已收";
  const summary = document.querySelector(".energy-summary strong");
  if (summary) {
    const [current, total] = summary.textContent.split("/").map((item) => Number(item.trim()));
    if (Number.isFinite(current) && Number.isFinite(total)) summary.textContent = `${Math.min(current + 1, total)}/${total}`;
  }
  toast("收集到成长能量", `${state.profile.childName} 收下了「${label}」+${energy}。`);
  setTimeout(() => render(), 560);
}

function renderReport() {
  if (!state.records.length) {
    return `
      ${renderEmptyState()}
      <article class="report-paper preset-book-paper">
        <section class="report-section">
          <h3>预设互动生命之书</h3>
          <p>还没有导入记录时，也可以先打开四个预设角色的互动电子书，查看生命之书章节的演示效果。</p>
          ${renderPresetBookLinks()}
        </section>
      </article>
    `;
  }

  const weekRecords = filterLastDays(state.records, 7);
  const monthRecords = filterLastDays(state.records, 30);
  const latest = state.records[0];
  const monthly = buildMonthlyReport(monthRecords);

  return `
    <div class="grid two">
      <article class="growth-card-preview">
        ${renderMedia(latest)}
        <div class="growth-card-content">
          <div class="record-meta">${h(buildRecordMeta(latest, latest.source, latest.scene))}</div>
          <h3>${h(latest.analysis.cardTitle)}</h3>
          <p>${h(latest.analysis.summary)}</p>
          ${renderTags(latest.analysis.tags)}
          <div class="row-actions" style="margin-top:16px">
            <button class="primary-button" data-action="download-card" data-id="${latest.id}">
              <svg class="button-icon"><use href="#icon-card"></use></svg>
              <span>导出成长卡 PNG</span>
            </button>
          </div>
        </div>
      </article>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>本周成长摘要</h2>
            <p>${h(buildWeeklyNarrative(weekRecords))}</p>
          </div>
        </div>
        <div class="task-list">
          ${buildCompanionTasks(latest).map(renderTaskCard).join("")}
        </div>
      </section>
    </div>

    <article class="report-paper">
      <div class="report-title">
        <div>
          <p class="eyebrow">Monthly LifeBook</p>
          <h2>${h(state.profile.childName)}的月度生命之书</h2>
          <p class="muted">${formatDate(monthRecords.at(-1)?.recordDate || latest.recordDate)} 至 ${formatDate(monthRecords[0]?.recordDate || latest.recordDate)}</p>
        </div>
        <div class="row-actions">
          <button class="primary-button" data-action="download-interactive-book">
            <svg class="button-icon"><use href="#icon-report"></use></svg>
            <span>生成互动生命之书</span>
          </button>
        </div>
      </div>

      <section class="report-section">
        <h3>本月成长一句话</h3>
        <p>${h(monthly.headline)}</p>
      </section>

      <section class="report-section">
        <h3>成长亮点</h3>
        <ul>${monthly.highlights.map((item) => `<li>${h(item)}</li>`).join("")}</ul>
      </section>

      <section class="report-section">
        <h3>成长画像</h3>
        ${renderDimensionBars(monthRecords)}
      </section>

      <section class="report-section">
        <h3>陪伴建议</h3>
        <ul>${monthly.suggestions.map((item) => `<li>${h(item)}</li>`).join("")}</ul>
      </section>

      <section class="report-section">
        <h3>进入生命之书的章节</h3>
        <p>${h(monthly.bookChapter)}</p>
        ${renderPresetBookLinks()}
      </section>

      <p class="muted">提示：当前为本地演示分析，不用于医疗、诊断或给孩子贴固定标签。</p>
    </article>
  `;
}

function renderFamily() {
  const contributors = buildContributorList(state.records);
  const latest = state.records[0];

  return `
    <div class="grid two">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>孩子档案</h2>
            <p>本地演示版只保存到当前浏览器，可随时修改展示信息。</p>
          </div>
        </div>
        <form id="profileForm" class="form-grid">
          <div class="field">
            <label for="childName">孩子昵称</label>
            <input id="childName" name="childName" value="${h(state.profile.childName)}" />
          </div>
          <div class="field">
            <label for="age">年龄</label>
            <input id="age" name="age" value="${h(state.profile.age)}" />
          </div>
          <div class="field">
            <label for="familyName">家庭名称</label>
            <input id="familyName" name="familyName" value="${h(state.profile.familyName)}" />
          </div>
          <div class="field">
            <label for="focus">近期关注</label>
            <input id="focus" name="focus" value="${h(state.profile.focus)}" />
          </div>
          <div class="wide row-actions">
            <button class="danger-button" type="button" data-action="clear-records">
              <svg class="button-icon"><use href="#icon-trash"></use></svg>
              <span>清空记录</span>
            </button>
            <button class="primary-button" type="submit">保存档案</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>祖辈互动提示</h2>
            <p>根据最新记录生成一句可以直接发给孩子的鼓励。</p>
          </div>
        </div>
        ${
          latest
            ? `<div class="task-card">
                <h3>${h(latest.title)}</h3>
                <p>${h(latest.analysis.companion.grandparentLine)}</p>
              </div>`
            : "<p class=\"muted\">有记录后会自动生成。</p>"
        }
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>角色正面照片</h2>
          <p>每个演示角色内置 10 张 AI 生成正面照片，用于头像、电子书和演示档案。</p>
        </div>
      </div>
      ${renderPortraitGallery()}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>家庭成员贡献</h2>
          <p>真实产品中这里会对应邀请、权限和消息提醒。</p>
        </div>
      </div>
      <div class="family-list">
        ${contributors.map(renderFamilyMember).join("")}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>权限分级模型</h2>
          <p>MVP 可先用轻量角色权限，后续再接家庭邀请和学校端。</p>
        </div>
      </div>
      <div class="permission-grid">
        <div class="permission-cell">
          <strong>父母管理员</strong>
          <p>管理档案、上传、导出、邀请成员、删除数据。</p>
        </div>
        <div class="permission-cell">
          <strong>祖辈成员</strong>
          <p>查看授权高光，发送语音祝福与家庭故事。</p>
        </div>
        <div class="permission-cell">
          <strong>学校教师</strong>
          <p>上传课堂观察，生成家校共育反馈。</p>
        </div>
        <div class="permission-cell">
          <strong>亲友访客</strong>
          <p>只查看被分享的成长卡或阶段报告。</p>
        </div>
      </div>
    </section>
  `;
}

function renderPortraitGallery() {
  return `
    <div class="portrait-grid">
      ${getProfilePortraitPaths()
        .map(
          (path, index) => `
            <figure class="portrait-tile">
              <img src="${h(path)}" alt="${h(state.profile.childName)}正面照片 ${index + 1}" loading="lazy" />
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPresetBookLinks() {
  return `
    <div class="book-link-grid">
      ${DEMO_PROFILES.map((profile) => {
        const template = getBookTemplate(profile.id);
        const active = profile.id === getCurrentProfileId();
        return `
          <a class="book-link-card ${active ? "is-active" : ""}" href="./app/books/${h(profile.id)}.html#pages" target="_blank" rel="noopener">
            <img src="${h(getProfilePortraitPath(profile.id, 1))}" alt="${h(profile.childName)}头像" />
            <span>
              <strong>${h(profile.childName)}的互动生命之书</strong>
              <small>${h(template.name)} · ${h(profile.age)}${active ? " · 当前案例" : ""}</small>
            </span>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

function attachCaptureSurface() {
  const dropzone = document.querySelector("#dropzone");
  if (!dropzone) return;

  const handleFiles = (files) => {
    state.pendingFiles = Array.from(files || []).filter((file) => file.size <= 120 * 1024 * 1024);
    renderFileList();
  };

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });

  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    handleFiles(event.dataTransfer.files);
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.querySelector("#mediaInput")?.click();
    }
  });

  renderFileList();
}

function renderFileList() {
  const list = document.querySelector("#fileList");
  if (!list) return;

  if (!state.pendingFiles.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = state.pendingFiles
    .map(
      (file) => `
        <div class="file-item">
          <strong>${h(file.name)}</strong>
          <span>${mediaTypeLabel(file.type)} · ${formatBytes(file.size)}</span>
        </div>
      `,
    )
    .join("");
}

async function saveRecordFromForm(form) {
  setFormBusy(form, true);
  const data = new FormData(form);
  try {
    const record = {
      id: crypto.randomUUID(),
      title: String(data.get("title") || "").trim(),
      recordDate: String(data.get("recordDate") || new Date().toISOString().slice(0, 10)),
      createdAt: new Date().toISOString(),
      source: String(data.get("source") || "妈妈"),
      scene: String(data.get("scene") || "家庭"),
      mood: String(data.get("mood") || "开心"),
      visibility: String(data.get("visibility") || "父母可见"),
      story: String(data.get("story") || "").trim(),
      media: state.pendingFiles.map((file) => ({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        blob: file,
      })),
    };

    if (!record.title && !record.story && !record.media.length) {
      toast("还没有内容", "请先上传一张照片，或写下一段成长故事。");
      return;
    }

    const wantsAiAnalysis = data.get("aiConsent") === "on";
    const hasImage = record.media.some((item) => item.type.startsWith("image/"));
    let aiResult = null;

    if (wantsAiAnalysis && hasImage) {
      toast("正在 AI 看图分析", "照片会先在浏览器内压缩，再发送到服务端。");
      try {
        aiResult = await requestRemoteAnalysis(record);
      } catch (error) {
        toast("AI 分析未完成", `${getFriendlyAnalysisError(error)} 已改用本地规则生成。`);
      }
    }

    if (aiResult?.analysis) {
      applyRemoteAnalysis(record, aiResult.analysis);
    } else {
      if (!record.title) record.title = record.media.length ? "一条新的影像记录" : "一条新的成长记录";
      if (!record.story) record.story = "这是一条刚刚保存的成长片段，可以稍后补充更多细节。";
      record.analysis = analyzeRecord(record, state.records);
    }

    await putRecord(record);
    state.records = await getAllRecords();
    state.pendingFiles = [];
    form.reset();
    toast(
      record.analysis?.source === "openai-vision" ? "AI 看图分析已生成" : "已生成本地成长分析",
      "记录已进入时间线、成长树和生命之书。",
    );
    setView("dashboard");
  } finally {
    setFormBusy(form, false);
  }
}

function setFormBusy(form, busy) {
  const submitButton = form.querySelector('button[type="submit"]');
  form.classList.toggle("is-submitting", busy);
  Array.from(form.elements).forEach((element) => {
    if (element.type !== "reset") element.disabled = busy;
  });
  if (submitButton) {
    submitButton.innerHTML = busy
      ? '<span class="button-spinner" aria-hidden="true"></span><span>分析中...</span>'
      : '<svg class="button-icon"><use href="#icon-seed"></use></svg><span>保存并分析</span>';
  }
}

async function requestRemoteAnalysis(record) {
  const images = await prepareImagesForAnalysis(record.media || []);
  if (!images.length) {
    const error = new Error("没有可用于 AI 分析的图片。");
    error.code = "no_image";
    throw error;
  }

  const response = await fetchWithTimeout(AI_ANALYSIS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: {
        childName: state.profile.childName,
        age: state.profile.age,
        familyName: state.profile.familyName,
        focus: state.profile.focus,
      },
      record: {
        title: record.title,
        story: record.story,
        recordDate: record.recordDate,
        source: record.source,
        scene: record.scene,
        mood: record.mood,
      },
      images,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "AI 服务请求失败。");
    error.code = payload.error?.code || "remote_analysis_failed";
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function prepareImagesForAnalysis(mediaItems) {
  const imageItems = mediaItems.filter((item) => item.type?.startsWith("image/")).slice(0, AI_IMAGE_LIMIT);
  const prepared = [];
  for (const item of imageItems) {
    prepared.push({
      name: item.name,
      type: "image/jpeg",
      dataUrl: await compressImageToDataUrl(item.blob),
    });
  }
  return prepared;
}

function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("图片读取失败。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片解析失败。"));
      image.onload = () => {
        const scale = Math.min(1, AI_IMAGE_MAX_EDGE / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", AI_IMAGE_QUALITY));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_ANALYSIS_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function applyRemoteAnalysis(record, analysis) {
  record.title = normalizeText(analysis.title, record.title || "一条新的成长记录");
  record.story = normalizeText(analysis.story, record.story || "这是一条由 AI 看图生成的成长记录。");
  record.scene = normalizeChoice(analysis.scene, ["家庭", "学校", "兴趣活动", "旅行", "生日节日", "亲子对话", "作品成果"], record.scene);
  record.mood = normalizeChoice(analysis.mood, ["开心", "兴奋", "平静", "勇敢", "紧张", "低落", "生气", "好奇"], record.mood);
  record.analysis = {
    tags: normalizeTags(analysis.tags),
    dimensions: normalizeDimensions(analysis.dimensions),
    leadingDimension: normalizeChoice(analysis.leadingDimension, dimensionNames, "亲子枝"),
    confidence: clamp(Number(analysis.confidence), 0.45, 0.95),
    summary: normalizeText(analysis.summary, "这条记录呈现了一个具体的成长信号。"),
    highlight: normalizeText(analysis.highlight, "这个片段值得继续温柔观察。"),
    cardTitle: normalizeText(analysis.cardTitle, `${state.profile.childName || "孩子"}的成长时刻`),
    bookLine: normalizeText(analysis.bookLine, buildBookLine(state.profile.childName || "孩子", record, "成长观察")),
    visualDescription: normalizeText(analysis.visualDescription, ""),
    companion: {
      parentQuestion: normalizeText(analysis.companion?.parentQuestion, `可以问${state.profile.childName || "孩子"}：“你最想让我记住哪一刻？”`),
      action: normalizeText(analysis.companion?.action, "和孩子一起给这条记录取一个家庭小标题。"),
      grandparentLine: normalizeText(analysis.companion?.grandparentLine, "宝贝，我们看见了你的成长，也很为你开心。"),
    },
    source: "openai-vision",
  };
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function normalizeTags(tags) {
  const normalized = Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6) : [];
  return normalized.length ? normalized : ["成长观察"];
}

function normalizeDimensions(dimensions = {}) {
  return Object.fromEntries(dimensionNames.map((name) => [name, clamp(Number(dimensions[name] || 0), 0, 6)]));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getFriendlyAnalysisError(error) {
  if (error.name === "AbortError") return "AI 服务响应超时。";
  if (error.code === "missing_api_key") return "服务端还没有配置 API Key。";
  if (error.status === 404) return "当前部署还没有 AI 接口。";
  if (error.status === 413) return "图片请求过大。";
  return error.message || "AI 服务暂时不可用。";
}

function saveProfileFromForm(form) {
  const data = new FormData(form);
  state.profile = {
    profileId: getCurrentProfileId(),
    childName: String(data.get("childName") || "孩子").trim(),
    age: String(data.get("age") || "").trim(),
    familyName: String(data.get("familyName") || "我的家庭").trim(),
    focus: String(data.get("focus") || "成长观察").trim(),
  };
  localStorage.setItem("lifebook-profile", JSON.stringify(state.profile));
  toast("档案已保存", "孩子档案信息已更新。");
  render();
}

async function deleteRecordById(id) {
  if (!id) return;
  const record = findRecord(id);
  if (!record) return;
  if (!window.confirm(`删除「${record.title}」这条成长记录吗？`)) return;
  await deleteRecord(id);
  state.records = await getAllRecords();
  toast("记录已删除", "时间线和报告已同步更新。");
  render();
}

async function clearAllRecords() {
  if (!window.confirm("清空当前浏览器里的全部成长记录吗？")) return;
  await clearRecords();
  state.records = [];
  state.mediaUrls.forEach((url) => URL.revokeObjectURL(url));
  state.mediaUrls.clear();
  toast("已清空记录", "可以重新导入演示样本或上传真实素材。");
  render();
}

function analyzeRecord(record, existingRecords) {
  const text = `${record.title} ${record.story} ${record.scene} ${record.mood} ${record.source}`;
  const tags = new Map();
  const dimensions = Object.fromEntries(dimensionNames.map((name) => [name, 0]));

  const addSignal = (tag, dimension, score = 1) => {
    tags.set(tag, (tags.get(tag) || 0) + score);
    dimensions[dimension] = (dimensions[dimension] || 0) + score;
  };

  const rules = [
    { tag: "创造力", dimension: "创造枝", words: ["画", "颜色", "作品", "创作", "搭", "积木", "手工", "故事"], score: 2 },
    { tag: "表达能力", dimension: "表达枝", words: ["说", "讲", "表达", "表演", "演讲", "舞台", "介绍", "分享"], score: 2 },
    { tag: "社交互动", dimension: "社交枝", words: ["同学", "朋友", "合作", "一起", "帮助", "轮流", "老师"], score: 2 },
    { tag: "情绪体验", dimension: "情绪枝", words: ["开心", "兴奋", "紧张", "害怕", "焦虑", "低落", "难过", "生气"], score: 2 },
    { tag: "自主性", dimension: "习惯枝", words: ["独立", "自己", "完成", "坚持", "主动", "尝试", "整理"], score: 2 },
    { tag: "运动发展", dimension: "运动枝", words: ["跑", "跳", "球", "运动", "骑车", "游泳", "户外"], score: 2 },
    { tag: "亲子互动", dimension: "亲子枝", words: ["妈妈", "爸爸", "爷爷", "奶奶", "外公", "外婆", "亲子", "家庭"], score: 2 },
    { tag: "好奇探索", dimension: "探索枝", words: ["为什么", "观察", "自然", "实验", "昆虫", "植物", "科学", "发现"], score: 2 },
  ];

  rules.forEach((rule) => {
    if (rule.words.some((word) => text.includes(word))) {
      addSignal(rule.tag, rule.dimension, rule.score);
    }
  });

  const sceneSignals = {
    学校: ["家校共育", "社交枝"],
    兴趣活动: ["兴趣发展", "创造枝"],
    旅行: ["好奇探索", "探索枝"],
    生日节日: ["生命节点", "亲子枝"],
    亲子对话: ["亲子互动", "亲子枝"],
    作品成果: ["创造力", "创造枝"],
  };

  if (sceneSignals[record.scene]) addSignal(sceneSignals[record.scene][0], sceneSignals[record.scene][1], 1.5);

  const moodSignals = {
    开心: ["积极情绪", "情绪枝"],
    兴奋: ["积极情绪", "情绪枝"],
    平静: ["安全感", "情绪枝"],
    勇敢: ["勇敢尝试", "表达枝"],
    紧张: ["情绪支持", "情绪枝"],
    低落: ["情绪支持", "情绪枝"],
    生气: ["情绪管理", "情绪枝"],
    好奇: ["好奇探索", "探索枝"],
  };

  if (moodSignals[record.mood]) addSignal(moodSignals[record.mood][0], moodSignals[record.mood][1], 1.5);

  record.media.forEach((item) => {
    if (item.type.startsWith("image/")) addSignal("视觉记忆", "创造枝", 0.8);
    if (item.type.startsWith("video/")) addSignal("动态表达", "表达枝", 1);
    if (item.type.startsWith("audio/")) addSignal("声音表达", "表达枝", 1);
  });

  if (!tags.size) addSignal("成长观察", "亲子枝", 1);

  const sortedTags = Array.from(tags.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 6);

  const leadingDimension = Object.entries(dimensions).sort((a, b) => b[1] - a[1])[0]?.[0] || "亲子枝";
  const firstTime = !existingRecords.some((item) => item.analysis?.tags?.some((tag) => sortedTags.includes(tag)));
  const childName = state.profile.childName || "孩子";
  const mainTag = sortedTags[0] || "成长观察";

  return {
    tags: sortedTags,
    dimensions,
    leadingDimension,
    confidence: Math.min(0.95, 0.62 + sortedTags.length * 0.05 + Math.min(record.story.length / 260, 0.18)),
    summary: buildSummary(childName, record, mainTag, leadingDimension),
    highlight: firstTime ? `这是「${mainTag}」在生命之书里的一个新鲜信号。` : `「${mainTag}」正在持续出现，值得继续温柔观察。`,
    cardTitle: `${childName}的${mainTag}时刻`,
    bookLine: buildBookLine(childName, record, mainTag),
    companion: buildCompanion(record, mainTag, leadingDimension),
    visualDescription: "",
    source: "local-rules",
  };
}

function buildSummary(childName, record, tag, dimension) {
  const templates = {
    表达枝: `${record.title}里，${childName}正在练习把自己的感受、想法或作品表达出来。比表现是否完美更重要的是，孩子愿意被看见，也愿意尝试。`,
    情绪枝: `${record.title}记录了${childName}一次真实的情绪体验。它提醒家人，孩子不只需要被鼓励，也需要有人帮他慢慢说出感受。`,
    社交枝: `这次${record.scene}里的互动，让${childName}有机会练习合作、分享或回应他人。这样的细节会慢慢长成孩子的关系能力。`,
    创造枝: `${record.title}不只是一件作品或一个瞬间，也是在呈现${childName}眼中的世界。家人的认真倾听，会让创造力更有根。`,
    习惯枝: `${childName}在这条记录里呈现出一点自主和坚持。这样的微小进步，适合被具体看见，而不是只被一句“真棒”带过。`,
    运动枝: `这次记录里，${childName}正在通过身体探索世界。运动中的尝试、节奏和信心，都是成长的一部分。`,
    亲子枝: `${record.title}让家庭关系留下了一个具体的画面。孩子会记得的不只是事情本身，还有家人陪在身边的感觉。`,
    探索枝: `这条记录显示了${childName}的好奇心。把问题继续问下去，比马上给答案更能保护这份探索的光。`,
  };

  return templates[dimension] || `${record.title}成为${childName}生命之书里的一颗成长种子，关键词是「${tag}」。`;
}

function buildBookLine(childName, record, tag) {
  return `这一页会被放入「${tag}」章节：${childName}在${formatDate(record.recordDate)}留下了关于${record.scene}的一段成长记忆。`;
}

function buildCompanion(record, tag, dimension) {
  const childName = state.profile.childName || "孩子";
  const base = {
    parentQuestion: `今晚可以问${childName}：“这件事里，你最想让我记住哪一个画面？”先听他说完，再回应你的感受。`,
    action: `和${childName}一起选一张照片或一句话，给它取一个只属于家庭的小标题。`,
    grandparentLine: `宝贝，看到你今天的这个成长瞬间，我们真的很开心。你又多了一页珍贵的生命之书。`,
  };

  if (dimension === "表达枝") {
    return {
      parentQuestion: `可以问${childName}：“当你开始表达的时候，心里最紧张和最开心的地方分别是什么？”`,
      action: "请孩子把这次经历讲给一位家人听，家人只追问细节，不急着评价表现。",
      grandparentLine: `宝贝，你愿意表达自己，这本身就很勇敢。我们为你这一次尝试感到骄傲。`,
    };
  }

  if (dimension === "情绪枝") {
    return {
      parentQuestion: `可以问${childName}：“如果给今天的心情选一种颜色，你会选什么？为什么？”`,
      action: "睡前用三分钟一起复盘情绪，只命名感受，不讲大道理。",
      grandparentLine: `宝贝，不管今天是什么心情，我们都很爱你，也愿意慢慢听你说。`,
    };
  }

  if (dimension === "创造枝") {
    return {
      parentQuestion: `可以问${childName}：“这件作品或这个想法里，你最喜欢哪一部分？”`,
      action: "把作品放到家里的一个小展示位，请孩子做一次作品介绍。",
      grandparentLine: `宝贝，你的想法真有意思。下次见面时，可以讲给我们听听你是怎么想到的吗？`,
    };
  }

  if (dimension === "社交枝") {
    return {
      parentQuestion: `可以问${childName}：“今天和别人一起做事时，哪一刻让你觉得被理解？”`,
      action: "请孩子说出一个他欣赏的同伴行为，帮助他看见关系里的美好。",
      grandparentLine: `宝贝，愿意和别人一起合作、分享，是很温暖的能力。我们看见你的进步了。`,
    };
  }

  if (tag === "好奇探索") {
    return {
      parentQuestion: `可以问${childName}：“关于这件事，你现在还有哪三个问题？”`,
      action: "周末做一次家庭小观察，把孩子的问题写成一张探索卡。",
      grandparentLine: `宝贝，你有这么多好奇的问题，真好。愿你一直带着眼睛和心去发现世界。`,
    };
  }

  return base;
}

function buildCompanionTasks(record) {
  if (!record) return [];
  return [
    {
      title: "今日一句话",
      body: record.analysis.companion.parentQuestion,
      tag: "父母",
    },
    {
      title: "本周陪伴任务",
      body: record.analysis.companion.action,
      tag: "家庭",
    },
    {
      title: "祖辈一句鼓励",
      body: record.analysis.companion.grandparentLine,
      tag: "祖辈",
    },
  ];
}

function renderTaskCard(task) {
  return `
    <article class="task-card">
      <div class="record-meta"><span class="tag">${h(task.tag)}</span></div>
      <h3>${h(task.title)}</h3>
      <p>${h(task.body)}</p>
    </article>
  `;
}

function renderRecordCard(record) {
  return `
    <article class="record-card">
      ${renderMedia(record)}
      <div class="record-body">
        <div class="record-meta">${h(buildRecordMeta(record, record.source, record.scene, record.mood))}</div>
        <h3>${h(record.title)}</h3>
        ${renderAnalysisSource(record)}
        <p>${h(record.analysis.summary)}</p>
        ${record.analysis.visualDescription ? `<p class="visual-description">${h(record.analysis.visualDescription)}</p>` : ""}
        ${renderTags(record.analysis.tags)}
        <div class="row-actions" style="margin-top:12px">
          <button class="soft-button" data-action="download-card" data-id="${record.id}">
            <svg class="button-icon"><use href="#icon-card"></use></svg>
            <span>成长卡</span>
          </button>
          <button class="icon-button" data-action="delete-record" data-id="${record.id}" title="删除记录">
            <svg><use href="#icon-trash"></use></svg>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderTimelineCard(record) {
  return `
    <article class="timeline-card">
      <div class="record-card" style="box-shadow:none;border:0;padding:0">
        ${renderMedia(record)}
        <div class="record-body">
          <div class="record-meta">${h(buildRecordMeta(record, record.source, record.visibility))}</div>
          <h3>${h(record.title)}</h3>
          ${renderAnalysisSource(record)}
          <p>${h(record.story)}</p>
          ${record.analysis.visualDescription ? `<p class="visual-description">${h(record.analysis.visualDescription)}</p>` : ""}
          <p class="muted" style="margin-top:10px">${h(record.analysis.highlight)}</p>
          ${renderTags(record.analysis.tags)}
        </div>
      </div>
    </article>
  `;
}

function renderMedia(record) {
  const media = record.media?.[0];
  if (!media) {
    return `
      <div class="record-media">
        <div class="media-placeholder">
          <svg><use href="#icon-report"></use></svg>
          <span>文字记录</span>
        </div>
      </div>
    `;
  }

  const url = getMediaUrl(record, 0);
  const safeTitle = h(record.title);
  if (media.type.startsWith("image/")) {
    return `<div class="record-media"><img src="${url}" alt="${safeTitle}" loading="lazy" /></div>`;
  }
  if (media.type.startsWith("video/")) {
    return `<div class="record-media"><video src="${url}" controls playsinline preload="metadata"></video></div>`;
  }
  if (media.type.startsWith("audio/")) {
    return `<div class="record-media"><audio src="${url}" controls></audio></div>`;
  }
  return `<div class="record-media"><div class="media-placeholder"><span>${h(media.name)}</span></div></div>`;
}

function renderAnalysisSource(record) {
  const source = record.analysis?.source === "openai-vision" ? "AI 看图" : "本地规则";
  const className = record.analysis?.source === "openai-vision" ? "analysis-source is-ai" : "analysis-source";
  return `<span class="${className}">${h(source)}</span>`;
}

function renderTags(tags) {
  const tones = ["", "blue", "coral", "gold", "violet"];
  return `
    <div class="tag-row">
      ${tags.map((tag, index) => `<span class="tag ${tones[index % tones.length]}">${h(tag)}</span>`).join("")}
    </div>
  `;
}

function renderKeywordCloud(records) {
  const tags = collectTopTags(records);
  if (!tags.length) return '<p class="muted">还需要更多记录生成关键词。</p>';
  return `<div class="tag-row">${tags
    .slice(0, 10)
    .map((item, index) => `<span class="tag ${index % 3 === 1 ? "blue" : index % 3 === 2 ? "gold" : ""}">${h(item.tag)} · ${item.count}</span>`)
    .join("")}</div>`;
}

function renderDimensionBars(records) {
  const scores = computeDimensionScores(records);
  const max = Math.max(1, ...Object.values(scores));
  return `
    <div class="dimension-list">
      ${dimensionNames
        .map((dimension) => {
          const score = scores[dimension] || 0;
          return `
            <div class="dimension-row">
              <header><strong>${h(dimension)}</strong><span>${score.toFixed(1)}</span></header>
              <div class="bar"><span style="--width:${Math.round((score / max) * 100)}%"></span></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderFamilyMember(member) {
  return `
    <article class="family-member">
      <div class="family-avatar">${h(member.name.slice(0, 1))}</div>
      <div>
        <h3>${h(member.name)}</h3>
        <p>${h(member.role)} · ${member.count} 条记录 · ${h(member.lastAction)}</p>
      </div>
      <span class="tag ${member.count ? "" : "gold"}">${member.count ? "已参与" : "待邀请"}</span>
    </article>
  `;
}

function matchFilter(record, filter) {
  if (filter === "全部") return true;
  if (filter === "照片") return record.media.some((media) => media.type.startsWith("image/"));
  if (filter === "视频") return record.media.some((media) => media.type.startsWith("video/"));
  if (filter === "语音") return record.media.some((media) => media.type.startsWith("audio/"));
  if (filter === "文字") return !record.media.length;
  if (filter === "祖辈") return ["爷爷", "奶奶", "外公", "外婆"].includes(record.source);
  if (["家庭", "学校"].includes(filter)) return record.scene === filter || record.source === filter;
  return record.analysis.tags.some((tag) => tag.includes(filter));
}

document.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-filter]");
  if (!chip) return;
  state.filter = chip.dataset.filter;
  render();
});

function computeStats(records) {
  const scores = computeDimensionScores(records);
  const leadingDimension = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || "亲子枝";
  const moodCounts = countBy(records.map((record) => record.mood));
  const mainMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "平静";
  const contributors = new Set(records.map((record) => record.source)).size || 0;
  const mediaCount = records.reduce((sum, record) => sum + record.media.length, 0);
  const weekly = filterLastDays(records, 7).length;

  return {
    total: records.length,
    mediaCount,
    leadingDimension,
    mainMood,
    contributors,
    thisWeekTrend: weekly ? "家庭正在持续看见成长" : "本周还没有新记录",
  };
}

function computeDimensionScores(records) {
  const scores = Object.fromEntries(dimensionNames.map((name) => [name, 0]));
  records.forEach((record) => {
    Object.entries(record.analysis?.dimensions || {}).forEach(([dimension, value]) => {
      scores[dimension] = (scores[dimension] || 0) + Number(value || 0);
    });
  });
  return scores;
}

function collectTopTags(records) {
  const counts = new Map();
  records.forEach((record) => {
    (record.analysis?.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

function buildWeeklyNarrative(records) {
  if (!records.length) return "本周还没有记录。可以从一张照片、一句孩子的话或一次亲子对话开始。";
  const tags = collectTopTags(records)
    .slice(0, 3)
    .map((item) => item.tag)
    .join("、");
  return `本周留下了 ${records.length} 条成长记录，主要信号集中在 ${tags || "家庭记忆"}。建议继续记录具体场景和孩子原话，成长画像会更清晰。`;
}

function buildMonthlyReport(records) {
  const childName = state.profile.childName || "孩子";
  const tags = collectTopTags(records).slice(0, 4);
  const leading = tags[0]?.tag || "成长观察";
  const highlights = records.slice(0, 5).map((record) => `${formatDate(record.recordDate)}，「${record.title}」呈现了${record.analysis.tags.slice(0, 2).join("、")}。`);
  const suggestions = records[0] ? buildCompanionTasks(records[0]).map((task) => `${task.title}：${task.body}`) : ["本月先建立稳定记录习惯，每周保留一个真实小故事。"];

  return {
    headline: `${childName}这个月的生命之书以「${leading}」为主线，记录正在从零散素材变成可理解的成长故事。`,
    highlights: highlights.length ? highlights : ["本月还需要更多成长记录来形成阶段亮点。"],
    suggestions,
    bookChapter: `建议把本月整理为「${leading}正在发芽」章节，选取最能代表孩子状态的 3 到 5 条记录，加入照片、原话和家人祝福。`,
  };
}

function buildTreeInsight(scores) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  if (!first || first[1] === 0) return "现在还处在刚开始记录的阶段，先关注真实片段，不急着得出结论。";
  if (second && first[1] - second[1] < 2) {
    return `目前${first[0]}和${second[0]}都比较活跃，说明孩子的成长信号是多面的。建议继续记录场景、情绪和孩子原话。`;
  }
  return `${first[0]}近期最活跃。可以围绕这个方向设计一次轻量陪伴，比如一次作品介绍、一次情绪复盘或一次家庭小观察。`;
}

function buildContributorList(records) {
  const roles = [
    ["妈妈", "父母管理员"],
    ["爸爸", "父母管理员"],
    ["爷爷", "祖辈成员"],
    ["奶奶", "祖辈成员"],
    ["外公", "祖辈成员"],
    ["外婆", "祖辈成员"],
    ["老师", "学校教师"],
    ["孩子", "自我表达"],
  ];

  const counts = countBy(records.map((record) => record.source));
  return roles.map(([name, role]) => ({
    name,
    role,
    count: counts[name] || 0,
    lastAction: counts[name] ? "已留下成长种子" : "可发送邀请",
  }));
}

function filterLastDays(records, days) {
  const recordDates = records
    .map((record) => new Date(`${record.recordDate}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()));
  const anchor = recordDates.length ? new Date(Math.max(...recordDates.map((date) => date.getTime()))) : new Date();
  const cutoff = new Date(anchor);
  cutoff.setDate(cutoff.getDate() - days);
  return records.filter((record) => {
    const recordDate = new Date(`${record.recordDate}T00:00:00`);
    return recordDate >= cutoff && recordDate <= anchor;
  });
}

function countBy(items) {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
}

function findRecord(id) {
  return state.records.find((record) => record.id === id);
}

function getMediaUrl(record, index) {
  const key = `${record.id}:${index}`;
  if (!state.mediaUrls.has(key)) {
    state.mediaUrls.set(key, URL.createObjectURL(record.media[index].blob));
  }
  return state.mediaUrls.get(key);
}

function mediaTypeLabel(type) {
  if (type?.startsWith("image/")) return "照片";
  if (type?.startsWith("video/")) return "视频";
  if (type?.startsWith("audio/")) return "语音";
  return "文件";
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function buildRecordMeta(record, ...parts) {
  return [formatDate(record.recordDate), formatAgeOnDate(record.recordDate), ...parts].filter(Boolean).join(" · ");
}

function formatAgeOnDate(recordDate, birthDate = state.profile.birthDate) {
  if (!recordDate || !birthDate) return "";
  const date = new Date(`${recordDate}T00:00:00`);
  const born = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(born.getTime()) || date < born) return "";

  let years = date.getFullYear() - born.getFullYear();
  let months = date.getMonth() - born.getMonth();
  if (date.getDate() < born.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) return months ? `0岁${months}个月` : "0岁";
  return months ? `${years}岁${months}个月` : `${years}岁`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadProfile() {
  try {
    return { ...defaultProfile, ...JSON.parse(localStorage.getItem("lifebook-profile") || "{}") };
  } catch {
    return defaultProfile;
  }
}

function loadTreeCollections() {
  try {
    return new Set(JSON.parse(localStorage.getItem(TREE_COLLECTION_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveTreeCollections() {
  localStorage.setItem(TREE_COLLECTION_KEY, JSON.stringify([...state.treeCollections].slice(-600)));
}

function getTreePointKey(dimension, score) {
  return `${getCurrentProfileId()}:${state.records.length}:${dimension}:${Math.round(Number(score || 0) * 10)}`;
}

const DEMO_ASSET_DIR = "./app/assets/demo";

const DEMO_SAMPLES = [
  {
    title: "第一次站上小舞台",
    story: "幼儿园春日展示，小禾上台前有一点紧张，但音乐开始后还是完成了自我介绍。听到掌声时，他笑得很开心，也愿意讲一讲自己站上舞台的感受。",
    source: "妈妈",
    scene: "学校",
    mood: "勇敢",
    visibility: "家庭成员可见",
    recordDate: daysAgo(1),
    assetName: "stage-performance.png",
  },
  {
    title: "给外婆讲自己的画",
    story: "晚饭后，小禾拿着今天画的彩色房子给外婆讲故事，说里面住着会发光的家人。外婆认真听完，还请他明天继续画下一页。",
    source: "外婆",
    scene: "作品成果",
    mood: "开心",
    visibility: "可分享给祖辈",
    recordDate: daysAgo(2),
    assetName: "drawing-grandma.png",
  },
  {
    title: "小组里主动分材料",
    story: "老师记录到，小禾在课堂小组活动里主动把彩纸和胶棒分给同学，还提醒大家轮流使用工具。今天他更愿意合作，也能表达自己的需求。",
    source: "老师",
    scene: "学校",
    mood: "平静",
    visibility: "家校共育可见",
    recordDate: daysAgo(3),
    assetName: "classroom-cooperation.png",
  },
  {
    title: "周末自然观察",
    story: "一家人散步时，小禾蹲在花坛旁看蚂蚁搬东西，连续问了好几个为什么。爸爸没有急着给答案，而是和他一起观察了十分钟。",
    source: "爸爸",
    scene: "旅行",
    mood: "好奇",
    visibility: "家庭成员可见",
    recordDate: daysAgo(5),
    assetName: "nature-observation.png",
  },
  {
    title: "搭出自己的小小城市",
    story: "小禾今天用积木搭了一座有桥、有房子、有停车场的小城市。他坚持调整结构，还主动介绍每个颜色代表什么功能。",
    source: "孩子",
    scene: "作品成果",
    mood: "兴奋",
    visibility: "父母可见",
    recordDate: daysAgo(6),
    assetName: "building-blocks.png",
  },
  {
    title: "睡前亲子共读",
    story: "爸爸和小禾一起读故事书，小禾会停下来猜下一页会发生什么，还把故事里的角色和自己的朋友联系起来，表达越来越自然。",
    source: "爸爸",
    scene: "亲子对话",
    mood: "平静",
    visibility: "家庭成员可见",
    recordDate: daysAgo(7),
    assetName: "parent-child-reading.png",
  },
  {
    title: "奶奶讲小时候的故事",
    story: "奶奶翻出老相册，给小禾讲自己小时候的家庭故事。小禾听得很认真，还问奶奶小时候最喜欢玩什么。",
    source: "奶奶",
    scene: "家庭",
    mood: "开心",
    visibility: "可分享给祖辈",
    recordDate: daysAgo(8),
    assetName: "grandma-storytime.png",
  },
  {
    title: "生日愿望被认真听见",
    story: "生日晚上，小禾吹蜡烛前有些兴奋，说希望今年可以学会游泳，也想给家人画一本小书。家人把这个愿望记录进生命之书。",
    source: "妈妈",
    scene: "生日节日",
    mood: "兴奋",
    visibility: "家庭成员可见",
    recordDate: daysAgo(10),
    assetName: "birthday-candles.png",
  },
  {
    title: "第一次做厨房小帮手",
    story: "周末做早餐时，小禾主动说想帮忙搅拌面糊。他小心地完成步骤，也会问为什么要先放鸡蛋再搅拌。",
    source: "妈妈",
    scene: "家庭",
    mood: "开心",
    visibility: "父母可见",
    recordDate: daysAgo(11),
    assetName: "kitchen-helper.png",
  },
  {
    title: "公园里勇敢向前跑",
    story: "今天在公园跑步，小禾一开始担心自己跟不上，后来还是决定尝试。跑完后他说，原来坚持一下身体会越来越有力量。",
    source: "爷爷",
    scene: "旅行",
    mood: "勇敢",
    visibility: "家庭成员可见",
    recordDate: daysAgo(13),
    assetName: "outdoor-running.png",
  },
  {
    title: "餐桌上的小实验",
    story: "爸爸准备了安全的小实验材料，小禾用放大镜观察杯子里的变化，不停提出为什么。他还尝试画下自己观察到的结果。",
    source: "爸爸",
    scene: "兴趣活动",
    mood: "好奇",
    visibility: "家庭成员可见",
    recordDate: daysAgo(14),
    assetName: "science-experiment.png",
  },
  {
    title: "自己整理明天的书包",
    story: "睡前小禾主动整理书包，把书、本子和水杯一样一样放好。妈妈只在旁边提醒了一次，他就坚持自己完成。",
    source: "妈妈",
    scene: "家庭",
    mood: "平静",
    visibility: "父母可见",
    recordDate: daysAgo(16),
    assetName: "schoolbag-organizing.png",
  },
  {
    title: "低落时被安静陪着",
    story: "今天小禾因为没有拼好模型有些低落，妈妈没有马上讲道理，只是坐在旁边陪他。过了一会儿，他愿意说自己其实很想完成。",
    source: "妈妈",
    scene: "亲子对话",
    mood: "低落",
    visibility: "父母可见",
    recordDate: daysAgo(18),
    assetName: "quiet-emotional-support.png",
  },
  {
    title: "把玩具分享给朋友",
    story: "下午朋友来家里玩，小禾先有些舍不得，后来主动把最喜欢的小玩具拿出来一起玩。他也学着表达自己的规则和边界。",
    source: "奶奶",
    scene: "家庭",
    mood: "开心",
    visibility: "家庭成员可见",
    recordDate: daysAgo(19),
    assetName: "toy-sharing.png",
  },
  {
    title: "旅行前一起看地图",
    story: "出发前，爸爸和小禾一起看地图规划路线。小禾指着方向问了很多为什么，也尝试说出自己想去的地方。",
    source: "爸爸",
    scene: "旅行",
    mood: "好奇",
    visibility: "家庭成员可见",
    recordDate: daysAgo(21),
    assetName: "travel-map.png",
  },
  {
    title: "音乐课后的节奏练习",
    story: "兴趣课回来后，小禾在家继续练习节奏。虽然一开始弹错了几次，但他愿意慢慢调整，还请爸爸听他完整演奏一次。",
    source: "爸爸",
    scene: "兴趣活动",
    mood: "兴奋",
    visibility: "家庭成员可见",
    recordDate: daysAgo(23),
    assetName: "music-practice.png",
  },
  {
    title: "把手工作品举给大家看",
    story: "今天小禾完成了一幅手工作品，他把作品举起来讲给家人听，说每一片叶子都是自己剪的。家人认真听完，让他很有成就感。",
    source: "孩子",
    scene: "作品成果",
    mood: "开心",
    visibility: "可分享给祖辈",
    recordDate: daysAgo(25),
    assetName: "craft-display.png",
  },
  {
    title: "睡前一家人靠在一起",
    story: "睡前关灯前，一家人靠在一起聊今天最开心的一件事。小禾说他喜欢大家都在身边的感觉，也想明天继续讲故事。",
    source: "妈妈",
    scene: "家庭",
    mood: "平静",
    visibility: "家庭成员可见",
    recordDate: daysAgo(28),
    assetName: "bedtime-family.png",
  },
];

const DEMO_PROFILE_SAMPLES = {};

async function importDemoRecords(profileId = "xiaohe") {
  const demoProfile = DEMO_PROFILES.find((profile) => profile.id === profileId) || DEMO_PROFILES[0];
  const demoSamples = getDemoSamples(demoProfile.id);

  state.profile = {
    profileId: demoProfile.id,
    childName: demoProfile.childName,
    age: demoProfile.age,
    birthDate: demoProfile.birthDate || "",
    familyName: demoProfile.familyName,
    focus: demoProfile.focus,
  };
  localStorage.setItem("lifebook-profile", JSON.stringify(state.profile));

  await clearRecords();
  state.records = [];
  state.mediaUrls.forEach((url) => URL.revokeObjectURL(url));
  state.mediaUrls.clear();

  const importedRecords = [];
  const failedAssets = [];

  for (const sample of demoSamples) {
    const adaptedSample = adaptDemoSample(sample, demoProfile);
    const media = [];
    if (adaptedSample.assetName) {
      try {
        media.push(await loadDemoAssetAsMedia(getDemoAssetPath(demoProfile.id, adaptedSample.assetName)));
      } catch {
        failedAssets.push(adaptedSample.title);
      }
    }

    const record = {
      id: crypto.randomUUID(),
      title: adaptedSample.title,
      story: adaptedSample.story,
      source: adaptedSample.source,
      scene: adaptedSample.scene,
      mood: adaptedSample.mood,
      visibility: adaptedSample.visibility || "家庭成员可见",
      recordDate: adaptedSample.recordDate,
      createdAt: new Date().toISOString(),
      media,
    };
    record.analysis = analyzeRecord(record, [...state.records, ...importedRecords]);
    importedRecords.push(record);
    await putRecord(record);
  }

  state.records = await getAllRecords();
  state.demoPickerOpen = false;
  if (failedAssets.length) {
    toast("部分素材未加载", `${failedAssets.length} 条记录已降级为文字记录。`);
  }
  toast("演示案例已切换", `现在只展示 ${demoProfile.childName} 的 ${demoSamples.length} 条成长记录。`);
  render();
}

function getDemoSamples(profileId) {
  return DEMO_PROFILE_SAMPLES[profileId] || DEMO_SAMPLES;
}

function getDemoAssetPath(profileId, assetName) {
  return `${DEMO_ASSET_DIR}/${profileId}/${assetName}`;
}

function getCurrentProfileId() {
  const profileId = state.profile.profileId;
  return DEMO_PROFILES.some((profile) => profile.id === profileId) ? profileId : "xiaohe";
}

function getProfilePortraitPath(profileId = getCurrentProfileId(), index = 1) {
  if (!DEMO_PROFILES.some((profile) => profile.id === profileId)) return "";
  return `${DEMO_ASSET_DIR}/${profileId}/portraits/portrait-${String(index).padStart(2, "0")}.png`;
}

function getProfilePortraitPaths(profileId = getCurrentProfileId()) {
  return Array.from({ length: 10 }, (_, index) => getProfilePortraitPath(profileId, index + 1));
}

function getBookTemplate(profileId = getCurrentProfileId()) {
  const templates = {
    xiaohe: {
      name: "成长森林绘本",
      subtitle: "像翻开一本会发芽的小书",
      accent: "#24785d",
      accent2: "#d69a2d",
      paper: "#fffaf0",
      ink: "#17201d",
      soft: "#e7f4ea",
      font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    },
    qingtian: {
      name: "晴天探险手账",
      subtitle: "把好奇心装进每一次发现",
      accent: "#2d6f9f",
      accent2: "#f0b84a",
      paper: "#f7fbff",
      ink: "#102236",
      soft: "#e4f0fb",
      font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    },
    zhangbaoxin: {
      name: "宝心成长画册",
      subtitle: "记录表达、关系和自我叙事",
      accent: "#7a5aa8",
      accent2: "#d46f8a",
      paper: "#fff8fb",
      ink: "#211827",
      soft: "#f1e8f8",
      font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    },
  };
  return templates[profileId] || templates.xiaohe;
}

function adaptDemoSample(sample, profile) {
  const childName = profile.childName;

  let story = sample.story.replaceAll("小禾", childName);

  if (profile.id !== "xiaohe") {
    story = story
      .replace("幼儿园春日展示", profile.id === "qingtian" ? "小学春日展示" : "班级社团展示")
      .replace("爸爸和", "家人和")
      .replace("睡前亲子共读", "睡前家庭共读");
  }

  if (profile.id === "zhangbaoxin") {
    story = story
      .replace("彩色房子", "色彩练习作品")
      .replace("彩纸和胶棒", "资料卡和马克笔")
      .replace("有桥、有房子、有停车场的小城市", "有路线、有空间分区的模型城市")
      .replace("猜下一页会发生什么", "讨论角色为什么这样选择")
      .replace("最喜欢的小玩具", "自己喜欢的桌游配件")
      .replace("每一片叶子都是自己剪的", "每一个部分都是自己设计和完成的");
  }

  return {
    ...sample,
    story,
  };
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function loadDemoAssetAsMedia(assetPath) {
  const response = await fetch(assetPath);
  if (!response.ok) throw new Error(`Demo asset not found: ${assetPath}`);
  const blob = await response.blob();
  const name = assetPath.split("/").pop() || "demo-asset.png";
  return {
    name,
    type: blob.type || "image/png",
    size: blob.size,
    blob,
  };
}

async function downloadGrowthCard(record) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 900, 1200);
  bg.addColorStop(0, "#eef7f1");
  bg.addColorStop(0.55, "#ffffff");
  bg.addColorStop(1, "#fff2cc");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 900, 1200);

  ctx.fillStyle = "#24785d";
  roundedRect(ctx, 60, 60, 780, 92, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px sans-serif";
  ctx.fillText("生命之书 LifeBook", 92, 118);

  const imageMedia = record.media.find((item) => item.type.startsWith("image/"));
  if (imageMedia) {
    const url = URL.createObjectURL(imageMedia.blob);
    const image = await loadImage(url);
    drawImageCover(ctx, image, 60, 190, 780, 480);
    URL.revokeObjectURL(url);
  } else {
    ctx.fillStyle = "#f7fbff";
    roundedRect(ctx, 60, 190, 780, 480, 18);
    ctx.fill();
    ctx.fillStyle = "#356e9e";
    ctx.font = "700 48px sans-serif";
    ctx.fillText(mediaTypeLabel(record.media[0]?.type) || "文字记录", 320, 430);
  }

  ctx.fillStyle = "#17201d";
  ctx.font = "700 44px sans-serif";
  drawWrappedText(ctx, record.analysis.cardTitle, 70, 740, 760, 56, 2);

  ctx.fillStyle = "#41504a";
  ctx.font = "30px sans-serif";
  const nextY = drawWrappedText(ctx, record.analysis.summary, 70, 835, 760, 44, 5);

  ctx.fillStyle = "#da6f58";
  ctx.font = "700 27px sans-serif";
  ctx.fillText(record.analysis.tags.slice(0, 4).map((tag) => `#${tag}`).join("  "), 70, Math.min(nextY + 42, 1070));

  ctx.fillStyle = "#66736d";
  ctx.font = "24px sans-serif";
  ctx.fillText(`${buildRecordMeta(record, `${record.source}记录`)} · 本地演示生成`, 70, 1130);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.profile.childName}-${record.title}-成长卡.png`;
  link.click();
  URL.revokeObjectURL(url);
  toast("成长卡已生成", "PNG 成长卡已经从浏览器导出。");
}

async function downloadInteractiveLifeBook() {
  if (!state.records.length) {
    toast("还没有成长记录", "先导入演示样本或新增一条记录，再生成生命之书。");
    return;
  }

  toast("正在生成生命之书", "正在把图片和故事打包成可独立打开的 HTML。");

  const profileId = getCurrentProfileId();
  const template = getBookTemplate(profileId);
  const sortedRecords = [...state.records].sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate));
  const portraitDataUrls = await Promise.all(
    getProfilePortraitPaths(profileId)
      .slice(0, 10)
      .map((path) => assetPathToDataUrl(path).catch(() => "")),
  );
  const pages = await Promise.all(sortedRecords.map((record, index) => recordToBookPage(record, index)));
  const stats = computeStats(state.records);
  const tags = collectTopTags(state.records).slice(0, 8);
  const html = buildInteractiveBookHtml({
    profile: state.profile,
    template,
    portraitDataUrls: portraitDataUrls.filter(Boolean),
    pages,
    stats,
    tags,
    generatedAt: new Date().toLocaleString("zh-CN"),
  });

  downloadTextFile(`${state.profile.childName}-互动生命之书.html`, html, "text/html;charset=utf-8");
  toast("互动生命之书已生成", "HTML 电子书已经保存，可以直接打开查看。");
}

async function recordToBookPage(record, index) {
  const imageMedia = record.media?.find((item) => item.type?.startsWith("image/"));
  const image = imageMedia ? await blobToDataUrl(imageMedia.blob).catch(() => "") : "";
  return {
    index: index + 1,
    title: record.title,
    date: formatDate(record.recordDate),
    ageLabel: formatAgeOnDate(record.recordDate),
    source: record.source,
    scene: record.scene,
    mood: record.mood,
    story: record.story,
    summary: record.analysis?.summary || "",
    companion: record.analysis?.companion?.parentQuestion || "",
    tags: record.analysis?.tags || [],
    image,
  };
}

async function assetPathToDataUrl(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Asset not found: ${path}`);
  return blobToDataUrl(await response.blob());
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildInteractiveBookHtml({ profile, template, portraitDataUrls, pages, stats, tags, generatedAt }) {
  const coverPortrait = portraitDataUrls[0] || "";
  const coverImage = pages.find((page) => page.image)?.image || coverPortrait;
  const pagesJson = JSON.stringify(pages).replace(/</g, "\\u003c");
  const tagsHtml = tags.map((item) => `<span>${escapeHtml(item.tag)} · ${item.count}</span>`).join("");
  const portraitHtml = portraitDataUrls
    .map((url, index) => `<button class="portrait-dot" data-portrait="${index}" aria-label="查看照片 ${index + 1}"><img src="${url}" alt="${escapeHtml(profile.childName)}照片 ${index + 1}"></button>`)
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(profile.childName)}的互动生命之书</title>
  <style>
    :root {
      --accent: ${template.accent};
      --accent2: ${template.accent2};
      --paper: ${template.paper};
      --ink: ${template.ink};
      --soft: ${template.soft};
      --line: color-mix(in srgb, var(--accent) 24%, white);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ${template.font};
      color: var(--ink);
      background:
        linear-gradient(120deg, color-mix(in srgb, var(--accent) 14%, white), transparent 42%),
        linear-gradient(240deg, color-mix(in srgb, var(--accent2) 18%, white), transparent 45%),
        var(--paper);
    }
    button { font: inherit; cursor: pointer; }
    .book-shell { min-height: 100vh; display: grid; grid-template-columns: 320px minmax(0, 1fr); }
    .cover {
      padding: 28px;
      background: color-mix(in srgb, var(--accent) 88%, black);
      color: white;
      display: grid;
      align-content: space-between;
      gap: 24px;
    }
    .cover h1 { margin: 0; font-size: 42px; line-height: 1.08; }
    .cover p { line-height: 1.75; color: rgba(255,255,255,.82); }
    .cover-photo { aspect-ratio: 4/5; border-radius: 18px; overflow: hidden; box-shadow: 0 24px 70px rgba(0,0,0,.28); background: rgba(255,255,255,.12); }
    .cover-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .meta-grid div { padding: 12px; border-radius: 14px; background: rgba(255,255,255,.12); }
    .meta-grid span { display: block; font-size: 12px; opacity: .76; }
    .meta-grid strong { display: block; margin-top: 4px; font-size: 20px; }
    .reader { padding: 28px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 18px; }
    .toolbar, .bottom-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 12px; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,.72); backdrop-filter: blur(18px);
    }
    .toolbar strong { color: var(--accent); }
    .nav-btn {
      min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px;
      background: var(--accent); color: white; box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .nav-btn.secondary { background: white; color: var(--accent); border: 1px solid var(--line); box-shadow: none; }
    .page-stage { min-height: 620px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 18px; }
    .page-image, .page-story {
      border: 1px solid var(--line); border-radius: 22px; overflow: hidden; background: rgba(255,255,255,.84);
      box-shadow: 0 24px 70px rgba(40, 50, 45, .12);
    }
    .page-image { min-height: 560px; display: grid; place-items: center; background: var(--soft); }
    .page-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .empty-image { padding: 30px; text-align: center; color: color-mix(in srgb, var(--ink) 58%, white); }
    .page-story { padding: 28px; display: grid; align-content: start; gap: 16px; }
    .page-story h2 { margin: 0; font-size: 34px; line-height: 1.16; }
    .story-meta { color: color-mix(in srgb, var(--ink) 62%, white); font-size: 14px; }
    .story-text, .summary { line-height: 1.9; font-size: 17px; }
    .summary { padding: 16px; border-radius: 16px; background: var(--soft); border: 1px solid var(--line); }
    .tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-row span, .tags span {
      display: inline-flex; min-height: 28px; align-items: center; padding: 4px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--accent2) 20%, white); color: color-mix(in srgb, var(--ink) 88%, var(--accent));
      font-size: 13px; font-weight: 700;
    }
    .portraits { display: grid; grid-template-columns: repeat(10, 1fr); gap: 8px; }
    .portrait-dot { padding: 0; border: 2px solid transparent; border-radius: 12px; overflow: hidden; background: white; aspect-ratio: 1; }
    .portrait-dot.is-active { border-color: var(--accent2); }
    .portrait-dot img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .timeline { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px; }
    .dot { flex: 0 0 auto; width: 12px; height: 12px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--accent) 22%, white); }
    .dot.is-active { width: 34px; background: var(--accent); }
    .lightbox { position: fixed; inset: 0; display: none; place-items: center; padding: 24px; background: rgba(0,0,0,.72); z-index: 10; }
    .lightbox.is-open { display: grid; }
    .lightbox img { max-width: min(860px, 94vw); max-height: 88vh; border-radius: 18px; box-shadow: 0 30px 90px rgba(0,0,0,.4); }
    @media (max-width: 980px) {
      .book-shell { grid-template-columns: 1fr; }
      .cover { min-height: auto; }
      .cover-photo { max-height: 360px; }
      .page-stage { grid-template-columns: 1fr; }
      .page-image { min-height: 360px; }
      .portraits { grid-template-columns: repeat(5, 1fr); }
    }
    @media (max-width: 560px) {
      .reader, .cover { padding: 16px; }
      .page-story h2 { font-size: 26px; }
      .page-image { min-height: 280px; }
    }
  </style>
</head>
<body>
  <main class="book-shell">
    <aside class="cover">
      <div>
        <p>${escapeHtml(template.name)}</p>
        <h1>${escapeHtml(profile.childName)}的互动生命之书</h1>
        <p>${escapeHtml(template.subtitle)}</p>
      </div>
      <div class="cover-photo">${coverImage ? `<img src="${coverImage}" alt="${escapeHtml(profile.childName)}封面">` : ""}</div>
      <div class="meta-grid">
        <div><span>年龄</span><strong>${escapeHtml(profile.age)}</strong></div>
        <div><span>成长种子</span><strong>${stats.total}</strong></div>
        <div><span>主成长枝</span><strong>${escapeHtml(stats.leadingDimension.replace("枝", ""))}</strong></div>
        <div><span>生成时间</span><strong>${escapeHtml(generatedAt.split(" ")[0] || generatedAt)}</strong></div>
      </div>
    </aside>
    <section class="reader">
      <header class="toolbar">
        <div><strong>LifeBook</strong><span id="counter"></span></div>
        <div class="tags">${tagsHtml}</div>
      </header>
      <section class="page-stage">
        <figure class="page-image" id="pageImage"></figure>
        <article class="page-story">
          <div class="story-meta" id="pageMeta"></div>
          <h2 id="pageTitle"></h2>
          <div class="tag-row" id="pageTags"></div>
          <p class="story-text" id="pageStory"></p>
          <div class="summary" id="pageSummary"></div>
          <p class="story-meta" id="pageCompanion"></p>
        </article>
      </section>
      <footer class="bottom-bar">
        <button class="nav-btn secondary" id="prevBtn">上一页</button>
        <div class="timeline" id="timeline"></div>
        <button class="nav-btn" id="nextBtn">下一页</button>
        <div class="portraits">${portraitHtml}</div>
      </footer>
    </section>
  </main>
  <div class="lightbox" id="lightbox"><img id="lightboxImage" alt="照片预览"></div>
  <script>
    const pages = ${pagesJson};
    let current = 0;
    const pageImage = document.querySelector('#pageImage');
    const pageMeta = document.querySelector('#pageMeta');
    const pageTitle = document.querySelector('#pageTitle');
    const pageTags = document.querySelector('#pageTags');
    const pageStory = document.querySelector('#pageStory');
    const pageSummary = document.querySelector('#pageSummary');
    const pageCompanion = document.querySelector('#pageCompanion');
    const counter = document.querySelector('#counter');
    const timeline = document.querySelector('#timeline');
    const lightbox = document.querySelector('#lightbox');
    const lightboxImage = document.querySelector('#lightboxImage');

    function escapeText(text) {
      return String(text || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
    }

    function renderTimeline() {
      timeline.innerHTML = pages.map((_, index) => '<button class="dot" data-page="' + index + '" aria-label="第 ' + (index + 1) + ' 页"></button>').join('');
      timeline.querySelectorAll('.dot').forEach((button) => button.addEventListener('click', () => showPage(Number(button.dataset.page))));
    }

    function showPage(index) {
      current = (index + pages.length) % pages.length;
      const page = pages[current];
      pageImage.innerHTML = page.image ? '<img src="' + page.image + '" alt="' + escapeText(page.title) + '">' : '<div class="empty-image">这一页是文字记录</div>';
      pageMeta.textContent = [page.date, page.ageLabel, page.source, page.scene, page.mood].filter(Boolean).join(' · ');
      pageTitle.textContent = page.title;
      pageTags.innerHTML = page.tags.map((tag) => '<span>' + escapeText(tag) + '</span>').join('');
      pageStory.textContent = page.story;
      pageSummary.textContent = page.summary;
      pageCompanion.textContent = page.companion ? '陪伴问题：' + page.companion : '';
      counter.textContent = ' · 第 ' + (current + 1) + ' / ' + pages.length + ' 页';
      document.querySelectorAll('.dot').forEach((dot, idx) => dot.classList.toggle('is-active', idx === current));
    }

    document.querySelector('#prevBtn').addEventListener('click', () => showPage(current - 1));
    document.querySelector('#nextBtn').addEventListener('click', () => showPage(current + 1));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') showPage(current - 1);
      if (event.key === 'ArrowRight') showPage(current + 1);
      if (event.key === 'Escape') lightbox.classList.remove('is-open');
    });
    pageImage.addEventListener('click', () => {
      const image = pageImage.querySelector('img');
      if (!image) return;
      lightboxImage.src = image.src;
      lightbox.classList.add('is-open');
    });
    document.querySelectorAll('.portrait-dot').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.portrait-dot').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        lightboxImage.src = button.querySelector('img').src;
        lightbox.classList.add('is-open');
      });
    });
    lightbox.addEventListener('click', () => lightbox.classList.remove('is-open'));
    renderTimeline();
    showPage(0);
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const scaledWidth = image.width * scale;
  const scaledHeight = image.height * scale;
  const dx = x + (width - scaledWidth) / 2;
  const dy = y + (height - scaledHeight) / 2;
  ctx.save();
  roundedRect(ctx, x, y, width, height, 18);
  ctx.clip();
  ctx.drawImage(image, dx, dy, scaledWidth, scaledHeight);
  ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const chars = Array.from(text);
  let line = "";
  let lineCount = 0;
  let cursorY = y;

  for (const char of chars) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = char;
      cursorY += lineHeight;
      lineCount += 1;
      if (lineCount >= maxLines) return cursorY;
    } else {
      line = testLine;
    }
  }

  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function toast(title, body) {
  const stack = document.querySelector("#toastStack");
  const toastNode = document.createElement("div");
  toastNode.className = "toast";
  toastNode.innerHTML = `<strong>${h(title)}</strong><p>${h(body)}</p>`;
  stack.appendChild(toastNode);
  setTimeout(() => toastNode.remove(), 4200);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("recordDate", "recordDate");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function recordStore(mode = "readonly") {
  return state.db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords() {
  const records = await requestToPromise(recordStore().getAll());
  return records.sort((a, b) => {
    const dateDiff = new Date(b.recordDate) - new Date(a.recordDate);
    if (dateDiff) return dateDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function putRecord(record) {
  return requestToPromise(recordStore("readwrite").put(record));
}

function deleteRecord(id) {
  return requestToPromise(recordStore("readwrite").delete(id));
}

function clearRecords() {
  return requestToPromise(recordStore("readwrite").clear());
}

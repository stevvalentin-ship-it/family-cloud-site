(() => {
  const cfg = window.FAMILY_CLOUD_CONFIG || {};
  const PASSWORD = cfg.PASSWORD || "278296590.";
  const STORAGE_PREFIX = cfg.STORAGE_PREFIX || "family_site";
  const STORAGE_BUCKET = cfg.STORAGE_BUCKET || "mathmodel-files";

  const MEMBERS = [
    { key: "father", name: "父亲", relation: "父亲", avatar: "父", color: "#0f6b5b" },
    { key: "mother", name: "母亲", relation: "母亲", avatar: "母", color: "#c45d4d" },
    { key: "me", name: "我", relation: "在外地上大学", avatar: "我", color: "#315f9a" },
    { key: "grandma", name: "奶奶", relation: "奶奶", avatar: "奶", color: "#8a6a2f" }
  ];

  const TABLES = {
    statuses: "family_member_statuses",
    messages: "family_messages",
    tasks: "family_tasks",
    moments: "family_moments",
    files: "family_files"
  };

  const LOCAL_KEYS = {
    user: "family_cloud_site_user",
    statuses: "family_cloud_site_statuses",
    messages: "family_cloud_site_messages",
    tasks: "family_cloud_site_tasks",
    moments: "family_cloud_site_moments",
    files: "family_cloud_site_files"
  };

  const state = {
    user: readLocal(LOCAL_KEYS.user, null),
    statuses: [],
    messages: [],
    tasks: [],
    moments: [],
    files: [],
    client: null,
    cloudReady: false,
    cloudError: ""
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    setupTime();
    setupNav();
    setupLogin();
    setupForms();
    setupQuickActions();
    setupFileHints();
    setupDelegatedActions();
    initIcons();

    loadLocalState();
    renderAll();
    await connectCloud();
    renderAll();
  }

  function initIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function setupTime() {
    const date = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(new Date());
    $("#todayDate").textContent = date;

    const lines = [
      "先吃饭，再回消息。",
      "看到状态，就少一点惦记。",
      "今天也有人在等你说一句平安。",
      "电话可以晚点打，挂念不会下线。"
    ];
    $("#dailyLine").textContent = lines[new Date().getDate() % lines.length];

    const tick = () => {
      const now = new Date();
      $("#liveTime").textContent = new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(now);
      $("#liveWeek").textContent = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "long"
      }).format(now);
    };
    tick();
    setInterval(tick, 30 * 1000);
  }

  function setupNav() {
    $$(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        $$(".nav-link").forEach((item) => item.classList.remove("active"));
        link.classList.add("active");
      });
    });
  }

  function setupLogin() {
    const dialog = $("#loginDialog");
    $("#loginOpen").addEventListener("click", () => dialog.showModal());
    $("#signinBtn").addEventListener("click", () => {
      const form = $("#loginForm");
      const memberKey = form.elements.member_key.value;
      const password = form.elements.password.value;
      const msg = $("#loginMsg");
      const member = MEMBERS.find((item) => item.key === memberKey);

      if (!member) {
        msg.textContent = "先选择一个家庭成员。";
        return;
      }
      if (password !== PASSWORD) {
        msg.textContent = "密码不对。注意最后有一个英文句号。";
        return;
      }

      state.user = member;
      writeLocal(LOCAL_KEYS.user, member);
      msg.textContent = "";
      form.reset();
      dialog.close();
      hydrateStatusForm();
      renderUser();
      toast(`欢迎回来，${member.name}`);
    });

    $("#logoutBtn").addEventListener("click", () => {
      state.user = null;
      localStorage.removeItem(LOCAL_KEYS.user);
      renderUser();
      toast("已经退出登录");
    });
  }

  function setupForms() {
    $("#statusForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireLogin()) return;
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const statusText = String(data.status_text || "").trim();
      const payload = {
        member_key: state.user.key,
        display_name: state.user.name,
        relation: state.user.relation,
        status_text: statusText,
        mood: String(data.mood || "").trim(),
        location_text: String(data.location_text || "").trim(),
        note: String(data.note || "").trim(),
        call_time: String(data.call_time || "").trim(),
        need_call: form.elements.need_call.checked || statusText === "需要电话",
        updated_at: new Date().toISOString()
      };

      await saveStatus(payload);
      await addMessage({
        author_key: state.user.key,
        author_name: state.user.name,
        target: "全家",
        kind: payload.need_call ? "重要" : "报平安",
        body: `${payload.status_text}。${payload.note || payload.location_text || "我更新了状态。"}`
      }, { quiet: true });
      toast("状态已经更新");
      renderAll();
    });

    $("#messageForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireLogin()) return;
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      await addMessage({
        author_key: state.user.key,
        author_name: state.user.name,
        target: String(data.target || "全家"),
        kind: String(data.kind || "日常"),
        body: String(data.body || "").trim()
      });
      form.reset();
      toast("留言已经发布");
      renderAll();
    });

    $("#taskForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireLogin()) return;
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const task = {
        id: crypto.randomUUID(),
        title: String(data.title || "").trim(),
        detail: String(data.detail || "").trim(),
        assignee: String(data.assignee || "全家"),
        priority: String(data.priority || "中"),
        due_date: data.due_date || null,
        done: false,
        created_by_key: state.user.key,
        created_by_name: state.user.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await saveTask(task);
      form.reset();
      toast("家庭待办已经添加");
      renderAll();
    });

    $("#momentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireLogin()) return;
      const form = event.currentTarget;
      const files = Array.from($("#momentFiles").files || []);
      const data = Object.fromEntries(new FormData(form));
      const moment = {
        id: crypto.randomUUID(),
        author_key: state.user.key,
        author_name: state.user.name,
        title: String(data.title || "").trim(),
        note: String(data.note || "").trim(),
        created_at: new Date().toISOString()
      };

      await saveMoment(moment, files);
      form.reset();
      $("#fileHint").textContent = "可以一次选择多张照片";
      toast(state.cloudReady ? "家庭时光已经上传" : "已保存到本机预览，云端建表后可共享");
      renderAll();
    });

    $("#refreshAll").addEventListener("click", async () => {
      await connectCloud({ silent: true });
      renderAll();
      toast("已经刷新");
    });
  }

  function setupQuickActions() {
    $("#quickSafe").addEventListener("click", async () => {
      if (!requireLogin()) return;
      const status = {
        member_key: state.user.key,
        display_name: state.user.name,
        relation: state.user.relation,
        status_text: "平安，在忙",
        mood: "安稳",
        location_text: "",
        note: "我这边平安，不用担心。",
        call_time: "",
        need_call: false,
        updated_at: new Date().toISOString()
      };
      await saveStatus(status);
      await addMessage({
        author_key: state.user.key,
        author_name: state.user.name,
        target: "全家",
        kind: "报平安",
        body: "我这边平安，不用担心。"
      }, { quiet: true });
      toast("已经替你报平安");
      renderAll();
    });

    $("#quickCall").addEventListener("click", async () => {
      if (!requireLogin()) return;
      const status = {
        member_key: state.user.key,
        display_name: state.user.name,
        relation: state.user.relation,
        status_text: "需要电话",
        mood: "需要关心",
        location_text: "",
        note: "我想接一个家里的电话。",
        call_time: "现在或今晚都可以",
        need_call: true,
        updated_at: new Date().toISOString()
      };
      await saveStatus(status);
      await addMessage({
        author_key: state.user.key,
        author_name: state.user.name,
        target: "全家",
        kind: "重要",
        body: "我现在需要电话，方便的话给我打一下。"
      }, { quiet: true });
      toast("已把“需要电话”放到最醒目的位置");
      renderAll();
    });
  }

  function setupFileHints() {
    $("#momentFiles").addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      $("#fileHint").textContent = files.length
        ? `已选择 ${files.length} 个文件`
        : "可以一次选择多张照片";
    });
  }

  function setupDelegatedActions() {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const id = button.dataset.id;
      const path = button.dataset.path;

      if (action === "toggle-task") {
        await toggleTask(id);
      }
      if (action === "delete-task") {
        await deleteItem("tasks", id, "确认删除这条待办吗？");
      }
      if (action === "delete-message") {
        await deleteItem("messages", id, "确认删除这条留言吗？");
      }
      if (action === "delete-moment") {
        await deleteMoment(id);
      }
      if (action === "open-file") {
        await openFamilyFile(path);
      }
      renderAll();
    });
  }

  async function connectCloud(options = {}) {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
      setCloudMode(false, "没有 Supabase 配置");
      return;
    }

    if (!state.client) {
      state.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }

    try {
      const [statuses, messages, tasks, moments, files] = await Promise.all([
        state.client.from(TABLES.statuses).select("*"),
        state.client.from(TABLES.messages).select("*").order("created_at", { ascending: false }).limit(80),
        state.client.from(TABLES.tasks).select("*").order("created_at", { ascending: false }).limit(100),
        state.client.from(TABLES.moments).select("*").order("created_at", { ascending: false }).limit(60),
        state.client.from(TABLES.files).select("*").order("created_at", { ascending: false }).limit(300)
      ]);

      const error = [statuses, messages, tasks, moments, files].find((result) => result.error)?.error;
      if (error) throw error;

      state.statuses = mergeStatuses(statuses.data || []);
      state.messages = messages.data || [];
      state.tasks = tasks.data || [];
      state.moments = moments.data || [];
      state.files = files.data || [];
      state.cloudReady = true;
      state.cloudError = "";
      writeLocalSnapshot();
      await ensureCloudMembers();
      setCloudMode(true);
    } catch (error) {
      state.cloudReady = false;
      state.cloudError = error.message || String(error);
      setCloudMode(false, state.cloudError);
      if (!options.silent) {
        console.warn("Cloud mode unavailable:", error);
      }
    }
  }

  async function ensureCloudMembers() {
    if (!state.cloudReady) return;
    const existing = new Set(state.statuses.map((item) => item.member_key));
    const missing = defaultStatuses().filter((item) => !existing.has(item.member_key));
    if (!missing.length) return;

    const { error } = await state.client.from(TABLES.statuses).insert(missing);
    if (!error) {
      state.statuses = mergeStatuses([...state.statuses, ...missing]);
    }
  }

  function setCloudMode(ok, message = "") {
    state.cloudReady = ok;
    const badge = $("#cloudBadge");
    const notice = $("#setupNotice");
    if (ok) {
      badge.textContent = "云端已连接";
      badge.className = "cloud-badge ok";
      notice.classList.add("hidden");
    } else {
      badge.textContent = "本机预览";
      badge.className = "cloud-badge warn";
      notice.classList.remove("hidden");
      if (message) {
        notice.querySelector("p").textContent = `页面可以先试用；共享数据表还没连上。原因：${message}`;
      }
    }
  }

  function loadLocalState() {
    state.statuses = readLocal(LOCAL_KEYS.statuses, defaultStatuses());
    state.messages = readLocal(LOCAL_KEYS.messages, defaultMessages());
    state.tasks = readLocal(LOCAL_KEYS.tasks, defaultTasks());
    state.moments = readLocal(LOCAL_KEYS.moments, defaultMoments());
    state.files = readLocal(LOCAL_KEYS.files, []);
  }

  function writeLocalSnapshot() {
    writeLocal(LOCAL_KEYS.statuses, state.statuses);
    writeLocal(LOCAL_KEYS.messages, state.messages);
    writeLocal(LOCAL_KEYS.tasks, state.tasks);
    writeLocal(LOCAL_KEYS.moments, state.moments);
    writeLocal(LOCAL_KEYS.files, state.files);
  }

  async function saveStatus(payload) {
    state.statuses = mergeStatuses([
      ...state.statuses.filter((item) => item.member_key !== payload.member_key),
      payload
    ]);
    writeLocal(LOCAL_KEYS.statuses, state.statuses);

    if (state.cloudReady) {
      const { error } = await state.client
        .from(TABLES.statuses)
        .upsert(payload, { onConflict: "member_key" });
      if (error) {
        toast(`云端状态保存失败：${error.message}`);
      }
    }
  }

  async function addMessage(message, options = {}) {
    const payload = {
      id: crypto.randomUUID(),
      author_key: message.author_key,
      author_name: message.author_name,
      target: message.target || "全家",
      kind: message.kind || "日常",
      body: message.body,
      created_at: new Date().toISOString()
    };
    state.messages = [payload, ...state.messages].slice(0, 80);
    writeLocal(LOCAL_KEYS.messages, state.messages);

    if (state.cloudReady) {
      const { error } = await state.client.from(TABLES.messages).insert(payload);
      if (error && !options.quiet) {
        toast(`云端留言保存失败：${error.message}`);
      }
    }
  }

  async function saveTask(task) {
    state.tasks = [task, ...state.tasks];
    writeLocal(LOCAL_KEYS.tasks, state.tasks);
    if (state.cloudReady) {
      const { error } = await state.client.from(TABLES.tasks).insert(task);
      if (error) toast(`云端待办保存失败：${error.message}`);
    }
  }

  async function saveMoment(moment, files) {
    state.moments = [moment, ...state.moments];
    writeLocal(LOCAL_KEYS.moments, state.moments);

    if (!state.cloudReady) {
      const localFiles = files.map((file) => ({
        id: crypto.randomUUID(),
        moment_id: moment.id,
        name: file.name,
        storage_path: "",
        size: file.size,
        mime_type: file.type,
        created_at: new Date().toISOString()
      }));
      state.files = [...localFiles, ...state.files];
      writeLocal(LOCAL_KEYS.files, state.files);
      return;
    }

    const { error: momentError } = await state.client.from(TABLES.moments).insert(moment);
    if (momentError) {
      toast(`云端时光保存失败：${momentError.message}`);
      return;
    }

    const uploaded = [];
    for (const file of files) {
      const path = `${STORAGE_PREFIX}/moments/${moment.id}/${Date.now()}_${safeName(file.name)}`;
      const { error: uploadError } = await state.client.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false
        });
      if (uploadError) {
        toast(`文件上传失败：${uploadError.message}`);
        continue;
      }
      uploaded.push({
        id: crypto.randomUUID(),
        moment_id: moment.id,
        name: file.name,
        storage_path: path,
        size: file.size,
        mime_type: file.type || "",
        created_at: new Date().toISOString()
      });
    }

    if (uploaded.length) {
      const { error: fileError } = await state.client.from(TABLES.files).insert(uploaded);
      if (fileError) {
        toast(`文件记录保存失败：${fileError.message}`);
      } else {
        state.files = [...uploaded, ...state.files];
        writeLocal(LOCAL_KEYS.files, state.files);
      }
    }
  }

  async function toggleTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.done = !task.done;
    task.updated_at = new Date().toISOString();
    writeLocal(LOCAL_KEYS.tasks, state.tasks);
    if (state.cloudReady) {
      const { error } = await state.client
        .from(TABLES.tasks)
        .update({ done: task.done, updated_at: task.updated_at })
        .eq("id", id);
      if (error) toast(`云端更新失败：${error.message}`);
    }
  }

  async function deleteItem(type, id, question) {
    if (!confirm(question)) return;
    if (type === "messages") {
      state.messages = state.messages.filter((item) => item.id !== id);
      writeLocal(LOCAL_KEYS.messages, state.messages);
      if (state.cloudReady) {
        await state.client.from(TABLES.messages).delete().eq("id", id);
      }
    }
    if (type === "tasks") {
      state.tasks = state.tasks.filter((item) => item.id !== id);
      writeLocal(LOCAL_KEYS.tasks, state.tasks);
      if (state.cloudReady) {
        await state.client.from(TABLES.tasks).delete().eq("id", id);
      }
    }
  }

  async function deleteMoment(id) {
    if (!confirm("确认删除这条家庭时光吗？")) return;
    const files = state.files.filter((item) => item.moment_id === id);
    state.moments = state.moments.filter((item) => item.id !== id);
    state.files = state.files.filter((item) => item.moment_id !== id);
    writeLocal(LOCAL_KEYS.moments, state.moments);
    writeLocal(LOCAL_KEYS.files, state.files);

    if (state.cloudReady) {
      const paths = files.map((item) => item.storage_path).filter(Boolean);
      if (paths.length) {
        await state.client.storage.from(STORAGE_BUCKET).remove(paths);
      }
      await state.client.from(TABLES.moments).delete().eq("id", id);
    }
  }

  async function openFamilyFile(path) {
    if (!path) {
      toast("本机预览里的文件不能跨设备打开，接上云端后就可以。");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    try {
      if (!state.client) throw new Error("云端还没连接");
      const { data, error } = await state.client.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      if (popup) {
        popup.location.replace(data.signedUrl);
      } else {
        window.location.href = data.signedUrl;
      }
    } catch (error) {
      if (popup) popup.close();
      toast(`文件打开失败：${error.message}`);
    }
  }

  function renderAll() {
    renderUser();
    renderStatusCards();
    renderCallList();
    renderCareQueue();
    renderMessages();
    renderTasks();
    renderMoments();
    hydrateStatusForm();
    initIcons();
  }

  function renderUser() {
    $("#currentUser").textContent = state.user ? `${state.user.name}已登录` : "未登录";
    $("#loginOpen").classList.toggle("hidden", Boolean(state.user));
    $("#logoutBtn").classList.toggle("hidden", !state.user);
  }

  function renderStatusCards() {
    const grid = $("#memberGrid");
    grid.innerHTML = orderedStatuses().map((status) => {
      const member = memberOf(status.member_key);
      const needCall = status.need_call || status.status_text === "需要电话";
      return `
        <article class="member-card ${needCall ? "need-call" : ""}">
          <div class="member-top">
            <span class="avatar" style="background:${member.color}">${escapeHtml(member.avatar)}</span>
            <span class="status-pill ${needCall ? "need-call" : ""}">${escapeHtml(displayStatus(status.status_text))}</span>
          </div>
          <div>
            <h3>${escapeHtml(member.name)}</h3>
            <div class="member-meta">
              <span>${escapeHtml(displayMood(status.mood))}</span>
              <span>${escapeHtml(status.location_text || "位置未写")}</span>
            </div>
          </div>
          <p class="member-note">${escapeHtml(status.note || "还没有给家里留一句话。")}</p>
          <div class="member-meta">
            <span>${status.call_time ? `电话：${escapeHtml(status.call_time)}` : "电话时间未写"}</span>
            <span>${formatRelative(status.updated_at)}</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderCallList() {
    const calls = orderedStatuses().filter((item) => item.need_call || item.status_text === "需要电话");
    const root = $("#callList");
    if (!calls.length) {
      root.innerHTML = `
        <div class="call-alert">
          <strong>现在没人挂“需要电话”</strong>
          <span>很好，但记得主动打给奶奶和爸妈。</span>
        </div>
      `;
      return;
    }
    root.innerHTML = calls.map((item) => `
      <div class="call-alert hot">
            <strong>${escapeHtml(memberOf(item.member_key).name)}需要电话</strong>
        <span>${escapeHtml(item.call_time || "越快越好")} · ${escapeHtml(item.note || "想接一个家里的电话")}</span>
      </div>
    `).join("");
  }

  function renderCareQueue() {
    const undone = sortedTasks().filter((task) => !task.done).slice(0, 3);
    const important = state.messages.filter((item) => item.kind === "重要").slice(0, 1);
    const items = [
      ...undone.map((task) => ({
        title: task.title,
        body: `${task.assignee} · ${task.priority}优先级${task.due_date ? ` · ${task.due_date}` : ""}`
      })),
      ...important.map((message) => ({
        title: `${message.author_name}的重要留言`,
        body: message.body
      }))
    ].slice(0, 4);

    $("#careQueue").innerHTML = items.length ? items.map((item) => `
      <div class="care-item">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
      </div>
    `).join("") : `
      <div class="care-item">
        <strong>今天没有紧急事项</strong>
        <span>可以发一张照片，或者留一句“今天吃了什么”。</span>
      </div>
    `;
  }

  function renderMessages() {
    const root = $("#messageList");
    if (!state.messages.length) {
      root.innerHTML = `<p class="muted">还没有留言。</p>`;
      return;
    }
    root.innerHTML = state.messages.slice(0, 40).map((item) => `
      <article class="message-item ${item.kind === "重要" ? "important" : ""}">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(item.author_name)} 给 ${escapeHtml(item.target || "全家")}</h3>
            <div class="message-meta">
              <span>${escapeHtml(item.kind || "日常")}</span>
              <span>${formatTime(item.created_at)}</span>
            </div>
          </div>
        </div>
        <p class="message-body">${escapeHtml(item.body)}</p>
        <div class="item-actions">
          <button class="small-btn danger" type="button" data-action="delete-message" data-id="${item.id}">
            <i data-lucide="trash-2"></i>删除
          </button>
        </div>
      </article>
    `).join("");
  }

  function renderTasks() {
    const root = $("#taskList");
    const tasks = sortedTasks();
    if (!tasks.length) {
      root.innerHTML = `<p class="muted">还没有家庭待办。</p>`;
      return;
    }
    root.innerHTML = tasks.map((task) => `
      <article class="task-item ${task.done ? "is-done" : ""}">
        <button class="task-check" type="button" data-action="toggle-task" data-id="${task.id}" aria-label="切换完成状态">
          <i data-lucide="${task.done ? "check" : "circle"}"></i>
        </button>
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <div class="task-meta">
            <span class="priority ${task.priority === "高" ? "high" : task.priority === "低" ? "low" : ""}">${escapeHtml(task.priority)}优先级</span>
            <span>${escapeHtml(task.assignee || "全家")}</span>
            <span>${task.due_date ? escapeHtml(task.due_date) : "未定日期"}</span>
            <span>${task.done ? "已完成" : "待处理"}</span>
          </div>
          ${task.detail ? `<p class="task-detail">${escapeHtml(task.detail)}</p>` : ""}
          <div class="item-actions">
            <button class="small-btn danger" type="button" data-action="delete-task" data-id="${task.id}">
              <i data-lucide="trash-2"></i>删除
            </button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function renderMoments() {
    const root = $("#momentList");
    if (!state.moments.length) {
      root.innerHTML = `<p class="muted">还没有家庭时光。</p>`;
      return;
    }
    root.innerHTML = state.moments.slice(0, 30).map((moment) => {
      const files = state.files.filter((file) => file.moment_id === moment.id);
      const imageFiles = files.filter((file) => /^image\//.test(file.mime_type || "")).slice(0, 3);
      return `
        <article class="moment-item">
          <div class="section-head">
            <div>
              <h3>${escapeHtml(moment.title)}</h3>
              <div class="moment-meta">
                <span>${escapeHtml(moment.author_name)}</span>
                <span>${formatTime(moment.created_at)}</span>
                <span>${files.length ? `${files.length} 个附件` : "无附件"}</span>
              </div>
            </div>
          </div>
          ${moment.note ? `<p class="moment-note">${escapeHtml(moment.note)}</p>` : ""}
          ${imageFiles.length ? `
            <div class="photo-strip">
              ${imageFiles.map((file) => `<img data-image-path="${escapeAttr(file.storage_path)}" alt="${escapeAttr(file.name)}">`).join("")}
            </div>
          ` : ""}
          <div class="moment-files">
            ${files.map((file) => `
              <button class="file-chip" type="button" data-action="open-file" data-path="${escapeAttr(file.storage_path || "")}">
                <i data-lucide="paperclip"></i>${escapeHtml(file.name)}
              </button>
            `).join("")}
          </div>
          <div class="item-actions">
            <button class="small-btn danger" type="button" data-action="delete-moment" data-id="${moment.id}">
              <i data-lucide="trash-2"></i>删除
            </button>
          </div>
        </article>
      `;
    }).join("");
    hydrateImages();
  }

  async function hydrateImages() {
    if (!state.cloudReady || !state.client) return;
    const images = $$("img[data-image-path]");
    await Promise.all(images.map(async (img) => {
      const path = img.dataset.imagePath;
      if (!path) return;
      const { data, error } = await state.client.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (!error && data?.signedUrl) {
        img.src = data.signedUrl;
      }
    }));
  }

  function hydrateStatusForm() {
    if (!state.user) return;
    const form = $("#statusForm");
    const status = state.statuses.find((item) => item.member_key === state.user.key);
    if (!status) return;
    form.elements.status_text.value = normalizeStatus(status.status_text);
    form.elements.mood.value = normalizeMood(status.mood);
    form.elements.location_text.value = status.location_text || "";
    form.elements.note.value = status.note || "";
    form.elements.call_time.value = status.call_time || "";
    form.elements.need_call.checked = Boolean(status.need_call || status.status_text === "需要电话");
  }

  function requireLogin() {
    if (state.user) return true;
    $("#loginDialog").showModal();
    toast("先登录一个家庭身份");
    return false;
  }

  function orderedStatuses() {
    const byKey = new Map(mergeStatuses(state.statuses).map((item) => [item.member_key, item]));
    return MEMBERS.map((member) => byKey.get(member.key));
  }

  function mergeStatuses(rows) {
    const defaults = defaultStatuses();
    const map = new Map(defaults.map((item) => [item.member_key, item]));
    rows.forEach((item) => {
      if (item?.member_key) {
        map.set(item.member_key, { ...map.get(item.member_key), ...item });
      }
    });
    return MEMBERS.map((member) => map.get(member.key));
  }

  function sortedTasks() {
    const priorityRank = { 高: 0, 中: 1, 低: 2 };
    return [...state.tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = priorityRank[a.priority] ?? 1;
      const pb = priorityRank[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"));
    });
  }

  function memberOf(key) {
    return MEMBERS.find((item) => item.key === key) || MEMBERS[0];
  }

  function normalizeStatus(value) {
    const map = {
      not_updated: "平安，在忙",
      safe_busy: "平安，在忙",
      need_call: "需要电话",
      miss_home: "想家，想聊聊",
      working: "在上课/工作",
      on_the_way: "在路上",
      resting: "已经休息",
      tired: "今天有点累"
    };
    return map[value] || value || "平安，在忙";
  }

  function displayStatus(value) {
    if (value === "not_updated") return "未更新";
    return normalizeStatus(value || "未更新");
  }

  function normalizeMood(value) {
    const map = {
      stable: "安稳",
      happy: "开心",
      busy: "忙碌",
      missing: "想念",
      tired: "疲惫",
      needs_care: "需要关心"
    };
    return map[value] || value || "安稳";
  }

  function displayMood(value) {
    if (!value) return "心情未写";
    return normalizeMood(value);
  }

  function defaultStatuses() {
    const now = new Date().toISOString();
    return MEMBERS.map((member) => ({
      member_key: member.key,
      display_name: member.name,
      relation: member.relation,
      status_text: member.key === "me" ? "平安，在忙" : "未更新",
      mood: member.key === "grandma" ? "安稳" : "",
      location_text: "",
      note: member.key === "me" ? "我在外地也会好好吃饭，看到消息会回。" : "",
      call_time: "",
      need_call: false,
      updated_at: now
    }));
  }

  function defaultMessages() {
    return [
      {
        id: "local-message-1",
        author_key: "me",
        author_name: "我",
        target: "全家",
        kind: "日常",
        body: "这里可以放每天的小事：吃饭、上课、回家路上、想让家里放心的一句话。",
        created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString()
      }
    ];
  }

  function defaultTasks() {
    const date = new Date();
    date.setDate(date.getDate() + ((7 - date.getDay()) || 7));
    return [
      {
        id: "local-task-1",
        title: "周末视频电话",
        detail: "如果有人挂了“需要电话”，这条就提前办。",
        assignee: "全家",
        priority: "高",
        due_date: date.toISOString().slice(0, 10),
        done: false,
        created_by_key: "me",
        created_by_name: "我",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
  }

  function defaultMoments() {
    return [
      {
        id: "local-moment-1",
        author_key: "me",
        author_name: "我",
        title: "家庭时光从这里开始",
        note: "可以放学校里的照片、家里的饭菜、奶奶想看的文件，或者只是一句今天的天气。",
        created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString()
      }
    ];
  }

  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function safeName(name) {
    return String(name || "file")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 120);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function formatTime(value) {
    if (!value) return "刚刚";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatRelative(value) {
    if (!value) return "未更新";
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "未更新";
    const diff = Date.now() - time;
    const minutes = Math.max(1, Math.round(diff / 60000));
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return formatTime(value);
  }

  function toast(message) {
    const box = $("#toast");
    box.textContent = message;
    box.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.add("hidden"), 2600);
  }
})();

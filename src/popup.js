// 渲染进程：阅读/翻页/导入/设置逻辑
(function () {
  'use strict';

  const els = {
    headline: document.getElementById('headline'),
    meta: document.getElementById('meta'),
    body: document.getElementById('body'),
    progress: document.getElementById('progress'),
    more: document.getElementById('more'),
    time: document.getElementById('time'),
    menuBtn: document.getElementById('menuBtn'),
    menu: document.getElementById('menu'),
    close: document.getElementById('close'),
    panel: document.getElementById('settingsPanel'),
    setInterval: document.getElementById('setInterval'),
    setBoss: document.getElementById('setBoss'),
    setAuto: document.getElementById('setAuto'),
    setFull: document.getElementById('setFull'),
    setCancel: document.getElementById('setCancel'),
    setSave: document.getElementById('setSave'),
    setPrev: document.getElementById('setPrev'),
    setNext: document.getElementById('setNext'),
    setScrollUp: document.getElementById('setScrollUp'),
    setScrollDown: document.getElementById('setScrollDown'),
  };

  const state = {
    novel: null,
    ci: 0,         // 当前章节索引
    shown: 1,      // 已显示段落数
    full: false,   // 是否展开全文
    scrollTop: 0,  // 正文滚动位置（退出记忆）
    captureInput: null, // 正在录入快捷键的输入框
  };

  // 阅读快捷键（弹窗聚焦时生效），默认从设置读取
  let shortcuts = {
    prev: 'Alt+ArrowUp',
    next: 'Alt+ArrowDown',
    scrollUp: 'ArrowUp',
    scrollDown: 'ArrowDown',
  };
  const SCROLL_STEP = 60; // 单次翻页滚动像素

  // 默认进入是否展开全文（来自设置 openFull，缺省 true）
  let openFull = true;

  // Electron 里用 preload 注入的 window.api；浏览器预览时给空实现回退
  const api = window.api || {
    hide() {}, show() {}, toggle() {},
    openFile: async () => null,
    getSample: async () => null,
    getConfig: async () => ({ intervalMin: 8, bossKey: 'Ctrl+Shift+K', autoStart: false, progress: { ci: 0, shown: 1, full: false, scrollTop: 0 } }),
    saveConfig: async () => ({}),
    loadFile: async () => null,
    saveProgress: async () => ({}),
    saveProgressSync() {},
    onSettings() {},
  };

  let revealTimer = null;

  // 虚拟资讯标题池：替换原章节名，让弹窗看起来更像新闻推送
  const FAKE_TITLES = [
    '突发！地铁早高峰出现暖心一幕',
    '本地新规出台，这些补贴别错过',
    '热议：年轻人为什么爱上Citywalk',
    '今日天气反转，下班记得带伞',
    '身边小事：一杯咖啡引发的连锁反应',
    '城市观察：深夜食堂里的人间烟火',
    '提醒！下周这些地方将临时管制',
    '生活贴士：换季收纳的3个神操作',
    '街头采访：你最想对十年前的自己说什么',
    '民生关注：社区菜场的新变化',
    '今日焦点：写字楼里的奇怪现象',
    '周末攻略：藏在市区的免费好去处',
    '健康提醒：久坐族必看的拉伸指南',
    '科技前沿：你的手机还能这么用',
    '本地热议：这条小巷突然火了',
  ];
  function fakeTitleFor(chapterIndex) {
    return FAKE_TITLES[chapterIndex % FAKE_TITLES.length];
  }

  function now() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function setNovel(novel) {
    state.novel = novel;
    state.ci = 0;
    state.shown = 1;
    state.full = openFull;
    state.scrollTop = 0;
    renderChapter();
  }

  function renderChapter() {
    const ch = state.novel.chapters[state.ci];
    if (!ch) return;
    // 章名藏进「来源」行， headline 用虚拟资讯标题伪装
    els.headline.textContent = fakeTitleFor(state.ci);
    els.meta.textContent = '来源：' + (state.novel.title || '本地资讯') + ' · ' + ch.title + ' · 第 ' + (state.ci + 1) + '/' + state.novel.chapters.length + ' 章';
    els.time.textContent = now();
    renderBody();
  }

  function renderBody() {
    const ch = state.novel.chapters[state.ci];
    const total = ch.paragraphs.length;
    const limit = state.full ? total : state.shown;
    els.body.innerHTML = '';
    for (let i = 0; i < Math.min(limit, total); i++) {
      const p = document.createElement('p');
      p.innerHTML = escapeHtml(ch.paragraphs[i]);
      els.body.appendChild(p);
    }
    // 恢复滚动位置（只在有记忆时生效，否则回到顶部）
    els.body.scrollTop = state.scrollTop || 0;
    state.scrollTop = 0;
    // 展开全文时按滚动位置刷新进度
    updateProgressFromScroll();
    els.more.textContent = state.full ? '收起 ‹' : '阅读全文 ›';
  }

  function updateProgress() {
    const ch = state.novel.chapters[state.ci];
    const total = ch.paragraphs.length;
    const pct = total ? Math.round((Math.min(state.shown, total) / total) * 100) : 0;
    els.progress.textContent = '已读 ' + pct + '%';
  }

  // 展开全文时按滚动位置计算已读进度
  function updateProgressFromScroll() {
    if (!state.novel || !state.full) return;
    const ch = state.novel.chapters[state.ci];
    const total = ch.paragraphs.length;
    const el = els.body;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      state.shown = total;
    } else {
      const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
      state.shown = Math.max(1, Math.min(total, Math.ceil(total * ratio)));
    }
    updateProgress();
  }

  function nextChapter(silent) {
    if (!state.novel) return;
    if (state.ci < state.novel.chapters.length - 1) {
      state.ci++;
    } else if (!silent) {
      state.ci = 0; // 末章循环回开头
    } else {
      state.ci = 0;
    }
    state.shown = 1;
    state.full = openFull; // 翻章后按默认展开设置来
    renderChapter();
    saveProgress();
  }

  function prevChapter() {
    if (!state.novel) return;
    state.ci = state.ci > 0 ? state.ci - 1 : state.novel.chapters.length - 1;
    state.shown = 1;
    state.full = openFull; // 翻章后按默认展开设置来
    renderChapter();
    saveProgress();
  }

  // 自动逐段揭示，模拟资讯刷新（仅在未展开全文时生效，且不再自动翻章）
  function startReveal() {
    if (revealTimer) clearInterval(revealTimer);
    revealTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return; // 隐藏时不推进
      if (state.full || !state.novel) return;             // 展开全文后停手
      const ch = state.novel.chapters[state.ci];
      if (state.shown < ch.paragraphs.length) {
        state.shown++;
        renderBody();
        saveProgress();
      }
      // 本章已揭示完：停止推进，绝不自动翻到下一章（避免偷偷跳章）
    }, 3500);
  }

  // 保存阅读进度（章节/已读段落/是否全文/滚动位置）
  function saveProgress() {
    if (!state.novel) return;
    api.saveProgress({
      ci: state.ci,
      shown: state.shown,
      full: state.full,
      scrollTop: els.body.scrollTop || 0,
    });
  }

  // 带进度恢复地载入小说（越界保护）
  function restoreNovel(novel, progress) {
    state.novel = novel;
    const len = novel.chapters.length;
    const p = progress || {};
    state.ci = Math.max(0, Math.min(p.ci || 0, len - 1));
    // 默认展开全文：忽略旧的 full 标记，避免恢复成“未展开”后自动翻章
    state.full = openFull;
    // shown 只表示真正已读到的段落，不受展开全文影响
    state.shown = Math.max(1, p.shown || 1);
    state.scrollTop = p.scrollTop || 0;
    renderChapter();
  }

  // ---- 事件绑定 ----
  els.close.addEventListener('click', () => api.hide()); // 假关闭

  // 阅读全文 / 收起：只切换显示范围，不改变已读进度
  els.more.addEventListener('click', () => {
    state.full = !state.full;
    renderBody();
    saveProgress();
  });

  // 滚动条：滚动时短暂显示，停后自动隐藏；展开全文时按滚动位置刷新进度
  let scrollTimer = null;
  let progressSaveTimer = null;
  els.body.addEventListener('scroll', () => {
    els.body.classList.add('scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => els.body.classList.remove('scrolling'), 800);

    if (state.full) {
      updateProgressFromScroll();
      clearTimeout(progressSaveTimer);
      progressSaveTimer = setTimeout(() => saveProgress(), 400);
    }
  });

  // 导入 txt（提取为函数，供菜单调用）
  async function importTxt() {
    const res = await api.openFile();
    if (res && res.chapters && res.chapters.length) {
      setNovel({ title: res.name, chapters: res.chapters });
      saveProgress();
    }
  }

  // 「⋯」菜单
  els.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.menu.classList.toggle('hidden');
  });
  els.menu.querySelectorAll('.menu-item').forEach((it) => {
    it.addEventListener('click', (e) => {
      e.stopPropagation();
      els.menu.classList.add('hidden');
      const act = it.dataset.act;
      if (act === 'prev') prevChapter();
      else if (act === 'next') nextChapter(false);
      else if (act === 'import') importTxt();
      else if (act === 'settings') openSettings();
    });
  });
  document.addEventListener('click', () => els.menu.classList.add('hidden'));

  // 设置面板
  function openSettings() {
    api.getConfig().then((cfg) => {
      els.setInterval.value = cfg.intervalMin;
      els.setBoss.value = cfg.bossKey;
      els.setBoss.dataset.last = cfg.bossKey;
      els.setAuto.checked = !!cfg.autoStart;
      els.setFull.checked = !!(cfg.openFull);
      const sc = cfg.shortcuts || {};
      els.setPrev.value = sc.prev || shortcuts.prev;
      els.setPrev.dataset.last = sc.prev || shortcuts.prev;
      els.setNext.value = sc.next || shortcuts.next;
      els.setNext.dataset.last = sc.next || shortcuts.next;
      els.setScrollUp.value = sc.scrollUp || shortcuts.scrollUp;
      els.setScrollUp.dataset.last = sc.scrollUp || shortcuts.scrollUp;
      els.setScrollDown.value = sc.scrollDown || shortcuts.scrollDown;
      els.setScrollDown.dataset.last = sc.scrollDown || shortcuts.scrollDown;
    });
    els.panel.classList.remove('hidden');
  }
  function closeSettings() { els.panel.classList.add('hidden'); }

  // 真正退出前（托盘「退出」/关机/Alt+F4 等）同步保存滚动位置，防止异步 IPC 来不及落盘
  window.addEventListener('beforeunload', () => {
    if (!state.novel) return;
    const prog = { ci: state.ci, shown: state.shown, full: state.full, scrollTop: els.body.scrollTop || 0 };
    if (api.saveProgressSync) api.saveProgressSync(prog);
    else api.saveProgress(prog);
  });

  api.onSettings(openSettings);
  els.setCancel.addEventListener('click', closeSettings);

  // 组合键工具：把按键事件归一化，便于与配置字符串比对
  function normalizeKey(k) {
    if (k === ' ') return 'Space';
    if (k === '`') return 'Backquote';
    if (k.length === 1) return k.toUpperCase();
    return k;
  }
  function matchCombo(e, combo) {
    if (!combo) return false;
    const parts = combo.split('+');
    const key = parts.pop();
    const mods = parts;
    const needCtrl = mods.includes('CommandOrControl') || mods.includes('Control') || mods.includes('CmdOrCtrl');
    const needAlt = mods.includes('Alt');
    const needShift = mods.includes('Shift');
    if (needCtrl !== (e.ctrlKey || e.metaKey)) return false;
    if (needAlt !== e.altKey) return false;
    if (needShift !== e.shiftKey) return false;
    return normalizeKey(e.key) === normalizeKey(key);
  }

  // 通用快捷键录入：点击输入框 → 进入捕获，按下组合键即写入 dataset.last
  function setupShortcutCapture(input) {
    input.addEventListener('focus', () => {
      state.captureInput = input;
      input.value = '请按下组合键…';
    });
    input.addEventListener('blur', () => {
      if (state.captureInput === input) {
        state.captureInput = null;
        input.value = input.dataset.last || '';
      }
    });
  }
  [els.setBoss, els.setPrev, els.setNext, els.setScrollUp, els.setScrollDown].forEach(setupShortcutCapture);

  // 捕获态下的 keydown：把按键序列化成组合键字符串
  document.addEventListener('keydown', (e) => {
    if (!state.captureInput) return;
    e.preventDefault();
    const input = state.captureInput;
    const requireMod = input.dataset.requireMod === '1';
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    else if (key === '`') key = 'Backquote';
    else if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return; // 纯修饰键忽略
    if (parts.length === 0 && requireMod) { input.value = '需配合 Ctrl/Alt/Shift'; return; }
    const acc = (parts.length ? parts.join('+') + '+' : '') + key;
    input.value = acc;
    input.dataset.last = acc;
    // 注意：不自动失焦，捕获态保持到用户点走为止，避免录入的按键又被阅读快捷键触发
  });

  // 阅读快捷键执行（弹窗聚焦时生效）：上一章/下一章/上下滚动
  document.addEventListener('keydown', (e) => {
    if (state.captureInput) return;                       // 正在录入则不触发
    if (!els.panel.classList.contains('hidden')) return;  // 设置面板打开时不触发
    if (!state.novel) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (matchCombo(e, shortcuts.prev)) { e.preventDefault(); prevChapter(); return; }
    if (matchCombo(e, shortcuts.next)) { e.preventDefault(); nextChapter(false); return; }
    if (matchCombo(e, shortcuts.scrollUp)) { e.preventDefault(); els.body.scrollTop -= SCROLL_STEP; return; }
    if (matchCombo(e, shortcuts.scrollDown)) { e.preventDefault(); els.body.scrollTop += SCROLL_STEP; return; }
  });

  els.setSave.addEventListener('click', () => {
    const cfg = {
      intervalMin: Math.max(1, parseInt(els.setInterval.value, 10) || 8),
      bossKey: els.setBoss.dataset.last || els.setBoss.value,
      autoStart: els.setAuto.checked,
      openFull: els.setFull.checked,
      shortcuts: {
        prev: els.setPrev.dataset.last || els.setPrev.value,
        next: els.setNext.dataset.last || els.setNext.value,
        scrollUp: els.setScrollUp.dataset.last || els.setScrollUp.value,
        scrollDown: els.setScrollDown.dataset.last || els.setScrollDown.value,
      },
    };
    api.saveConfig(cfg).then((c) => {
      if (c && c.shortcuts) shortcuts = Object.assign({}, shortcuts, c.shortcuts);
      closeSettings();
    });
  });

  // ---- 初始化 ----
  (async () => {
    const cfg = await api.getConfig();
    openFull = !!(cfg && cfg.openFull); // 默认展开全文（缺省 true）
    if (cfg && cfg.shortcuts) shortcuts = Object.assign({}, shortcuts, cfg.shortcuts); // 读取已保存的快捷键
    // 优先恢复上次的导入 txt + 阅读进度
    let loaded = null;
    if (cfg && cfg.lastFile) loaded = await api.loadFile(cfg.lastFile);
    if (loaded && loaded.chapters && loaded.chapters.length) {
      restoreNovel(loaded, cfg.progress);
      return;
    }
    const sample = await api.getSample();
    if (sample) { restoreNovel(sample, cfg.progress); return; }
    // 浏览器预览回退：直接 fetch 本地示例
    try {
      const r = await fetch('sample-novel.json');
      restoreNovel(await r.json(), cfg.progress);
    } catch (e) {
      console.warn('示例小说加载失败（仅预览环境）', e);
    }
  })();
  startReveal();
})();

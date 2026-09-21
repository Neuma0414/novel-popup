// 纯 Node 模块：把 txt 文本解析为 { title, chapters:[{title, paragraphs:[]}] }
// 同时被主进程(main.js)和单元测试使用，不依赖 Electron。

const CN_NUM = '零一二三四五六七八九十百千两';

function parseNovel(text, fallbackTitle) {
  text = String(text || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const chapters = [];
  let cur = null;
  const re = new RegExp('^\\s*第\\s*([' + CN_NUM + '0-9]+)\\s*章\\s*(.*)$');

  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const title = ('第' + m[1] + '章 ' + (m[2] || '')).trim();
      cur = { title: title || ('第' + m[1] + '章'), paragraphs: [] };
      chapters.push(cur);
      continue;
    }
    const t = line.trim();
    if (!t) continue;
    if (!cur) {
      cur = { title: fallbackTitle || '正文', paragraphs: [] };
      chapters.push(cur);
    }
    cur.paragraphs.push(t);
  }

  if (chapters.length === 0) {
    chapters.push({
      title: fallbackTitle || '正文',
      paragraphs: lines.map((l) => l.trim()).filter(Boolean),
    });
  }

  // 过滤掉完全没内容的章节，但至少保留一章
  const nonEmpty = chapters.filter((c) => c.paragraphs.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : chapters;
}

module.exports = { parseNovel, CN_NUM };

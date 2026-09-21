// novel-parser 的最小单元测试，零依赖，直接跑 node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { parseNovel } = require('../src/novel-parser');

test('按「第N章」切分章节并保留章名', () => {
  const chapters = parseNovel('第一章 开始\n正文一\n\n第二章 继续\n正文二', '测试书');
  assert.strictEqual(chapters.length, 2);
  assert.strictEqual(chapters[0].title, '第一章 开始');
  assert.deepStrictEqual(chapters[0].paragraphs, ['正文一']);
  assert.strictEqual(chapters[1].title, '第二章 继续');
  assert.deepStrictEqual(chapters[1].paragraphs, ['正文二']);
});

test('支持中文数字与阿拉伯数字章节号', () => {
  const chapters = parseNovel('第十一章 甲\n内容\n第12章 乙\n内容', '测试书');
  assert.deepStrictEqual(chapters.map((c) => c.title), ['第十一章 甲', '第12章 乙']);
});

test('兼容 CRLF 换行', () => {
  const chapters = parseNovel('第一章 一\r\n内容甲\r\n第二章 二\r\n内容乙', '测试书');
  assert.strictEqual(chapters.length, 2);
  assert.deepStrictEqual(chapters[0].paragraphs, ['内容甲']);
});

test('没有章节标记时全部归入正文并用文件名兜底', () => {
  const chapters = parseNovel('第一段\n\n第二段', '我的小说');
  assert.strictEqual(chapters.length, 1);
  assert.strictEqual(chapters[0].title, '我的小说');
  assert.deepStrictEqual(chapters[0].paragraphs, ['第一段', '第二段']);
});

test('空章节被过滤掉', () => {
  const chapters = parseNovel('第一章\n\n第二章\n正文', '测试书');
  assert.strictEqual(chapters.length, 1);
  assert.strictEqual(chapters[0].title, '第二章');
  assert.deepStrictEqual(chapters[0].paragraphs, ['正文']);
});

test('空白段落被剔除', () => {
  const chapters = parseNovel('第一章 甲\n   \n正文\n\n\n', '测试书');
  assert.deepStrictEqual(chapters[0].paragraphs, ['正文']);
});

test('空字符串不抛错且至少返回一章', () => {
  const chapters = parseNovel('', '空书');
  assert.ok(Array.isArray(chapters));
  assert.strictEqual(chapters.length, 1);
  assert.strictEqual(chapters[0].title, '空书');
});

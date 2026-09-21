// 把 assets/tray-icon.png 封装成 Windows ICO（assets/tray-icon.ico）
// 只依赖 Node 内置模块：ICO 容器自 Vista 起允许直接内嵌 PNG 数据块。
// 用法：npm run gen-icon

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const OUT = path.join(__dirname, '..', 'assets', 'tray-icon.ico');

// 读取 PNG 尺寸（IHDR 位于固定偏移：8 字节签名 + 4 长度 + 4 类型）
function readPngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) throw new Error('不是合法的 PNG 文件');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// 单个尺寸的 ICO 容器：6 字节头 + 16 字节目录项 + PNG 原始数据
function buildIco(png, width, height) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(1, 4); // 图像数量

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0); // 0 表示 256
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // 调色板数量（真彩为 0）
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // 数据长度
  entry.writeUInt32LE(22, 12); // 数据偏移 = 6 + 16

  return Buffer.concat([header, entry, png]);
}

function main() {
  const png = fs.readFileSync(SRC);
  const { width, height } = readPngSize(png);
  fs.writeFileSync(OUT, buildIco(png, width, height));
  console.log(`已生成 ${path.relative(process.cwd(), OUT)}（${width}x${height}，${fs.statSync(OUT).size} 字节）`);
}

main();

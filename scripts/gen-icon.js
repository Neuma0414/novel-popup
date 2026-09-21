// 由 assets/tray-icon.png 生成一份「最小可用」的 assets/tray-icon.ico
// 只依赖 Node 内置模块：ICO 容器自 Vista 起允许直接内嵌 PNG 数据块。
//
// ⚠️ 注意：本脚本生成的是**单尺寸** ICO，而仓库中随源码提供的
//    assets/tray-icon.ico 是**多分辨率**版本（48/32/16/256 四层），
//    Windows 在不同 DPI 下会挑选对应层，显示效果更好。
//    直接运行本脚本会把那个多分辨率图标降级替换掉，因此默认带保护：
//    若生成结果小于现有文件，脚本会拒绝覆盖并退出。
//
// 用法：
//   npm run gen-icon        # 有保护，体积变小则拒绝
//   npm run gen-icon:force  # 强制覆盖
//   node scripts/gen-icon.js --force

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const OUT = path.join(__dirname, '..', 'assets', 'tray-icon.ico');
const FORCE = process.argv.includes('--force');

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

// 统计现有 ICO 内含的图像层数（偏移 4 字节处的 uint16）
function countIcoLayers(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return 0;
  return buf.readUInt16LE(4);
}

function main() {
  const png = fs.readFileSync(SRC);
  const { width, height } = readPngSize(png);
  const built = buildIco(png, width, height);
  const rel = path.relative(process.cwd(), OUT);

  if (fs.existsSync(OUT)) {
    const existing = fs.readFileSync(OUT);
    if (existing.length > built.length && !FORCE) {
      console.error('✋ 已阻止覆盖：现有 ICO 比生成结果更大，很可能是多分辨率版本。');
      console.error(`   现有 ${rel}：${existing.length} 字节，内含 ${countIcoLayers(existing)} 层图像`);
      console.error(`   本次生成：${built.length} 字节，仅含 1 层（${width}x${height}）`);
      console.error('   若确实要替换，请运行：npm run gen-icon:force');
      process.exit(1);
    }
  }

  fs.writeFileSync(OUT, built);
  console.log(`已生成 ${rel}（${width}x${height}，${built.length} 字节，1 层）`);
}

main();

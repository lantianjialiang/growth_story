/**
 * 由 `apps/web/public/favicon.svg` 生成各平台图标：
 *   favicon.ico        —— 16/32/48 三个尺寸，浏览器标签页与旧版书签
 *   apple-touch-icon   —— 180×180，直角满铺（iOS 自己会加圆角遮罩）
 *
 * 改图标只需要改 SVG，然后 `npm run icons`。
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve('apps/web/public');
const svg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');

/** 渲染一个尺寸的 PNG（density 拉高，避免小尺寸直接栅格化时糊） */
async function render(source, size) {
  return sharp(Buffer.from(source), { density: 512 }).resize(size, size).png().toBuffer();
}

/** PNG-in-ICO：Vista 以后的浏览器与 Windows 都认，比 BMP 版小且带透明 */
async function buildIco(sizes) {
  const pngs = await Promise.all(sizes.map((size) => render(svg, size)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const [index, png] of pngs.entries()) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[index] >= 256 ? 0 : sizes[index], 0); // width
    entry.writeUInt8(sizes[index] >= 256 ? 0 : sizes[index], 1); // height
    entry.writeUInt8(0, 2); // 调色板数量
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

// iOS 会自己裁圆角，所以给它的那张用直角满铺，否则四角会透出黑色
const squareSvg = svg.replace('rx="7"', 'rx="0"');

fs.writeFileSync(path.join(publicDir, 'favicon.ico'), await buildIco([16, 32, 48]));
await sharp(await render(squareSvg, 180)).toFile(path.join(publicDir, 'apple-touch-icon.png'));

for (const name of ['favicon.ico', 'apple-touch-icon.png']) {
  const { size } = fs.statSync(path.join(publicDir, name));
  console.log(`${name}  ${(size / 1024).toFixed(1)} KB`);
}

import { readdir, mkdir, cp, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 文件结构：manhua/作品名/章节名/漫画图片.jpg
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(ROOT, 'manhua');
const DIST = path.join(ROOT, 'dist');
// 可选：在 Cloudflare 构建变量中设 SITE_URL。未设置则使用根相对路径，避免错误的 localhost 或旧域名。
const ORIGIN = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
const absoluteUrl = url => ORIGIN ? ORIGIN + url : url;
const imageExt = /\.(?:jpe?g|png|webp|gif|avif|bmp)$/i;
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = segments => '/' + segments.map(s => encodeURIComponent(s)).join('/');
const idFor = (prefix, text) => prefix + '-' + createHash('sha256').update(text).digest('hex').slice(0, 12);

function numberFromChinese(text) {
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0, segment = 0, digit = 0;
  for (const char of text) {
    if (char in digits) digit = digits[char];
    else if (char in units) { segment += (digit || 1) * units[char]; digit = 0; }
    else if (char === '万') { total += (segment + digit) * 10000; segment = 0; digit = 0; }
    else return null;
  }
  return total + segment + digit;
}
function chapterNum(name) {
  const n = name.normalize('NFKC').replace(/\s+/g, '');
  const m = n.match(/第([零〇一二两三四五六七八九十百千万\d]+)(?:话|章|集|卷)/)
    || n.match(/^(?:chapter|ch|episode|ep)[-_]?([0-9]+)/i)
    || n.match(/^([0-9]+)(?:话|章|集|卷)?(?:\D|$)/)
    || n.match(/^(?:话|章|集)[-_]?([0-9]+)/);
  return m ? numberFromChinese(m[1]) : null;
}
function chapterSort(a, b) {
  const x = chapterNum(a), y = chapterNum(b);
  if (x !== null && y !== null && x !== y) return x - y;
  if (x !== null && y === null) return -1;
  if (x === null && y !== null) return 1;
  const partRank = name => /上半|上篇|前篇|上卷/.test(name) ? 0 : /下半|下篇|后篇|下卷/.test(name) ? 1 : 2;
  if (partRank(a) !== partRank(b)) return partRank(a) - partRank(b);
  return collator.compare(a, b);
}
async function isDir(p) { try { return (await stat(p)).isDirectory(); } catch { return false; } }
async function subfolders(dir) {
  return (await readdir(dir, { withFileTypes: true }))
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name);
}
async function findImages(dir, nested = []) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter(e => !e.name.startsWith('.'))
    .sort((a, b) => collator.compare(a.name, b.name));
  const output = [];
  for (const item of entries) {
    if (item.isDirectory()) output.push(...await findImages(path.join(dir, item.name), [...nested, item.name]));
    else if (item.isFile() && imageExt.test(item.name)) output.push([...nested, item.name]);
  }
  return output;
}
async function save(relative, data) {
  const filename = path.join(DIST, ...relative.split('/'));
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, data, 'utf8');
}
function shell(title, body, desc = '漫画阅读：按作品分组、自动分话、上下连续阅读') {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(desc)}"><title>${esc(title)}｜我的漫画</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#111114;color:#f5f5f5;font:16px/1.65 system-ui,-apple-system,'Microsoft YaHei',sans-serif}a{color:#bcdbff}header{background:#1d1d23;border-bottom:1px solid #34343d}header .bar{max-width:860px;padding:14px 16px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}header a{color:#fff;text-decoration:none;font-weight:700}header nav{display:flex;gap:12px;font-size:13px}header nav a{color:#bcdbff;font-weight:400}main{max-width:860px;margin:auto;min-height:45vh}.intro{padding:22px 16px 12px}h1{margin:0 0 6px;font-size:24px}.muted{color:#b7b7c2;font-size:14px;margin:0}.list{padding:5px 16px 36px;display:grid;gap:10px}.item{display:block;background:#212129;border:1px solid #34343d;border-radius:10px;padding:15px 18px;color:#fff;text-decoration:none}.item:hover{background:#2d2d39}.item strong{display:block;font-size:18px}.item small{color:#b8b8c5}.controls{padding:11px 16px 16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:14px}.pages{background:#000;line-height:0}.pages a{display:block;line-height:0}.pages img{display:block;width:100%;height:auto;vertical-align:bottom}.files{padding:15px 16px 26px}.files summary{color:#bcdbff;cursor:pointer}.files li{padding:3px 0;overflow-wrap:anywhere}.hint{padding:22px 16px}footer{border-top:1px solid #34343d;text-align:center;color:#9c9ca8;padding:20px;font-size:12px}@media(max-width:600px){h1{font-size:21px}.intro{padding:16px 14px 10px}.list{padding:3px 12px 24px}.controls{padding:10px 14px}}
</style></head><body><header><div class="bar"><a href="/">我的漫画</a><nav><a href="/comics.json">作品清单</a><a href="/chapters.json">章节清单</a><a href="/images.txt">图片链接</a></nav></div></header><main>${body}</main><footer>manhua / 作品名 / 章节名 / 图片 · GitHub 提交后自动生成</footer></body></html>\n`;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
if (await isDir(SOURCE)) {
  await cp(SOURCE, path.join(DIST, 'manhua'), { recursive: true, filter: p => !path.basename(p).startsWith('.') });
}

const comics = [];
let totalImages = 0;
const comicFolders = await isDir(SOURCE) ? (await subfolders(SOURCE)).sort((a, b) => collator.compare(a, b)) : [];
for (const comicName of comicFolders) {
  const comicDir = path.join(SOURCE, comicName);
  const folderNames = (await subfolders(comicDir)).sort(chapterSort);
  const chapters = [];
  const comicId = idFor('s', comicName);
  for (const folderName of folderNames) {
    const partsList = await findImages(path.join(comicDir, folderName));
    if (!partsList.length) continue;
    const chapterId = idFor('c', comicName + '/' + folderName);
    const images = partsList.map((parts, i) => {
      const url = enc(['manhua', comicName, folderName, ...parts]);
      return { number: i + 1, name: parts.at(-1), url, absoluteUrl: absoluteUrl(url) };
    });
    chapters.push({
      id: chapterId, number: chapters.length + 1, title: folderName,
      comic: comicName, folder: folderName, count: images.length,
      page: `/chapters/${chapterId}/`, imageList: `/chapters/${chapterId}/images.txt`, images
    });
    totalImages += images.length;
  }
  if (!chapters.length) continue;
  comics.push({ id: comicId, title: comicName, count: chapters.length,
    totalImages: chapters.reduce((n, ch) => n + ch.count, 0),
    page: `/comics/${comicId}/`, chapters });
}

const chapters = comics.flatMap(c => c.chapters);
const allImages = chapters.flatMap(ch => ch.images);
await save('comics.json', JSON.stringify({ title: '我的漫画', totalComics: comics.length, totalChapters: chapters.length, totalImages, comics }, null, 2) + '\n');
await save('chapters.json', JSON.stringify({ title: '我的漫画', totalChapters: chapters.length, totalImages, chapters }, null, 2) + '\n');
await save('images.txt', allImages.map(im => im.absoluteUrl).join('\n') + (allImages.length ? '\n' : ''));
const home = `<section class="intro"><h1>漫画目录</h1><p class="muted">${comics.length} 部漫画 · ${chapters.length} 话 · ${totalImages} 张图片</p></section>`
  + (comics.length ? `<div class="list">${comics.map(c => `<a class="item" href="${c.page}"><strong>${esc(c.title)}</strong><small>${c.count} 话 · ${c.totalImages} 张图片 →</small></a>`).join('\n')}</div>`
    : `<p class="hint">请把图片放进 manhua/漫画名称/章节名称/ 目录中，提交 GitHub 后会自动生成漫画。</p>`);
await save('index.html', shell('漫画目录', home));

for (const comic of comics) {
  const header = `<section class="intro"><h1>${esc(comic.title)}</h1><p class="muted">${comic.count} 话 · ${comic.totalImages} 张图片</p></section>`;
  const nav = '<div class="controls"><a href="/">← 所有漫画</a><a href="/chapters.json">章节 JSON</a></div>';
  const body = header + nav + `<div class="list">${comic.chapters.map(ch =>
    `<a class="item" href="${ch.page}"><strong>${esc(ch.title)}</strong><small>${ch.count} 张图片 →</small></a>`).join('\n')}</div>`;
  await save(`comics/${comic.id}/index.html`, shell(comic.title, body));
  for (let index = 0; index < comic.chapters.length; index++) {
    const ch = comic.chapters[index];
    const before = comic.chapters[index - 1], after = comic.chapters[index + 1];
    const navLinks = `<div class="controls"><a href="${comic.page}">← ${esc(comic.title)}目录</a>${before ? `<a href="${before.page}">← 上一话</a>` : ''}${after ? `<a href="${after.page}">下一话 →</a>` : ''}</div>`;
    const body = `<section class="intro"><h1>${esc(comic.title)} · ${esc(ch.title)}</h1><p class="muted">共 ${ch.count} 张图片 · 连续向下阅读</p></section>`
      + navLinks
      + `<div class="pages">${ch.images.map((image, i) =>
        `<a href="${esc(image.url)}" target="_blank" rel="noopener" title="点击查看原图"><img src="${esc(image.url)}" alt="${esc(comic.title)} ${esc(ch.title)} 第${i + 1}张" ${i < 2 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>`).join('\n')}</div>`
      + `<details class="files"><summary>本话 ${ch.count} 张图片的直接链接</summary><ol>${ch.images.map(image => `<li><a href="${esc(image.url)}" target="_blank" rel="noopener">${esc(image.name)}</a></li>`).join('\n')}</ol></details>`
      + `<div class="controls"><a href="${ch.imageList}">本话图片 TXT</a><a href="${comic.page}">返回漫画目录</a>${after ? `<a href="${after.page}">下一话 →</a>` : ''}</div>`;
    await save(`chapters/${ch.id}/index.html`, shell(`${comic.title} · ${ch.title}`, body));
    await save(`chapters/${ch.id}/images.json`, JSON.stringify({ comic: comic.title, title: ch.title, count: ch.count, images: ch.images }, null, 2) + '\n');
    await save(`chapters/${ch.id}/images.txt`, ch.images.map(im => im.absoluteUrl).join('\n') + '\n');
  }
}
const sitemapPages = ['/', ...comics.map(c => c.page), ...chapters.map(ch => ch.page)];
if (ORIGIN) {
  await save('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapPages.map(url => `<url><loc>${esc(ORIGIN + url)}</loc></url>`).join('')}</urlset>`);
  await save('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
} else {
  await save('robots.txt', 'User-agent: *\nAllow: /\n');
}
console.log(`SUCCESS: ${comics.length} 部漫画 / ${chapters.length} 话 / ${totalImages} 张图片`);
for (const comic of comics) console.log(`《${comic.title}》${comic.count}话：${comic.chapters.map(ch => ch.title + '(' + ch.count + ')').join('、')}`);

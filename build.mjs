import { readdir, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(ROOT, 'assets');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = (process.env.SITE_URL || 'https://manhuaceshi.942964272.workers.dev').trim().replace(/\/+$/, '');
const imageExt = /\.(?:jpe?g|png|webp|gif|avif|bmp)$/i;
const collator = new Intl.Collator('zh-CN', {numeric:true,sensitivity:'base'});

function chineseNumber(text) {
  if (/^\d+$/.test(text)) return Number(text);
  const nums = {零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const units = {十:10,百:100,千:1000};
  let total=0,segment=0,digit=0;
  for(const char of text){
    if(char in nums){digit=nums[char];}
    else if(char in units){segment += (digit || 1)*units[char];digit=0;}
    else if(char==='万'){total+=(segment+digit)*10000;segment=0;digit=0;}
    else return null;
  }
  return total+segment+digit;
}
function chapterOrder(name) {
  const n = name.normalize('NFKC').replace(/\s+/g,'');
  const match = n.match(/第([零〇一二两三四五六七八九十百千万\d]+)(?:话|章|集|卷)/) ||
    n.match(/^(?:chapter|ch|episode|ep|话|章)?[_-]?([0-9]+)(?:\b|\D|$)/i) ||
    n.match(/^([零〇一二两三四五六七八九十百千万]+)(?:话|章|集)/) ||
    n.match(/(\d+)/);
  return match ? chineseNumber(match[1]) : null;
}
function chapterLabel(folder, position) {
  const m=folder.normalize('NFKC').match(/第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*(话|章|集)/);
  return m ? `第${m[1]}${m[2]}` : `第 ${position} 话`;
}
function folderSort(a,b){
  const aa=chapterOrder(a), bb=chapterOrder(b);
  if(aa!==null && bb!==null && aa!==bb) return aa-bb;
  if(aa!==null && bb===null) return -1;
  if(aa===null && bb!==null) return 1;
  return collator.compare(a,b);
}
const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc = parts => '/' + parts.map(p=>encodeURIComponent(p)).join('/');
const urlFor = segments => enc(segments);
function makePage(title, body, description='我的漫画：自动分话、上下连续阅读、图片公开直链'){
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(description)}"><title>${esc(title)}｜我的漫画</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#101014;color:#fafafa;font:16px/1.65 system-ui,-apple-system,'Microsoft YaHei',sans-serif}a{color:#b9d7ff}a:focus-visible{outline:2px solid #b9d7ff;outline-offset:3px}header{background:#1b1b21;border-bottom:1px solid #35353d}header .bar{max-width:860px;margin:auto;padding:14px 16px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px}header a{color:#fff;text-decoration:none;font-weight:700}header nav{display:flex;gap:14px;font-size:13px}header nav a{color:#b9d7ff;font-weight:400}main{max-width:860px;margin:0 auto;min-height:45vh}.intro{padding:22px 16px 12px}h1{font-size:25px;margin:0 0 4px}.muted{color:#aeb0b8;font-size:14px;margin:0}.list{padding:0 16px 32px;display:grid;gap:9px}.chapter{display:block;border:1px solid #35353d;border-radius:9px;padding:15px 18px;background:#202027;text-decoration:none;color:#fff}.chapter span{display:block;font-weight:700;font-size:18px}.chapter small{color:#b9b9c4}.chapter:hover{background:#2a2a35}.controls{padding:10px 16px 15px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:14px}.pages{margin:0 auto;max-width:860px;background:#000;line-height:0}.pages a{display:block;line-height:0}.pages img{display:block;width:100%;height:auto;max-width:100%;margin:0;border:0;vertical-align:bottom}.files{padding:12px 16px 26px}.files summary{cursor:pointer;color:#b9d7ff}.files li{padding:4px 0;word-break:break-all}.hint{padding:24px 16px;color:#c7c7ce}footer{border-top:1px solid #35353d;text-align:center;color:#9898a3;font-size:12px;padding:20px 14px}@media(max-width:600px){h1{font-size:22px}.intro{padding:16px 14px 10px}.list{padding:0 12px 24px}.files{padding:14px}.controls{padding:10px 14px}}
</style></head><body><header><div class="bar"><a href="/">我的漫画</a><nav><a href="/chapters.json">章节清单</a><a href="/images.txt">全部图片链接</a></nav></div></header><main>${body}</main><footer>每个 assets 一级子文件夹自动生成一话 · 无需运行更新工具</footer></body></html>\n`;
}
async function walk(dir, prefix=[]) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files=[];
  for (const entry of entries.sort((a,b)=>collator.compare(a.name,b.name))){
    if(entry.name.startsWith('.'))continue;
    if(entry.isDirectory())files.push(...await walk(path.join(dir,entry.name),[...prefix,entry.name]));
    else if(entry.isFile() && imageExt.test(entry.name))files.push([...prefix, entry.name]);
  }
  return files;
}
async function save(relative, content){
  const dest=path.join(DIST,...relative.split('/'));
  await mkdir(path.dirname(dest),{recursive:true});
  await writeFile(dest,content,'utf8');
}

await rm(DIST,{recursive:true,force:true});
await mkdir(DIST,{recursive:true});
await mkdir(ASSETS,{recursive:true});
await cp(ASSETS,path.join(DIST,'assets'),{recursive:true,filter:p=>!path.basename(p).startsWith('.')});
const dirs=(await readdir(ASSETS,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name).sort(folderSort);
const chapters=[];
for(const folder of dirs){
  const pictures=await walk(path.join(ASSETS,folder));
  if(!pictures.length)continue;
  const number=chapters.length+1;
  const slug='c-'+createHash('sha256').update(folder).digest('hex').slice(0,12);
  const images=pictures.map((parts,i)=>{
    const url=urlFor(['assets',folder,...parts]);
    return {number:i+1,name:parts.at(-1),url,absoluteUrl:ORIGIN+url};
  });
  const ch={id:slug,number,title:chapterLabel(folder,number),folder,count:images.length,page:`/chapters/${slug}/`,imageList:`/chapters/${slug}/images.txt`,images};
  chapters.push(ch);
}
const allImages=chapters.flatMap(ch=>ch.images);
const manifest={title:'我的漫画',totalChapters:chapters.length,totalImages:allImages.length,chapters};
await save('chapters.json',JSON.stringify(manifest,null,2)+'\n');
await save('images.txt',allImages.map(i=>i.absoluteUrl).join('\n')+(allImages.length?'\n':''));
await save('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
const sitemapLinks=['/',...chapters.map(ch=>ch.page)];
await save('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapLinks.map(url=>`<url><loc>${esc(ORIGIN+url)}</loc></url>`).join('')}</urlset>`);
const homeBody=`<section class="intro"><h1>漫画目录</h1><p class="muted">${chapters.length} 话 · ${allImages.length} 张图片 · 点击章节连续向下阅读</p></section>`+
  (chapters.length ? `<div class="list">${chapters.map(ch=>`<a class="chapter" href="${ch.page}"><span>${esc(ch.title)}</span><small>${esc(ch.folder)} · ${ch.count} 张图片 →</small></a>`).join('\n')}</div>` : '<p class="hint">还没有发现漫画图片。请在 assets 下添加章节文件夹和图片，然后通过 GitHub 提交以触发 Cloudflare 自动构建。</p>')+
  `<section class="controls"><a href="/chapters.json">查看所有章节及图片 URL</a><a href="/images.txt">查看全部图片直链</a></section>`;
await save('index.html',makePage('章节目录',homeBody));
for(let n=0;n<chapters.length;n++){
  const ch=chapters[n];
  const previous=chapters[n-1];const next=chapters[n+1];
  const nav = `<div class="controls"><a href="/">← 返回目录</a>${previous?`<a href="${previous.page}">← 上一话</a>`:''}${next?`<a href="${next.page}">下一话 →</a>`:''}</div>`;
  const body=`<section class="intro"><h1>${esc(ch.title)}</h1><p class="muted">文件夹：${esc(ch.folder)} · ${ch.count} 张图片</p></section>`+nav+
    `<div class="pages">${ch.images.map((image,i)=>`<a href="${esc(image.url)}" target="_blank" rel="noopener" title="点击查看原图"><img src="${esc(image.url)}" alt="${esc(ch.title)} · 第 ${i+1} 张 · ${esc(image.name)}" ${i<2?'loading="eager" fetchpriority="high"':'loading="lazy"'} decoding="async"></a>`).join('\n')}</div>`+
    `<details class="files"><summary>本话全部 ${ch.count} 张图片的直接链接</summary><ol>${ch.images.map(image=>`<li><a target="_blank" rel="noopener" href="${esc(image.url)}">${esc(image.name)}</a></li>`).join('\n')}</ol></details>`+
    `<div class="controls"><a href="${ch.imageList}">本话图片清单 TXT</a><a href="/">返回目录</a>${next?`<a href="${next.page}">下一话 →</a>`:''}</div>`;
  await save(`chapters/${ch.id}/index.html`,makePage(ch.title,body));
  await save(`chapters/${ch.id}/images.txt`,ch.images.map(i=>i.absoluteUrl).join('\n')+'\n');
  await save(`chapters/${ch.id}/images.json`,JSON.stringify({title:ch.title,folder:ch.folder,count:ch.count,images:ch.images},null,2)+'\n');
}
console.log('SUCCESS: '+chapters.length+' 话 / '+allImages.length+' 张漫画图片');
chapters.forEach(ch=>console.log(`${ch.title}: ${ch.folder}, ${ch.count} 张, ${ch.page}`));

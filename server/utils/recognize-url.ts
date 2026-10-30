import { RECOG_CACHE_PREFIX, getRedis } from "./redis";

interface RecognizedMeta {
  title: string;
  description?: string;
  favicon?: string;
}

/** 单次抓取超时（ms） */
const REQUEST_TIMEOUT = 5000;
/** 整体硬超时（ms）：覆盖「首次请求 + 协议回退重试」两次机会 */
const TOTAL_TIMEOUT = 11000;
/** 响应体最多下载 8MB，避免超大页面吃满内存 */
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
/** 只解析前 2MB：title/meta 必然在文档开头，后面的正文无需参与正则匹配 */
const MAX_PARSE_BYTES = 2 * 1024 * 1024;
/** head 里什么都没取到时，回退扫描正文的最大范围 */
const FALLBACK_SCAN_BYTES = 300_000;
/** 卡片展示用：过长会撑破布局，超出部分截断 */
const TITLE_MAX_LENGTH = 200;
const DESC_MAX_LENGTH = 300;
/** 抓到真实标题时的缓存时长（s） */
const CACHE_TTL_HIT = 7 * 86400;
/** 只拿到兜底标题（域名）时的缓存时长（s）：短一些，便于尽快重试 */
const CACHE_TTL_WEAK = 6 * 3600;
/** 缓存键剔除的跟踪参数：同一页面因 utm 等参数不同没必要缓存多份 */
const TRACKING_PARAM_RE =
  /^(utm_|spm_?|hmsr|hmmd|_ga|fbclid|gclid|mc_[ce]id|from|ref|ref_src|share|share_source)/i;
/** 反爬挑战页 / 错误页标题特征：命中说明没拿到页面真实内容，继续走兜底 */
const BLOCKED_TITLE_RE =
  /just a moment|attention required|access denied|are you a (?:robot|human)|verifying you are human|bot verification|enable javascript|javascript (?:is )?(?:required|disabled)|请\s*(?:开启|启用)\s*javascript|403 forbidden|404 not found|安全验证|访问验证|人机验证|访问被拒绝|页面不存在|页面加载中/i;
/** 解码后替换字符（U+FFFD）占比超过该阈值 → 判定编码猜错 */
const REPLACEMENT_CHAR_RATIO = 0.02;

/**
 * 清理 URL：去除首尾空白、零宽字符、尾部多余反斜杠。
 * 保留协议部分的 `://` 不受影响。
 */
export function cleanUrl(raw: string): string {
  if (!raw) return "";
  let url = raw
    .trim()
    // 去除零宽字符等不可见字符
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  // 去除路径尾部的反斜杠，但不影响协议中的 ://
  const protoEnd = url.indexOf("://");
  if (protoEnd !== -1) {
    const rest = url.slice(protoEnd + 3);
    // 只清理路径部分多余的 /，至少保留一个
    const cleanedRest = rest.replace(/\/+$/, "");
    url = url.slice(0, protoEnd + 3) + (cleanedRest || "");
  }
  return url;
}

/**
 * 链接查重键：`Link.urlKey` 的唯一约束维度（userId + urlKey）。
 * 必须与数据库迁移里的回填口径一致（cleanUrl 后小写）。
 */
export function linkUrlKey(raw: string): string {
  return cleanUrl(raw).toLowerCase();
}

/* ---------------------------------- 文本清洗 --------------------------------- */

/** 常见命名实体（数字实体走通用分支，无需穷举）。 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
  trade: "™",
  reg: "®",
  copy: "©",
  times: "×",
  laquo: "«",
  raquo: "»",
};

/** 解码 HTML 实体（命名实体 + 十进制 / 十六进制数字实体 + 被二次转义的实体）。 */
function decodeEntities(input: string): string {
  return input
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, (all, name) => NAMED_ENTITIES[name.toLowerCase()] ?? all)
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(Number(dec)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    // 二次转义：`&amp;nbsp;` 第一轮变成 `&nbsp;`，这里再解一层
    .replace(/&amp;(#?[a-zA-Z0-9]{1,10};)/g, (_, entity) => decodeEntities(`&${entity}`));
}

function fromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** 逐个码点过滤控制字符（保留 \u0020 以上可见字符，含中文/Emoji）。 */
function stripControlChars(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out;
}

/** 解码实体 → 去标签 → 去控制字符 → 折叠空白 → 截断。 */
function normalizeText(input: string, maxLength: number): string {
  if (!input) return "";
  const text = stripControlChars(decodeEntities(input).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/**
 * 去掉注释与脚本/样式等噪声。
 * 否则内联脚本里的字符串（如 `document.title = "…"`）和内联 SVG 的 `<title>`
 * 会被误当成页面标题。
 */
function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

/* --------------------------------- 结构提取 ---------------------------------- */

/** 取 <head> 片段；无 head 标签时回退全文前 200KB，避免正文/脚本干扰。 */
function extractHead(html: string): string {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
  return m ? m[1] : html.slice(0, 200_000);
}

/** 取 <title> 文本。 */
function extractTitleTag(scope: string): string {
  const m = scope.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return m ? normalizeText(m[1], TITLE_MAX_LENGTH) : "";
}

/** 兜底：取首个 <h1>（文章类页面通常就是正文标题）。 */
function extractFirstHeading(scope: string): string {
  const m = scope.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i);
  return m ? normalizeText(m[1], TITLE_MAX_LENGTH) : "";
}

/** 兜底：取正文里第一个像样的段落（短句多为导航/版权，跳过）。 */
function extractFirstParagraph(scope: string): string {
  const body = scope.replace(/^[\s\S]*?<body\b[^>]*>/i, "");
  const re = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let best = "";
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = re.exec(body)) && scanned++ < 20) {
    const text = normalizeText(m[1], DESC_MAX_LENGTH);
    if (text.length >= 40) return text;
    if (text.length > best.length) best = text;
  }
  return best.length >= 20 ? best : "";
}

/**
 * 读取 HTML 标签的某个属性值。
 * 支持双引号 / 单引号 / 无引号三种写法；要求属性名前是空白，避免 `data-name=`
 * 这类相似属性被误匹配。
 */
function readAttr(tag: string, attr: string): string {
  const re = new RegExp(
    `\\s${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i"
  );
  const m = tag.match(re);
  if (!m) return "";
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim();
}

/**
 * 收集 <meta>：name / property / itemprop 统一小写作为 key，指向 content。
 * 逐个标签匹配，因此 content 写在 name/property 前后都能正确识别；
 * 同名的 meta 只保留第一个非空值（后写的多为重复或空占位）。
 */
function collectMeta(scope: string): Map<string, string> {
  const map = new Map<string, string>();
  const tagRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(scope))) {
    const content = readAttr(m[0], "content");
    if (!content) continue;
    for (const attr of ["name", "property", "itemprop"]) {
      const key = readAttr(m[0], attr).toLowerCase();
      if (key && !map.has(key)) map.set(key, content);
    }
  }
  return map;
}

interface LdFields {
  /** 页面级标题（Article/WebPage 的 headline），优先于站点级的 name */
  headline: string;
  /** 站点级名称（WebSite/Organization 的 name） */
  name: string;
  description: string;
}

/** JSON-LD 里的 headline/name/description（SPA、结构化数据站点的常见兜底来源）。 */
function extractJsonLdFields(scope: string): LdFields {
  const re =
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  const out: LdFields = { headline: "", name: "", description: "" };
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope))) {
    const raw = m[1]
      .trim()
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "");
    try {
      collectLd(JSON.parse(raw), out);
    } catch {
      // JSON-LD 常混入注释/尾随逗号，解析失败直接跳过（只是兜底来源）
    }
    if (out.headline && out.description) break;
  }
  return out;
}

function collectLd(node: unknown, out: LdFields): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 20)) collectLd(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  // @graph 是 JSON-LD 常见的分层写法
  if ("@graph" in obj) collectLd(obj["@graph"], out);

  if (!out.headline && typeof obj.headline === "string") {
    out.headline = normalizeText(obj.headline, TITLE_MAX_LENGTH);
  }
  if (!out.name && typeof obj.name === "string") {
    out.name = normalizeText(obj.name, TITLE_MAX_LENGTH);
  }
  if (!out.description && typeof obj.description === "string") {
    out.description = normalizeText(obj.description, DESC_MAX_LENGTH);
  }
}

/* ---------------------------------- 编码处理 --------------------------------- */

/** 单字节映射解码（latin1）：用于在任意编码下保持 ASCII 字节不变，便于正则嗅探 */
function latin1(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/**
 * 推断 HTML 的字符集：优先用响应头 Content-Type 的 charset，其次 <meta charset>。
 * 只嗅探前 2KB（meta 必然在 head 中），并用 latin1 读取——latin1 是单字节映射，
 * 不会改写任何字节，因此 ASCII 部分的正则在 GBK/Big5 等多字节编码下依然能正确匹配。
 */
function detectCharset(bytes: Uint8Array, contentType?: string): string {
  if (contentType) {
    const m = contentType.match(/charset\s*=\s*["']?([\w-]+)/i);
    if (m) return m[1];
  }
  const sniff = latin1(bytes.subarray(0, 2048));
  const meta =
    sniff.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i) ||
    sniff.match(
      /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*["']?([\w-]+)/i
    );
  if (meta) return meta[1];
  return "utf-8";
}

/** BOM 判编码：UTF-16 页面只能靠 BOM 区分（其 meta charset 往往还写着 UTF-8）。 */
function detectBomCharset(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  }
  return null;
}

function tryDecode(bytes: Uint8Array, charset: string): string {
  // TextDecoder 遵循 WHATWG 编码标准，原生支持 gbk / gb18030 / big5 / shift_jis /
  // euc-kr 等，无需引入 iconv-lite 这类携带编码表的依赖。
  // fatal:false 保证个别非法字节只被替换成 U+FFFD，不会让整次识别失败。
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    // 不支持的编码名会抛 RangeError
    return "";
  }
}

/** 替换字符占比过高 = 编码猜错（GBK 按 UTF-8 解、或反之都会大量出现 U+FFFD）。 */
function hasTooManyReplacements(text: string): boolean {
  const sample = text.slice(0, 20_000);
  if (!sample) return false;
  let count = 0;
  for (const ch of sample) if (ch === "\uFFFD") count++;
  return count / sample.length > REPLACEMENT_CHAR_RATIO;
}

/** 按字符集解码 HTML 字节；猜错时自动回退到另一种常见编码再试。 */
function decodeHtml(bytes: Uint8Array, contentType?: string): string {
  const bomCharset = detectBomCharset(bytes);
  if (bomCharset) {
    const text = tryDecode(bytes, bomCharset);
    if (text) return text.replace(/^\uFEFF/, "");
  }

  const primary = detectCharset(bytes, contentType);
  const decoded = tryDecode(bytes, primary) || tryDecode(bytes, "utf-8");
  if (!hasTooManyReplacements(decoded)) return decoded;

  // gb18030 是 GBK/GB2312 的超集，覆盖绝大多数中文老站；另一头再试 UTF-8
  for (const alt of ["utf-8", "gb18030"]) {
    if (alt === primary.toLowerCase()) continue;
    const candidate = tryDecode(bytes, alt);
    if (candidate && !hasTooManyReplacements(candidate)) return candidate;
  }
  return decoded;
}

/* ---------------------------------- 抓取 ------------------------------------ */

/** 只解析 HTML 类响应；PDF / 图片 / JSON 等直接放弃，避免解出乱码。 */
function isHtmlLike(contentType: string): boolean {
  return /text\/html|application\/xhtml|\+xml/i.test(contentType);
}

/** 读取响应体，超过上限立即截断（避免超大页面吃满内存）。 */
async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).subarray(0, maxBytes);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }

  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    const take = Math.min(chunk.byteLength, out.length - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/** 抓取并解码目标 URL 的 HTML；非 HTML 内容或失败返回空串。 */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  // 部分站点对爬虫返回 403，但仍输出带 meta 的页面，允许解析
  if (!res.ok && res.status !== 403) return "";
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType && !isHtmlLike(contentType)) return "";

  // 取原始字节自行解码：固定按 UTF-8 解会让 GBK/Big5 站点直接乱码
  const bytes = await readBodyCapped(res, MAX_DOWNLOAD_BYTES);
  return decodeHtml(bytes.subarray(0, MAX_PARSE_BYTES), contentType);
}

/** 协议回退：http↔https。多数站点只开放其中一种，互换后往往就能抓到。 */
function alternateUrl(parsed: URL): string | null {
  if (parsed.protocol === "http:") return parsed.href.replace(/^http:/, "https:");
  if (parsed.protocol === "https:") return parsed.href.replace(/^https:/, "http:");
  return null;
}

async function fetchHtmlWithFallback(url: string, parsed: URL): Promise<string> {
  try {
    const html = await fetchHtml(url);
    if (html) return html;
  } catch {
    // 首次失败（超时 / DNS / 5xx / 连接重置）→ 尝试换协议重试
  }
  const alt = alternateUrl(parsed);
  if (!alt || alt === url) return "";
  try {
    return await fetchHtml(alt);
  } catch {
    return "";
  }
}

/**
 * 整体硬超时：即使外部站点极慢（DNS 挂起等 axios timeout 覆盖不到的场景），
 * 识别也不会无限等待，保证接口及时响应。超时按「未抓到」处理。
 */
async function withTimeout(promise: Promise<string>, ms: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(""), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* --------------------------------- 标题/描述 --------------------------------- */

function isUsableTitle(text: string): boolean {
  if (text.length < 2) return false;
  if (BLOCKED_TITLE_RE.test(text)) return false;
  return !/^(undefined|null|none|document|untitled|index|home|首页)$/i.test(text);
}

/** 按优先级取第一个「可用」标题。 */
function pickTitle(candidates: string[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isUsableTitle(candidate)) return candidate;
  }
  return "";
}

/** 按优先级取第一个像样的描述；与标题完全重复的直接跳过（没有信息量）。 */
function pickDescription(candidates: string[], title: string): string {
  for (const candidate of candidates) {
    if (!candidate || candidate.length < 2) continue;
    if (title && candidate.toLowerCase() === title.toLowerCase()) continue;
    return candidate;
  }
  return "";
}

/** 兜底标题用域名（去掉 www.），比留空更容易被用户接受。 */
function prettyHostname(parsed: URL): string {
  return parsed.hostname.replace(/^www\./i, "") || parsed.hostname;
}

/* ----------------------------------- 主流程 ---------------------------------- */

/**
 * 直接拼接 faviconsnap 图片接口 URL 作为 favicon 中转地址。
 * faviconsnap 会自行判断站点、转中图片并带缓存，前端可直接作为 <img> src，
 * 无需再经过本地 /api/favicon 代理，也无需额外请求确认。
 * size=64：卡片展示 40px，64 保证高分屏清晰（API 支持 16/32/64/128）。
 */
function buildFaviconProxyUrl(url: string): string {
  // 只保留站点域名（去掉路径/查询/hash），faviconsnap 按域名识别站点图标最准确
  let root = url;
  try {
    root = new URL(url).origin;
  } catch {
    // URL 解析失败则原样使用
  }
  return `https://faviconsnap.com/api/favicon?url=${root}&size=64`;
}

/**
 * 缓存键用「规范化后的完整 URL」：同一站点的不同页面标题/描述不同，
 * 只按域名缓存会让整站所有链接共用首页标题。
 */
function buildCacheKey(parsed: URL): string {
  const u = new URL(parsed.href);
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM_RE.test(key)) u.searchParams.delete(key);
  }
  return u.toString().replace(/\/+$/, "") || u.toString();
}

/** 从 HTML 里解析标题与描述（多级兜底）。 */
function parseMeta(html: string): { title: string; description: string } {
  // JSON-LD 要从未去噪的 head 里取（stripNoise 会连 script 一起删掉）
  const ld = extractJsonLdFields(extractHead(html));
  const clean = stripNoise(html);
  const head = extractHead(clean);
  const meta = collectMeta(head);

  // 少数页面把 title / og 标签写在 body 里：head 完全没有货时，扩大扫描范围
  let scope = head;
  const hasUsefulHeadMeta =
    [...meta.keys()].some((k) => k.includes("title") || k.includes("description")) ||
    meta.has("og:site_name");
  if (!extractTitleTag(head) && !hasUsefulHeadMeta) {
    scope = clean.slice(0, FALLBACK_SCAN_BYTES);
    for (const [k, v] of collectMeta(scope)) if (!meta.has(k)) meta.set(k, v);
  }

  const title = pickTitle([
    extractTitleTag(head) || extractTitleTag(scope),
    meta.get("og:title") ?? "",
    meta.get("twitter:title") ?? "",
    meta.get("title") ?? "",
    ld.headline,
    extractFirstHeading(scope),
    ld.name,
    meta.get("og:site_name") ?? "",
    meta.get("application-name") ?? "",
  ]);

  const description = pickDescription(
    [
      meta.get("description") ?? "",
      meta.get("og:description") ?? "",
      meta.get("twitter:description") ?? "",
      ld.description,
      extractFirstParagraph(scope),
    ],
    title
  );

  return { title, description };
}

/**
 * 从目标 URL 的 HTML 中解析标题、描述；favicon 由 faviconsnap 中转生成。
 * 失败时标题回退为域名，description 为空（不抛异常）。
 *
 * 说明：这里刻意不使用 cheerio。cheerio 会连带引入 iconv-lite（GBK/Big5/
 * Shift_JIS 等编码表）与 whatwg-encoding，实测给 Serverless 页面包增加约
 * 0.9MB；而本函数只需要取 title 与 description 两个字符串，正则即可等价实现。
 *
 * 编码问题本来也不靠 cheerio 解决：按 UTF-8 解成字符串后再解析，对 GBK 站点
 * 一样是乱码。这里取原始字节，由 detectCharset + TextDecoder 自行解码。
 */
export async function recognizeUrl(url: string): Promise<RecognizedMeta> {
  const cleanedUrl = cleanUrl(url);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanedUrl);
  } catch {
    return { title: "" };
  }

  // 跨用户共享缓存：同一 URL 的标题/描述基本不变。
  // 仅 Redis 模式生效；缓存错误一律吞掉，回退到真实抓取。
  const client = getRedis();
  const cacheKey = RECOG_CACHE_PREFIX + buildCacheKey(parsedUrl);
  if (client) {
    try {
      const cached = await client.get<RecognizedMeta>(cacheKey);
      // 只信任有标题的缓存：favicon 是无条件生成的，不能作为命中依据
      if (cached && cached.title) return cached;
    } catch {
      // 忽略缓存异常，走真实抓取
    }
  }

  const html = await withTimeout(
    fetchHtmlWithFallback(cleanedUrl, parsedUrl),
    TOTAL_TIMEOUT
  );
  let parsed = { title: "", description: "" };
  try {
    if (html) parsed = parseMeta(html);
  } catch {
    // 解析异常（畸形 HTML / 超大 JSON-LD 等）不应影响接口，按未取到处理
  }
  const weak = !parsed.title;

  // favicon 统一使用 faviconsnap 中转 URL（faviconsnap 负责识别站点、转中图 + 缓存），
  // 前端可直接作为 <img> src，无需再经过本地 /api/favicon 代理
  const favicon = buildFaviconProxyUrl(cleanedUrl);

  const result: RecognizedMeta = {
    title: parsed.title || prettyHostname(parsedUrl),
    description: parsed.description || undefined,
    favicon: favicon || undefined,
  };

  if (client) {
    try {
      await client.set(cacheKey, JSON.stringify(result), {
        ex: weak ? CACHE_TTL_WEAK : CACHE_TTL_HIT,
      });
    } catch {
      // 写缓存失败不影响本次响应
    }
  }

  return result;
}

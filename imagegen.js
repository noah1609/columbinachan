// Tạo ảnh bằng Pollinations.ai.
// - Không có key: dùng API miễn phí kiểu cũ (image.pollinations.ai): 1 yêu cầu / lúc, có logo nhỏ, đôi khi báo 503 khi quá tải.
// - Có key (đăng ký ở enter.pollinations.ai, đặt POLLINATIONS_KEY=sk_... trong .env): dùng API mới gen.pollinations.ai, ổn định hơn, không logo.

const TOKEN = process.env.POLLINATIONS_KEY || process.env.POLLINATIONS_TOKEN || '';
const MODEL = process.env.IMAGE_MODEL || 'flux';
const GAP_MS = TOKEN ? 3000 : 16000; // khoảng cách tối thiểu giữa 2 lần tạo ảnh
const TIMEOUT_MS = 120000;

// Chặn nội dung không phù hợp trước khi gửi đi (ngoài bộ lọc safe=true của Pollinations)
const BLOCK = /\b(nsfw|nude|naked|nudity|sex|sexual|porn|hentai|erotic|lingerie|underwear|gore|dismember|khỏa thân|khoả thân|lõa thể|sex|đồi trụy|máu me)\b/i;

export const SIZES = {
  square: [1024, 1024],
  landscape: [1280, 720],
  portrait: [768, 1152],
};

let queue = Promise.resolve();
let lastAt = 0;

export function isBlockedPrompt(prompt) {
  return BLOCK.test(prompt || '');
}

async function fetchImage(prompt, { size = 'square', seed } = {}) {
  const [width, height] = SIZES[size] || SIZES.square;
  const p = encodeURIComponent(prompt.slice(0, 800));
  const common = { width: String(width), height: String(height), seed: String(seed ?? Math.floor(Math.random() * 1e9)) };
  const url = TOKEN
    ? `https://gen.pollinations.ai/image/${p}?${new URLSearchParams({ ...common, model: MODEL, nologo: 'true', safe: 'true', private: 'true' })}`
    : `https://image.pollinations.ai/prompt/${p}?${new URLSearchParams(common)}`; // bản miễn phí chỉ có 1 model, không chọn model
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
      signal: ctrl.signal,
    });
    if (res.status === 429) throw Object.assign(new Error('Tạo ảnh quá nhanh (429)'), { code: 'RATE' });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Pollinations từ chối key (${res.status}) — kiểm tra POLLINATIONS_KEY`), { code: 'AUTH' });
    if (res.status === 402) throw Object.assign(new Error('Pollinations: hết credit (402)'), { code: 'CREDIT' });
    if (res.status >= 500) throw Object.assign(new Error(`Pollinations đang quá tải (${res.status})`), { code: 'BUSY' });
    if (!res.ok) throw new Error(`Pollinations lỗi ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error(`Pollinations không trả về ảnh (${type})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error('Ảnh trả về bị lỗi');
    return { buffer: buf, ext: type.includes('png') ? 'png' : 'jpg' };
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('Tạo ảnh quá lâu'), { code: 'TIMEOUT' });
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// Xếp hàng: mỗi lần chỉ tạo 1 ảnh, cách nhau GAP_MS.
// Quá tải (5xx), quá nhanh (429) hay quá lâu -> thử lại tối đa 2 lần nữa, đợi 5 rồi 15 giây.
const RETRY_WAIT = [5000, 15000];
export function generateImage(prompt, opts = {}) {
  if (isBlockedPrompt(prompt)) return Promise.reject(Object.assign(new Error('Nội dung không phù hợp'), { code: 'BLOCKED' }));
  const job = queue.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fetchImage(prompt, opts);
        } catch (err) {
          const retryable = ['BUSY', 'RATE', 'TIMEOUT'].includes(err.code) || /fetch failed|ECONNRESET|ETIMEDOUT/i.test(err.message);
          if (!retryable || attempt >= RETRY_WAIT.length) throw err;
          console.warn(`${err.message}, thử lại sau ${RETRY_WAIT[attempt] / 1000} giây…`);
          await new Promise((r) => setTimeout(r, err.code === 'RATE' ? Math.max(GAP_MS, RETRY_WAIT[attempt]) : RETRY_WAIT[attempt]));
        }
      }
    } finally {
      lastAt = Date.now();
    }
  });
  queue = job.catch(() => {}); // lỗi của ảnh này không làm kẹt hàng đợi
  return job;
}

// Đọc thẻ [[VE: ...]] / [[DRAW: ...]] mà AI chèn vào câu trả lời
export function extractImageTag(text) {
  let prompt = null;
  let size = 'square';
  const out = String(text || '').replace(/\[\[\s*(?:VE|VẼ|DRAW)\s*(?:\((ngang|doc|dọc|vuong|vuông|landscape|portrait|square)\))?\s*:\s*([^\]]+)\]\]/gi, (_, sz, p) => {
    if (!prompt) {
      prompt = p.trim();
      const s = (sz || '').toLowerCase();
      size = /ngang|landscape/.test(s) ? 'landscape' : /d[oọ]c|portrait/.test(s) ? 'portrait' : 'square';
    }
    return '';
  }).trim();
  return { text: out, prompt, size };
}

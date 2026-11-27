// Ảnh trích dẫn: biến một tin nhắn thành ảnh nền đêm trăng có avatar + câu nói.
// Cần thư viện sharp (npm install sharp). Thiếu thì báo lỗi NO_SHARP.

const W = 1200;
const H = 630;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Làm sạch nội dung Discord: emoji riêng, @tag, link, emoji màu (font trong ảnh không vẽ được emoji màu)
export function cleanQuoteText(text, resolveMention = () => null) {
  return String(text || '')
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/<@!?(\d+)>/g, (_, id) => `@${resolveMention(id) || 'ai đó'}`)
    .replace(/<#\d+>/g, '#kênh')
    .replace(/https?:\/\/\S+/g, '🔗')
    .replace(/[*_~`|>]/g, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ước lượng độ rộng chữ (font serif nghiêng) để xuống dòng
const charW = (ch, size) => (/[mwMW@]/.test(ch) ? 0.82 : /[ilj.,'’!|:;]/.test(ch) ? 0.3 : /[A-ZÀ-Ỹ]/.test(ch) ? 0.66 : 0.5) * size;
function wrap(text, size, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  const width = (s) => [...s].reduce((a, c) => a + charW(c, size), 0);
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (width(next) <= maxWidth) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
    while (width(cur) > maxWidth) { // từ quá dài: cắt cứng
      let cut = cur.length;
      while (cut > 1 && width(cur.slice(0, cut)) > maxWidth) cut--;
      lines.push(cur.slice(0, cut));
      cur = cur.slice(cut);
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s*\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

// Chọn cỡ chữ lớn nhất mà vẫn vừa khung
function layout(text) {
  for (const size of [58, 50, 44, 38, 33, 29, 26]) {
    const lineH = size * 1.32;
    const maxLines = Math.floor(330 / lineH);
    const lines = wrap(text, size, 640, maxLines);
    const fits = lines.length <= maxLines && !lines[lines.length - 1].endsWith('…');
    if (fits || size === 26) return { size, lineH, lines };
  }
  return null;
}

export async function renderQuote({ text, author, handle, avatarUrl, date = new Date(), lang = 'vi' }) {
  let sharp;
  try { sharp = (await import('sharp')).default; } catch { throw new Error('NO_SHARP'); }

  // Tải avatar (PNG) để nhúng vào ảnh
  let avatar = '';
  try {
    const res = await fetch(avatarUrl);
    if (res.ok) avatar = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {}

  const body = text || (lang === 'en' ? '(no words, just a feeling)' : '(không lời, chỉ là cảm xúc)');
  const { size, lineH, lines } = layout(body);
  const top = 315 - ((lines.length - 1) * lineH) / 2;
  const dateStr = lang === 'en'
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : `${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;

  // Sao và lông vũ rải ngẫu nhiên (cố định theo nội dung để cùng câu cho ra cùng ảnh)
  let seed = [...body].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let stars = '';
  for (let i = 0; i < 70; i++) stars += `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(rnd() * 1.4 + 0.3).toFixed(1)}" fill="#ece6ff" opacity="${(rnd() * 0.6 + 0.2).toFixed(2)}"/>`;
  let feathers = '';
  for (let i = 0; i < 5; i++) {
    // chỉ rải ở dải mép phải, dưới mặt trăng, không đè lên chữ
    const x = 1060 + rnd() * 110, y = 250 + rnd() * 290, r = -40 + rnd() * 80, sc = 0.6 + rnd() * 0.6;
    feathers += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${r.toFixed(0)}) scale(${sc.toFixed(2)})" opacity="0.5"><path d="M0 -30 C-9 -18 -9 6 0 26 C9 6 9 -18 0 -30z" fill="#f4f1ff"/><path d="M0 -28 L0 34" stroke="#d8d0f5" stroke-width="1.2"/></g>`;
  }

  const textLines = lines.map((l, i) => `<tspan x="440" y="${(top + i * lineH).toFixed(1)}">${esc(l)}</tspan>`).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1533"/><stop offset="1" stop-color="#0e0b1f"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#b9a7ff" stop-opacity="0.45"/><stop offset="1" stop-color="#b9a7ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="moon" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9d0ff"/></radialGradient>
    <clipPath id="av"><circle cx="210" cy="300" r="120"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${stars}
  <circle cx="1080" cy="110" r="190" fill="url(#glow)"/>
  <circle cx="1080" cy="110" r="78" fill="url(#moon)"/>
  <circle cx="1052" cy="92" r="12" fill="#cfc4f7" opacity="0.6"/><circle cx="1102" cy="132" r="16" fill="#cfc4f7" opacity="0.5"/>
  ${feathers}
  <circle cx="210" cy="300" r="150" fill="url(#glow)"/>
  <circle cx="210" cy="300" r="126" fill="#2a2350" stroke="#b9a7ff" stroke-width="3"/>
  ${avatar ? `<image href="${avatar}" x="90" y="180" width="240" height="240" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>` : `<text x="210" y="335" font-size="110" text-anchor="middle" fill="#b9a7ff" font-family="Georgia, 'Times New Roman', serif">${esc((author || '?')[0].toUpperCase())}</text>`}
  <text x="210" y="470" font-size="30" font-weight="700" text-anchor="middle" fill="#eeeaff" font-family="'Segoe UI', Arial, 'DejaVu Sans', sans-serif">${esc((author || '').slice(0, 24))}</text>
  ${handle ? `<text x="210" y="506" font-size="20" text-anchor="middle" fill="#9d94c7" font-family="'Segoe UI', Arial, 'DejaVu Sans', sans-serif">@${esc(handle.slice(0, 28))}</text>` : ''}
  <text x="410" y="${(top - size * 0.55).toFixed(1)}" font-size="${(size * 2.2).toFixed(0)}" fill="#b9a7ff" opacity="0.55" font-family="Georgia, 'Times New Roman', serif">“</text>
  <text font-size="${size}" font-style="italic" fill="#f2eeff" font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif">${textLines}</text>
  <line x1="440" y1="545" x2="520" y2="545" stroke="#b9a7ff" stroke-width="2"/>
  <text x="535" y="552" font-size="20" fill="#9d94c7" font-family="'Segoe UI', Arial, 'DejaVu Sans', sans-serif">${esc(dateStr)}</text>
  <text x="${W - 40}" y="${H - 30}" font-size="22" text-anchor="end" fill="#b9a7ff" opacity="0.8" font-family="Georgia, 'Times New Roman', serif" font-style="italic">☾ Columbina</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

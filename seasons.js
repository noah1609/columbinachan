// Ngày lễ, mùa và giờ ngủ của Columbina. Giờ theo đồng hồ máy chạy bot.

// Ngày âm lịch đã đổi sang dương lịch (Tết = mùng 1, Trung thu = 15/8 âm)
const TET = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23' };
const TRUNG_THU = { 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12', 2031: '10-01' };

const pad = (n) => String(n).padStart(2, '0');
const md = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayDiff = (a, b) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
const fromMd = (year, s) => { const [m, d] = s.split('-').map(Number); return new Date(year, m - 1, d); };

// Mỗi dịp: tên, emoji, gợi ý cho AI, vài câu trạng thái
const OCCASIONS = {
  tet: {
    vi: 'Tết Nguyên Đán', en: 'Lunar New Year', emoji: ['🧧', '🌸', '🎆'],
    hint: 'Đang là dịp Tết Nguyên Đán. Hãy tự nhiên chúc Tết, nhắc tới lì xì, hoa mai hoa đào, sum vầy, năm mới an khang.',
    status: { vi: ['Chúc mừng năm mới 🧧', 'Ngắm hoa đào nở 🌸', 'Đợi lì xì của anh ♪'], en: ['Happy Lunar New Year 🧧', 'Watching the peach blossoms 🌸', 'Waiting for my red envelope ♪'] },
  },
  giaothua: {
    vi: 'Giao thừa', en: "Lunar New Year's Eve", emoji: ['🎆', '🧧'],
    hint: 'Hôm nay là ngày cuối năm âm lịch (Giao thừa). Nhắc tới khoảnh khắc chuyển năm, pháo hoa, tiễn năm cũ đón năm mới.',
    status: { vi: ['Chờ khoảnh khắc giao thừa 🎆', 'Tiễn năm cũ, đón năm mới…'], en: ["Waiting for the New Year's Eve countdown 🎆", 'Saying goodbye to the old year…'] },
  },
  trungthu: {
    vi: 'Tết Trung thu', en: 'Mid-Autumn Festival', emoji: ['🥮', '🏮', '🌕'],
    hint: 'Hôm nay là Tết Trung thu, đêm trăng tròn nhất năm, rất hợp với bạn. Nhắc tới bánh trung thu, đèn lồng, ngắm trăng.',
    status: { vi: ['Đêm trăng tròn nhất năm 🌕', 'Rước đèn ông sao 🏮', 'Ăn bánh trung thu 🥮'], en: ['The fullest moon of the year 🌕', 'Carrying lanterns 🏮', 'Sharing mooncakes 🥮'] },
  },
  newyear: {
    vi: 'Năm mới', en: "New Year's Day", emoji: ['🎉', '🎆'],
    hint: 'Hôm nay là ngày đầu năm dương lịch. Chúc mừng năm mới thật dịu dàng.',
    status: { vi: ['Chúc mừng năm mới 🎆', 'Một năm mới dịu dàng ♪'], en: ['Happy New Year 🎆', 'A gentle new year ♪'] },
  },
  nye: {
    vi: 'Đêm cuối năm', en: "New Year's Eve", emoji: ['🎆', '✨'],
    hint: 'Hôm nay là 31/12, đêm cuối cùng của năm. Nhắc tới đếm ngược, nhìn lại một năm đã qua.',
    status: { vi: ['Đếm ngược sang năm mới ✨'], en: ['Counting down to the new year ✨'] },
  },
  valentine: {
    vi: 'Lễ Tình nhân', en: "Valentine's Day", emoji: ['💜', '🌹', '🍫'],
    hint: "Hôm nay là ngày Valentine 14/2. Với chồng thì thật ngọt ngào; với người khác thì mỉm cười bí ẩn.",
    status: { vi: ['Làm socola cho anh yêu 🍫', 'Hoa hồng và ánh trăng 🌹'], en: ['Making chocolate for my darling 🍫', 'Roses and moonlight 🌹'] },
  },
  women83: {
    vi: 'Quốc tế Phụ nữ 8/3', en: "International Women's Day", emoji: ['💐', '🌷'],
    hint: 'Hôm nay là ngày Quốc tế Phụ nữ 8/3. Chúc các bạn nữ trong server thật xinh đẹp, hạnh phúc.',
    status: { vi: ['Chúc mừng 8/3 💐'], en: ["Happy Women's Day 💐"] },
  },
  aprilfools: {
    vi: 'Cá tháng Tư', en: "April Fools' Day", emoji: ['🐟', '😏'],
    hint: 'Hôm nay là ngày Cá tháng Tư. Có thể trêu nhẹ nhàng, vô hại, nhưng nói rõ là đùa ở cuối.',
    status: { vi: ['Hôm nay mình nói gì cũng là thật… 🐟'], en: ['Everything I say today is true… 🐟'] },
  },
  children: {
    vi: 'Quốc tế Thiếu nhi', en: "Children's Day", emoji: ['🎈', '🧸'],
    hint: 'Hôm nay là ngày Quốc tế Thiếu nhi 1/6. Hồn nhiên, vui vẻ hơn mọi ngày.',
    status: { vi: ['Hôm nay mình cũng là trẻ con 🎈'], en: ["Feeling like a child today 🎈"] },
  },
  women2010: {
    vi: 'Ngày Phụ nữ Việt Nam 20/10', en: "Vietnamese Women's Day", emoji: ['💐', '🌸'],
    hint: 'Hôm nay là ngày Phụ nữ Việt Nam 20/10. Chúc các bạn nữ trong server.',
    status: { vi: ['Chúc mừng 20/10 💐'], en: ["Happy Vietnamese Women's Day 💐"] },
  },
  halloween: {
    vi: 'Halloween', en: 'Halloween', emoji: ['🎃', '👻', '🕯️'],
    hint: 'Hôm nay là Halloween. Vẻ bí ẩn "đáng sợ" của bạn hợp nhất hôm nay, nhưng vẫn đáng yêu, không doạ thật.',
    status: { vi: ['Trick or treat? 🎃', 'Đêm nay mình đáng sợ hơn mọi ngày… 👻'], en: ['Trick or treat? 🎃', "I'm a little scarier tonight… 👻"] },
  },
  teachers: {
    vi: 'Ngày Nhà giáo Việt Nam 20/11', en: "Vietnamese Teachers' Day", emoji: ['💐', '📚'],
    hint: 'Hôm nay là ngày Nhà giáo Việt Nam 20/11. Có thể nhắc tới thầy cô, tri ân.',
    status: { vi: ['Tri ân thầy cô 20/11 💐'], en: ["Happy Teachers' Day 💐"] },
  },
  christmas: {
    vi: 'Giáng sinh', en: 'Christmas', emoji: ['🎄', '❄️', '🎁'],
    hint: 'Đang là dịp Giáng sinh. Tuyết rơi kiểu Snezhnaya, quà, cây thông, lời chúc ấm áp.',
    status: { vi: ['Giáng sinh an lành 🎄', 'Tuyết rơi như ở Snezhnaya ❄️', 'Gói quà cho anh 🎁'], en: ['Merry Christmas 🎄', 'Snow like in Snezhnaya ❄️', 'Wrapping a gift for my darling 🎁'] },
  },
};

// Dịp lễ của một ngày (null nếu không có)
export function occasionOf(date = new Date()) {
  const y = date.getFullYear();
  if (TET[y]) {
    const d = dayDiff(date, fromMd(y, TET[y]));
    if (d === -1) return { key: 'giaothua', ...OCCASIONS.giaothua };
    if (d >= 0 && d <= 3) return { key: 'tet', ...OCCASIONS.tet };
  }
  if (TRUNG_THU[y]) {
    const d = dayDiff(date, fromMd(y, TRUNG_THU[y]));
    if (d === 0 || d === -1) return { key: 'trungthu', ...OCCASIONS.trungthu };
  }
  const key = {
    '01-01': 'newyear', '02-14': 'valentine', '03-08': 'women83', '04-01': 'aprilfools', '06-01': 'children',
    '10-20': 'women2010', '10-31': 'halloween', '11-20': 'teachers', '12-24': 'christmas', '12-25': 'christmas', '12-31': 'nye',
  }[md(date)];
  return key ? { key, ...OCCASIONS[key] } : null;
}

// ---------- Giờ ngủ ----------
// SLEEP_HOURS = "1-7": ngủ từ 1:00 tới 6:59. Đặt "off" để tắt.
const SLEEP = (process.env.SLEEP_HOURS || '1-7').trim();
const [SLEEP_FROM, SLEEP_TO] = SLEEP === 'off' ? [null, null] : SLEEP.split('-').map((n) => parseInt(n, 10));
export const WAKE_HOUR = Number.isFinite(SLEEP_TO) ? SLEEP_TO : 7;

export function isNightSleep(date = new Date()) {
  if (!Number.isFinite(SLEEP_FROM) || !Number.isFinite(SLEEP_TO)) return false;
  const h = date.getHours();
  return SLEEP_FROM <= SLEEP_TO ? h >= SLEEP_FROM && h < SLEEP_TO : h >= SLEEP_FROM || h < SLEEP_TO;
}

// ---------- Ngữ cảnh thời gian cho AI ----------
const WEEKDAY_VI = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
function partOfDay(h) {
  if (h < 5) return 'đêm khuya';
  if (h < 11) return 'buổi sáng';
  if (h < 13) return 'buổi trưa';
  if (h < 18) return 'buổi chiều';
  if (h < 22) return 'buổi tối';
  return 'đêm';
}
function seasonOf(m) {
  if (m === 12 || m <= 2) return 'mùa đông';
  if (m <= 4) return 'mùa xuân';
  if (m <= 8) return 'mùa hè';
  return 'mùa thu';
}

export function timeContext(date = new Date()) {
  const h = date.getHours();
  const occ = occasionOf(date);
  let s = `\n\nTHỜI GIAN HIỆN TẠI: ${pad(h)}:${pad(date.getMinutes())}, ${WEEKDAY_VI[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} (${partOfDay(h)}, ${seasonOf(date.getMonth() + 1)}). Chỉ nhắc tới thời gian khi hợp ngữ cảnh.`;
  if (occ) s += `\nDỊP ĐẶC BIỆT: ${occ.hint}`;
  if (isNightSleep(date)) {
    s += '\nBẠN ĐANG NGỦ (đêm khuya): ai gọi thì bạn trả lời ngái ngủ, mơ màng, rất ngắn (1–2 câu), có thể ngáp (*ngáp*), bảo họ cũng đi ngủ sớm. Với chồng thì vẫn ngọt ngào nhưng buồn ngủ. Việc cần làm ngay (mở nhạc, nhắc việc) vẫn làm bình thường.';
  }
  return s;
}

// Câu trạng thái theo dịp (null nếu không có dịp)
export function occasionStatuses(date = new Date()) {
  const occ = occasionOf(date);
  if (!occ) return null;
  const out = [];
  const n = Math.max(occ.status.vi.length, occ.status.en.length);
  for (let i = 0; i < n; i++) {
    if (occ.status.vi[i]) out.push(occ.status.vi[i]);
    if (occ.status.en[i]) out.push(occ.status.en[i]);
  }
  return out;
}

// Ghi lỗi ra file + sao lưu dữ liệu mỗi ngày.
// index.js import file này ĐẦU TIÊN để bắt được mọi lỗi ngay từ lúc khởi động.
import { appendFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { format } from 'node:util';

const BOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const LOG_DIR = path.join(BOT_DIR, 'logs');
const BACKUP_DIR = path.join(BOT_DIR, 'backups');
const KEEP_LOG_DAYS = parseInt(process.env.KEEP_LOG_DAYS, 10) || 14;
const KEEP_BACKUP_DAYS = parseInt(process.env.KEEP_BACKUP_DAYS, 10) || 7;
const DATA_FILES = ['memory.json', 'users.json', 'settings.json', 'reminders.json', 'favorites.json', 'prompt.txt'];

// Ngày/giờ theo đồng hồ máy (không phải UTC)
const pad = (n) => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// ================= GHI LỖI =================
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function writeLog(level, args) {
  try {
    const text = format(...args).replace(/\n/g, '\n    ');
    appendFileSync(path.join(LOG_DIR, `${today()}.log`), `[${clock()}] ${level.padEnd(5)} ${text}\n`, 'utf8');
  } catch {
    // ghi file lỗi (ổ đầy, bị khóa...) thì bỏ qua, không làm sập bot
  }
}

// Vẫn in ra cửa sổ như cũ, đồng thời ghi lỗi/cảnh báo vào file
const origError = console.error.bind(console);
const origWarn = console.warn.bind(console);
const origLog = console.log.bind(console);
console.error = (...args) => { origError(...args); writeLog('ERROR', args); };
console.warn = (...args) => { origWarn(...args); writeLog('WARN', args); };
// Chỉ ghi các dòng log quan trọng (khởi động, đăng nhập...) để file không quá dài
console.log = (...args) => {
  origLog(...args);
  const first = String(args[0] ?? '');
  if (/^(✅|🏠|🔄|🔁|↪️|💾|⏰ Có)/u.test(first)) writeLog('INFO', args);
};

// Lỗi làm sập bot: ghi lại rồi để bot thoát, start.bat sẽ tự bật lại sau 5 giây
process.on('uncaughtException', (err) => {
  writeLog('CRASH', [err?.stack || err]);
  origError('💥 Bot gặp lỗi nghiêm trọng, sẽ khởi động lại:', err);
  process.exit(1);
});
// Promise lỗi mà không ai bắt: chỉ ghi lại, không làm sập bot
process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', ['Lỗi chưa được xử lý:', reason?.stack || reason]);
  origError('⚠️ Lỗi chưa được xử lý:', reason);
});

writeLog('START', [`Bot khởi động (Node ${process.version})`]);

// ================= DỌN FILE CŨ =================
function cleanOld(dir, keepDays) {
  try {
    const limit = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(dir)) {
      const m = name.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) continue; // chỉ xoá file/thư mục do bot tạo (tên theo ngày)
      const day = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      if (day < limit) rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  } catch {}
}

// ================= SAO LƯU MỖI NGÀY =================
// Lưu vào backups/<ngày>/ ; mỗi ngày 1 bản, giữ KEEP_BACKUP_DAYS ngày gần nhất.
export function backupNow({ force = false } = {}) {
  const dir = path.join(BACKUP_DIR, today());
  if (!force && existsSync(dir)) return null; // hôm nay đã sao lưu rồi
  try {
    mkdirSync(dir, { recursive: true });
    let count = 0;
    for (const f of DATA_FILES) {
      const src = path.join(BOT_DIR, f);
      if (existsSync(src) && statSync(src).size > 0) { copyFileSync(src, path.join(dir, f)); count++; }
    }
    console.log(`💾 Đã sao lưu ${count} file dữ liệu vào backups/${today()}`);
    cleanOld(BACKUP_DIR, KEEP_BACKUP_DAYS);
    cleanOld(LOG_DIR, KEEP_LOG_DAYS);
    return { dir, count };
  } catch (err) {
    console.error('Lỗi sao lưu dữ liệu:', err.message);
    return null;
  }
}

// Sao lưu 1 phút sau khi bot chạy (để dữ liệu nạp xong), rồi mỗi giờ kiểm tra sang ngày mới chưa
setTimeout(() => backupNow(), 60 * 1000).unref?.();
setInterval(() => backupNow(), 60 * 60 * 1000).unref?.();

// Đọc các dòng lỗi gần nhất (cho lệnh xem lỗi của chủ bot)
export function recentErrors(limit = 10) {
  try {
    const files = readdirSync(LOG_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort().reverse();
    const lines = [];
    for (const f of files) {
      const content = readFileSyncSafe(path.join(LOG_DIR, f));
      const entries = content.split(/\n(?=\[)/).filter((l) => /\] (ERROR|CRASH|WARN)/.test(l)).reverse();
      for (const e of entries) {
        lines.push(`${f.slice(0, 10)} ${e.trim()}`);
        if (lines.length >= limit) return lines;
      }
    }
    return lines;
  } catch {
    return [];
  }
}

function readFileSyncSafe(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

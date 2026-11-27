// Rich Presence: hiện "Đang nghe nhạc cùng Columbina…" trên hồ sơ Discord của chủ bot.
// Kết nối thẳng tới app Discord đang mở trên CÙNG máy (qua named pipe discord-ipc-0..9), không cần thư viện ngoài.
// Discord chưa mở -> tự thử kết nối lại mỗi 15 giây, bot vẫn chạy bình thường.
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const RETRY_MS = 15000;

let clientId = null;
let sock = null;
let ready = false;
let buf = Buffer.alloc(0);
let wanted = null;          // hoạt động muốn hiện (null = xoá)
let lastSentKey = undefined;
let lastNonce = null;
let typeSupported = true;   // Discord cũ không nhận "type" (Listening) -> bỏ đi rồi gửi lại
let retryTimer = null;
let warned = false;

function ipcPath(i) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return path.join(base, `discord-ipc-${i}`);
}

const encode = (op, data) => {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
};

function open(i = 0) {
  return new Promise((resolve, reject) => {
    if (i > 9) return reject(new Error('Không thấy app Discord đang mở'));
    const s = net.createConnection(ipcPath(i));
    s.once('connect', () => { s.removeAllListeners('error'); resolve(s); });
    s.once('error', () => { s.destroy(); open(i + 1).then(resolve, reject); });
  });
}

function scheduleRetry() {
  if (retryTimer || !clientId) return;
  retryTimer = setTimeout(() => { retryTimer = null; connect(); }, RETRY_MS);
  retryTimer.unref?.();
}

function onClose() {
  if (ready) console.log('🔄 Rich Presence: mất kết nối với app Discord, sẽ thử lại…');
  sock = null;
  ready = false;
  buf = Buffer.alloc(0);
  lastSentKey = undefined;
  scheduleRetry();
}

function handle(op, data) {
  if (op === OP.PING) { sock?.write(encode(OP.PONG, data)); return; }
  if (op === OP.CLOSE) { sock?.end(); return; }
  if (op !== OP.FRAME) return;
  if (data?.evt === 'READY') {
    ready = true;
    warned = false;
    console.log(`✅ Rich Presence: đã kết nối với Discord của ${data.data?.user?.username || 'bạn'}`);
    flush(true);
  } else if (data?.evt === 'ERROR') {
    if (data.nonce === lastNonce && typeSupported && wanted?.type !== undefined) {
      typeSupported = false; // thử lại không có "type"
      flush(true);
    } else {
      console.warn('Rich Presence lỗi:', data.data?.message || JSON.stringify(data.data));
    }
  }
}

async function connect() {
  if (sock || !clientId) return;
  try {
    sock = await open();
  } catch (err) {
    if (!warned) { console.warn(`⚠️ Rich Presence: ${err.message}, sẽ tự kết nối khi bạn mở Discord.`); warned = true; }
    sock = null;
    scheduleRetry();
    return;
  }
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const op = buf.readInt32LE(0);
      const len = buf.readInt32LE(4);
      if (buf.length < 8 + len) break;
      let data = null;
      try { data = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')); } catch {}
      buf = buf.subarray(8 + len);
      handle(op, data);
    }
  });
  sock.on('close', onClose);
  sock.on('error', () => {});
  sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: String(clientId) }));
}

// Chuẩn hoá theo giới hạn của Discord: chữ 2–128 ký tự, nút tối đa 2, nhãn nút ≤ 32 ký tự
const fit = (t, max = 128) => {
  if (!t) return undefined;
  let s = String(t).trim();
  if (s.length < 2) s = s.padEnd(2, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function toPayload(a) {
  if (!a) return null;
  const act = {
    details: fit(a.details),
    state: fit(a.state),
    timestamps: a.start || a.end ? { start: a.start ? Math.floor(a.start) : undefined, end: a.end ? Math.floor(a.end) : undefined } : undefined,
    assets: {
      large_image: a.largeImage || undefined,
      large_text: fit(a.largeText),
      small_image: a.smallImage || undefined,
      small_text: fit(a.smallText),
    },
    buttons: (a.buttons || []).filter((b) => b?.url && /^https?:\/\//.test(b.url)).slice(0, 2).map((b) => ({ label: fit(b.label, 32), url: b.url })),
    instance: false,
  };
  if (typeSupported && a.type !== undefined) act.type = a.type; // 0 = Playing, 2 = Listening
  if (!act.buttons.length) delete act.buttons;
  return JSON.parse(JSON.stringify(act)); // bỏ các trường undefined
}

function flush(force = false) {
  if (!ready || !sock) return;
  const payload = toPayload(wanted);
  const key = JSON.stringify(payload);
  if (!force && key === lastSentKey) return; // không đổi thì không gửi lại
  lastSentKey = key;
  lastNonce = randomUUID();
  sock.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: payload }, nonce: lastNonce }));
}

export function startRPC(id) {
  clientId = id;
  connect();
}

// activity: { type, details, state, start, end, largeImage, largeText, smallImage, smallText, buttons } hoặc null để ẩn
export function setActivity(activity) {
  wanted = activity;
  flush();
}

export const isConnected = () => ready;

// Columbina trong kênh voice: đọc câu trả lời, phát nhạc, nghe giọng nói
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import prism from 'prism-media';
import {
  joinVoiceChannel, createAudioPlayer, createAudioResource, entersState,
  AudioPlayerStatus, VoiceConnectionStatus, StreamType, NoSubscriberBehavior, EndBehaviorType,
} from '@discordjs/voice';

const TTS_VOICE = process.env.TTS_VOICE || 'vi-VN-HoaiMyNeural';    // giọng nữ tiếng Việt (giọng Bắc) của Microsoft Edge
const TTS_VOICE_EN = process.env.TTS_VOICE_EN || 'en-US-AriaNeural'; // giọng nữ tiếng Anh cho server chọn English

// Ngôn ngữ từng server do index.js cung cấp ('vi' | 'en')
let langResolver = () => 'vi';
export function setLangResolver(fn) { langResolver = fn; }
const langOf = (guildId) => { try { return langResolver(guildId) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } };
const tx = (L, vi, en) => (L === 'en' ? en : vi);
const MAX_SPEECH = 600;                                            // đọc tối đa bấy nhiêu ký tự mỗi câu
const LEAVE_WHEN_ALONE_MS = 60 * 1000;                             // còn mình bot trong kênh 1 phút thì tự rời
const MAX_SONG_SECONDS = (parseInt(process.env.MUSIC_MAX_MINUTES || process.env.MAX_SONG_MINUTES, 10) || 15) * 60;
const DEFAULT_VOLUME = Math.min(1, Math.max(0.01, parseFloat(process.env.MUSIC_VOLUME) || 0.5));
const MAX_QUEUE = 100;
const MAX_PLAYLIST = 50; // thêm tối đa bấy nhiêu bài từ 1 playlist

/*
 Mỗi server 1 phiên:
 { connection, musicPlayer, speechPlayer, voiceChannelId, textChannels:Set, aloneTimer, sleepTimer,
   speech:[], speaking, music:[], nowPlaying, loadingTrack, proc:[], resource, volume, loop, autoplay, history:[],
   announce, listening, onUtterance, recording:Set }
*/
const sessions = new Map();

// ================= TIỆN ÍCH =================
export function cleanForSpeech(text) {
  return text
    .replace(/\*[^*]+\*/g, ' ')            // bỏ *hành động in nghiêng*
    .replace(/<a?:\w+:\d+>/g, ' ')         // emoji riêng của server
    .replace(/<[@#][!&]?\d+>/g, ' ')       // @tag, #kênh
    .replace(/https?:\/\/\S+/g, ' ')       // link
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[♪~*_`>#|<&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPEECH);
}

export const formatTime = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '?');

// Tự chạy ffmpeg để chuyển mọi loại âm thanh thành PCM 48kHz stereo (StreamType.Raw)
function pcmFfmpeg(feed) {
  const ff = spawn(ffmpegPath, ['-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true });
  ff.on('error', (e) => console.error('Lỗi chạy ffmpeg:', e.message));
  ff.stdin.on('error', () => {});
  ff.stdout.on('error', () => {});
  feed(ff.stdin);
  return ff;
}

function killProcs(s) {
  for (const p of s.proc || []) { try { p.kill(); } catch {} }
  s.proc = [];
}

// ================= GIỌNG NÓI (TTS) =================
async function edgeTTS(text, L = 'vi') {
  const mod = await import('msedge-tts');
  const lib = mod.default ?? mod; // thư viện CommonJS hoặc ESM đều được
  const MsEdgeTTS = mod.MsEdgeTTS ?? lib.MsEdgeTTS;
  const OUTPUT_FORMAT = mod.OUTPUT_FORMAT ?? lib.OUTPUT_FORMAT;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(L === 'en' ? TTS_VOICE_EN : TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const result = await tts.toStream(text);
  const stream = result?.audioStream ?? result;
  const chunks = [];
  const timeout = setTimeout(() => stream.destroy?.(new Error('Edge TTS quá thời gian')), 20000);
  try {
    for await (const c of stream) chunks.push(c);
  } finally {
    clearTimeout(timeout);
    tts.close?.();
  }
  const buf = Buffer.concat(chunks);
  if (!buf.length) throw new Error('Edge TTS không trả về âm thanh');
  return buf;
}

async function googleTTS(text, L = 'vi') {
  const parts = [];
  let rest = text;
  while (rest.length > 190) {
    let cut = Math.max(rest.lastIndexOf('.', 190), rest.lastIndexOf(',', 190), rest.lastIndexOf(' ', 190));
    if (cut < 60) cut = 190;
    parts.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  const bufs = [];
  for (const p of parts) {
    const res = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${L === 'en' ? 'en' : 'vi'}&q=${encodeURIComponent(p)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Google TTS lỗi ${res.status}`);
    bufs.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(bufs);
}

async function textToSpeech(text, L = 'vi') {
  try {
    return await edgeTTS(text, L);
  } catch (err) {
    console.warn('Edge TTS lỗi, chuyển sang giọng Google:', err.message);
    return googleTTS(text, L);
  }
}

// Giọng nói phát trên player riêng. Khi đang nói, nhạc tự tạm dừng; nói xong nhạc phát tiếp.
async function speakNext(guildId) {
  const s = sessions.get(guildId);
  if (!s || s.speaking) return;
  if (!s.speech.length) {
    s.connection.subscribe(s.musicPlayer); // trả loa lại cho nhạc
    return;
  }
  s.speaking = true;
  const text = s.speech.shift();
  try {
    const audio = await textToSpeech(text, langOf(guildId));
    if (!sessions.has(guildId)) return;
    const ff = pcmFfmpeg((stdin) => stdin.end(audio));
    s.connection.subscribe(s.speechPlayer); // nhạc mất người nghe -> tự tạm dừng
    s.speechPlayer.play(createAudioResource(ff.stdout, { inputType: StreamType.Raw }));
  } catch (err) {
    console.error('Lỗi đọc giọng nói:', err.message);
    s.speaking = false;
    speakNext(guildId);
  }
}

// ================= NHẠC =================
const BOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const YTDLP = process.env.YTDLP_PATH
  || (existsSync(path.join(BOT_DIR, 'yt-dlp.exe')) ? path.join(BOT_DIR, 'yt-dlp.exe') : 'yt-dlp');
// yt-dlp cần JS runtime để giải mã YouTube: dùng chính Node đang chạy bot
const YTDLP_BASE = ['--js-runtimes', `node:${process.execPath}`, '--encoding', 'utf-8', '--no-warnings', '-q'];
// Windows mặc định dùng bảng mã cũ -> tiếng Việt trong tên bài bị lỗi. Ép yt-dlp (Python) xuất UTF-8.
const YTDLP_ENV = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };

function runYtdlpOnce(args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, [...YTDLP_BASE, ...args], { windowsHide: true, env: YTDLP_ENV });
    const outBufs = [];
    let err = '';
    const t = setTimeout(() => { p.kill(); reject(new Error('yt-dlp quá thời gian')); }, timeoutMs);
    p.stdout.on('data', (d) => { outBufs.push(d); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e.code === 'ENOENT' ? new Error('NO_YTDLP') : e); });
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? resolve(Buffer.concat(outBufs).toString('utf8')) : reject(new Error(`yt-dlp lỗi: ${err.trim().split('\n').pop() || code}`));
    });
  });
}

// ---------- Tự cập nhật yt-dlp ----------
// YouTube hay đổi cách chặn nên yt-dlp cần cập nhật thường xuyên.
const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000; // mỗi ngày
const RETRY_UPDATE_GAP_MS = 60 * 60 * 1000;  // cập nhật vì lỗi tối đa 1 lần / giờ
let updating = null;
let lastErrorUpdate = 0;
const anyMusicPlaying = () => [...sessions.values()].some((s) => s.nowPlaying || s.loadingTrack);

// Trả về true nếu yt-dlp vừa được nâng lên bản mới
export function updateYtdlp(reason = 'định kỳ') {
  if (updating) return updating;
  updating = new Promise((resolve) => {
    const p = spawn(YTDLP, ['-U'], { windowsHide: true, env: YTDLP_ENV });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => p.kill(), 120000);
    p.on('error', (e) => {
      clearTimeout(t);
      console.warn('⚠️ Không cập nhật được yt-dlp:', e.code === 'ENOENT' ? 'chưa có file yt-dlp' : e.message);
      resolve(false);
    });
    p.on('close', (code) => {
      clearTimeout(t);
      const line = out.trim().split('\n').filter(Boolean).pop() || '';
      const upgraded = code === 0 && /Updated yt-dlp|Updating to/i.test(out);
      console.log(code === 0 ? `🔄 Kiểm tra yt-dlp (${reason}): ${line}` : `⚠️ Cập nhật yt-dlp lỗi: ${line}`);
      resolve(upgraded);
    });
  }).finally(() => { updating = null; });
  return updating;
}

// Đang phát nhạc thì đợi 10 phút rồi thử lại, tránh cập nhật giữa bài
function scheduledUpdate() {
  if (anyMusicPlaying()) { setTimeout(scheduledUpdate, 10 * 60 * 1000).unref?.(); return; }
  updateYtdlp();
}
setTimeout(scheduledUpdate, 15000).unref?.();       // 15 giây sau khi bot chạy
setInterval(scheduledUpdate, UPDATE_EVERY_MS).unref?.();

// Lỗi lạ từ yt-dlp -> tự cập nhật rồi thử lại 1 lần
function updateAfterError() {
  if (Date.now() - lastErrorUpdate < RETRY_UPDATE_GAP_MS) return Promise.resolve(false);
  lastErrorUpdate = Date.now();
  return updateYtdlp('vì gặp lỗi');
}

async function runYtdlp(args, timeoutMs) {
  try {
    return await runYtdlpOnce(args, timeoutMs);
  } catch (err) {
    if (!/^yt-dlp lỗi/.test(err.message)) throw err;
    if (await updateAfterError()) {
      console.log('🔁 yt-dlp vừa được cập nhật, thử lại…');
      return runYtdlpOnce(args, timeoutMs);
    }
    throw err;
  }
}

// %(title)j = tên bài dạng JSON chỉ gồm ký tự ASCII (\uXXXX) -> không bao giờ lỗi phông dù Windows dùng bảng mã nào
const PRINT = ['--print', '%(title)j\t%(webpage_url)s\t%(duration)s\t%(id)s'];
const decodeTitle = (raw) => {
  try {
    const v = JSON.parse(raw);
    return typeof v === 'string' && v ? v : 'Không rõ tên';
  } catch {
    return raw || 'Không rõ tên';
  }
};
function parseLines(out) {
  return out.trim().split('\n').filter(Boolean).map((line) => {
    const [rawTitle, url, duration, id] = line.split('\t');
    const title = decodeTitle(rawTitle);
    const d = parseInt(duration, 10);
    return { title, url: url && url !== 'NA' ? url : `https://www.youtube.com/watch?v=${id}`, duration: Number.isFinite(d) ? d : 0, id };
  });
}

const SPOTIFY_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/i;
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch|shorts|live|playlist)|youtu\.be\/|music\.youtube\.com\/(?:watch|playlist))/i;
const decodeHtml = (t) => t.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function spotifyTrack(id) {
  const res = await fetch(`https://open.spotify.com/track/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'vi,en' } });
  if (!res.ok) throw new Error(`Spotify lỗi ${res.status}`);
  const html = await res.text();
  const meta = (prop) => decodeHtml(html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, 'i'))?.[1] ?? '');
  const title = meta('og:title');
  const artist = meta('og:description').split('·').map((x) => x.trim())
    .filter((x) => x && !/^(song|bài hát|single|ep|album)$/i.test(x) && !/^\d{4}$/.test(x) && !/spotify/i.test(x))[0] || '';
  if (!title) throw new Error('Không đọc được tên bài từ Spotify');
  return [{ title: artist ? `${title} - ${artist}` : title, query: `${title} ${artist}`.trim() }];
}

// Album / playlist Spotify: đọc danh sách bài từ trang nhúng (embed)
async function spotifyList(kind, id) {
  const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Spotify lỗi ${res.status}`);
  const html = await res.text();
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('Không đọc được danh sách bài từ Spotify');
  let list = null;
  (function find(o) {
    if (list || !o || typeof o !== 'object') return;
    if (Array.isArray(o.trackList)) { list = o.trackList; return; }
    for (const v of Object.values(o)) find(v);
  })(JSON.parse(json));
  if (!list?.length) throw new Error('Playlist Spotify trống hoặc ở chế độ riêng tư');
  return list.slice(0, MAX_PLAYLIST).map((t) => {
    const title = t.title || t.name || '';
    const artist = t.subtitle || t.artists?.map?.((a) => a.name).join(', ') || '';
    return { title: artist ? `${title} - ${artist}` : title, query: `${title} ${artist}`.trim(), duration: Math.round((t.duration || 0) / 1000) };
  }).filter((t) => t.title);
}

// Tìm bài. Trả về mảng bài: [{ title, url?, query?, duration }]
export async function resolveTracks(input, { maxSeconds = MAX_SONG_SECONDS } = {}) {
  const q = input.trim();
  const sp = q.match(SPOTIFY_RE);
  if (sp) return sp[1] === 'track' ? spotifyTrack(sp[2]) : spotifyList(sp[1], sp[2]);

  if (YOUTUBE_RE.test(q)) {
    const isList = /[?&]list=/.test(q) && (/\/playlist\?/.test(q) || !/[?&]v=/.test(q));
    if (isList) {
      const out = await runYtdlp(['--flat-playlist', '--playlist-end', String(MAX_PLAYLIST), ...PRINT, q], 90000);
      const tracks = parseLines(out).filter((t) => !t.duration || t.duration <= MAX_SONG_SECONDS);
      if (!tracks.length) throw new Error('NOT_FOUND');
      return tracks;
    }
    const [t] = parseLines(await runYtdlp(['--no-playlist', ...PRINT, q]));
    if (!t) throw new Error('NOT_FOUND');
    if (t.duration > maxSeconds) throw new Error('TOO_LONG');
    return [t];
  }

  // Tìm 5 kết quả, lấy bài đầu tiên không quá dài (tránh mấy video tổng hợp 1–2 tiếng)
  const results = parseLines(await runYtdlp(['--flat-playlist', ...PRINT, `ytsearch5:${q}`]));
  if (!results.length) throw new Error('NOT_FOUND');
  const t = results.find((r) => r.duration && r.duration <= maxSeconds) || results.find((r) => !r.duration);
  if (!t) throw new Error('TOO_LONG');
  return [t];
}

// Bài từ Spotify chỉ có tên -> tìm link YouTube lúc sắp phát
async function ensureUrl(track) {
  if (track.url) return track;
  const results = parseLines(await runYtdlp(['--flat-playlist', ...PRINT, `ytsearch5:${track.query}`]));
  const t = results.find((r) => r.duration && r.duration <= MAX_SONG_SECONDS) || results[0];
  if (!t) throw new Error('NOT_FOUND');
  return { ...track, url: t.url, id: t.id, duration: t.duration || track.duration };
}

const youtubeId = (url) => url?.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1];

// Hết hàng đợi + bật tự phát: lấy bài liên quan từ "YouTube Mix" của bài vừa nghe
async function findRelated(s, L = 'vi') {
  const lastId = youtubeId(s.lastPlayed?.url);
  if (!lastId) return null;
  const out = await runYtdlp(['--flat-playlist', '--playlist-end', '15', ...PRINT, `https://www.youtube.com/watch?v=${lastId}&list=RD${lastId}`], 60000);
  const candidates = parseLines(out).filter((t) => t.id !== lastId && !s.history.includes(t.id) && t.duration && t.duration <= MAX_SONG_SECONDS);
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
  return { ...pick, by: tx(L, 'tự phát ✨', 'autoplay ✨') };
}

async function playNextSong(guildId) {
  const s = sessions.get(guildId);
  if (!s || s.nowPlaying || s.loadingTrack) return;
  let track = s.music.shift();
  if (!track && s.autoplay && s.lastPlayed) {
    s.loadingTrack = true;
    try { track = await findRelated(s, langOf(guildId)); } catch (err) { console.error('Lỗi tự phát:', err.message); }
    s.loadingTrack = false;
    if (!sessions.has(guildId)) return;
  }
  if (!track) return;

  s.loadingTrack = true;
  try {
    track = await ensureUrl(track);
  } catch (err) {
    s.loadingTrack = false;
    console.error('Không tìm được bài:', track.title, err.message);
    s.announce?.send(tx(langOf(guildId), `⚠️ Không mở được **${track.title}**, bỏ qua…`, `⚠️ Couldn't play **${track.title}**, skipping…`)).catch(() => {});
    return playNextSong(guildId);
  }
  s.loadingTrack = false;
  if (!sessions.has(guildId)) return;

  const yt = spawn(YTDLP, [...YTDLP_BASE, '--no-playlist', '-f', 'bestaudio/best', '-o', '-', track.url], { windowsHide: true, env: YTDLP_ENV });
  yt.on('error', (e) => console.error('Lỗi chạy yt-dlp:', e.message));
  yt.stdout.on('error', () => {});
  yt.stderr.on('data', (d) => { const t = String(d).trim(); if (/ERROR/i.test(t) && !/Broken pipe|Errno 32|Errno 22/i.test(t)) console.error('yt-dlp:', t); });
  let streamed = 0;
  yt.stdout.on('data', (d) => { streamed += d.length; });
  yt.on('close', (code) => {
    // Thoát lỗi khi gần như chưa tải được gì -> có thể yt-dlp đã cũ
    if (code && code !== 0 && streamed < 50000 && s.proc.includes(yt)) {
      console.warn(`⚠️ yt-dlp không tải được "${track.title}" (mã ${code}).`);
      updateAfterError();
    }
  });
  const ff = pcmFfmpeg((stdin) => yt.stdout.pipe(stdin));
  killProcs(s);
  s.proc = [yt, ff];
  s.nowPlaying = track;
  s.songStartedAt = Date.now(); // cho Rich Presence: đồng hồ chạy theo bài
  s.pausedAt = null;
  s.lastPlayed = track;
  if (track.id) { s.history.push(track.id); while (s.history.length > 30) s.history.shift(); }

  s.resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  s.resource.volume?.setVolume(s.volume);
  s.musicPlayer.play(s.resource);
  if (!s.speaking) s.connection.subscribe(s.musicPlayer);
  if (!s.quietAnnounce) {
    const L = langOf(guildId);
    const loopTxt = s.loop === 'one' ? tx(L, 'lặp 1 bài', 'looping song') : tx(L, 'lặp hàng đợi', 'looping queue');
    s.announce?.send(`🎶 ${tx(L, 'Đang phát', 'Now playing')}: **${track.title}** \`${formatTime(track.duration)}\` · ${track.by || ''}${s.loop !== 'off' ? ` · 🔁 ${loopTxt}` : ''}`).catch(() => {});
  }
}

function onSongEnd(guildId) {
  const s = sessions.get(guildId);
  if (!s) return;
  const finished = s.nowPlaying;
  s.nowPlaying = null;
  s.resource = null;
  killProcs(s);
  if (finished && !s.skipping) {
    if (s.loop === 'one') s.music.unshift(finished);
    else if (s.loop === 'all') s.music.push(finished);
  }
  s.skipping = false;
  playNextSong(guildId);
}

// ================= KẾT NỐI =================
export function isConnected(guildId) {
  return sessions.has(guildId);
}

// Vào kênh voice mà member đang ngồi. textChannelId: kênh chữ mà bot sẽ đọc to câu trả lời.
export async function join(member, textChannelId) {
  const vc = member.voice?.channel;
  if (!vc) throw new Error('NO_VOICE');
  const guildId = vc.guild.id;
  const old = sessions.get(guildId);
  if (old && old.voiceChannelId === vc.id) { old.textChannels.add(textChannelId); return vc; }
  leave(guildId);

  const connection = joinVoiceChannel({
    channelId: vc.id, guildId, adapterCreator: vc.guild.voiceAdapterCreator, selfDeaf: false, // không tắt tai để còn nghe giọng nói
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
  } catch {
    connection.destroy();
    throw new Error('CONNECT_FAILED');
  }

  const musicPlayer = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  const speechPlayer = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection.subscribe(musicPlayer);

  const s = {
    connection, musicPlayer, speechPlayer, voiceChannelId: vc.id, textChannels: new Set([textChannelId, vc.id]),
    aloneTimer: null, sleepTimer: null, speech: [], speaking: false,
    music: [], nowPlaying: null, loadingTrack: false, proc: [], resource: null, volume: DEFAULT_VOLUME,
    loop: 'off', autoplay: false, history: [], lastPlayed: null, announce: null, skipping: false, quietAnnounce: false,
    joinedAt: Date.now(), songStartedAt: null, pausedAt: null,
    listening: false, onUtterance: null, recording: new Set(),
  };
  sessions.set(guildId, s);

  musicPlayer.on(AudioPlayerStatus.Idle, () => onSongEnd(guildId));
  musicPlayer.on('error', (err) => { console.error('Lỗi phát nhạc:', err.message); });
  speechPlayer.on(AudioPlayerStatus.Idle, () => { s.speaking = false; speakNext(guildId); });
  speechPlayer.on('error', (err) => { console.error('Lỗi phát giọng nói:', err.message); });

  // Nghe giọng nói (chỉ xử lý khi đang bật chế độ nghe)
  connection.receiver.speaking.on('start', (userId) => recordUser(guildId, userId));

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      leave(guildId);
    }
  });
  return vc;
}

export function leave(guildId) {
  const s = sessions.get(guildId);
  if (!s) return false;
  clearTimeout(s.aloneTimer);
  clearTimeout(s.sleepTimer);
  sessions.delete(guildId);
  s.music.length = 0;
  s.speech.length = 0;
  killProcs(s);
  try { s.musicPlayer.stop(true); } catch {}
  try { s.speechPlayer.stop(true); } catch {}
  try { s.connection.destroy(); } catch {}
  return true;
}

// Tự rời sau X phút (dùng cho /haru)
export function leaveAfter(guildId, minutes) {
  const s = sessions.get(guildId);
  if (!s) return;
  clearTimeout(s.sleepTimer);
  s.sleepTimer = setTimeout(() => leave(guildId), minutes * 60 * 1000);
}

export function checkAlone(guild) {
  const s = sessions.get(guild.id);
  if (!s) return;
  const vc = guild.channels.cache.get(s.voiceChannelId);
  const humans = vc?.members?.filter((m) => !m.user.bot).size ?? 0;
  if (humans === 0) {
    if (!s.aloneTimer) s.aloneTimer = setTimeout(() => leave(guild.id), LEAVE_WHEN_ALONE_MS);
  } else if (s.aloneTimer) {
    clearTimeout(s.aloneTimer);
    s.aloneTimer = null;
  }
}

// ================= API GIỌNG NÓI =================
// channelId = null: đọc luôn. Có channelId: chỉ đọc nếu là kênh chữ gắn với phiên voice.
export function speak(guildId, channelId, text) {
  const s = sessions.get(guildId);
  if (!s) return false;
  if (channelId && !s.textChannels.has(channelId)) return false;
  const clean = cleanForSpeech(text);
  if (!clean) return false;
  s.speech.push(clean);
  while (s.speech.length > 5) s.speech.shift();
  speakNext(guildId);
  return true;
}

// Ngừng câu đang đọc (nhạc không bị ảnh hưởng)
export function skip(guildId) {
  const s = sessions.get(guildId);
  if (!s) return false;
  s.speech.length = 0;
  s.speechPlayer.stop(true);
  return true;
}

// ================= API NHẠC =================
// Thêm bài (1 hoặc nhiều) vào hàng đợi, tự vào voice nếu chưa vào. Trả về { position, added }
export async function enqueue(member, announceChannel, tracks, { front = false } = {}) {
  const gid = member.guild.id;
  if (!sessions.has(gid)) await join(member, announceChannel.id);
  const s = sessions.get(gid);
  const room = MAX_QUEUE - s.music.length;
  if (room <= 0) throw new Error('QUEUE_FULL');
  const add = tracks.slice(0, room);
  s.announce = announceChannel;
  const busy = !!(s.nowPlaying || s.loadingTrack);
  if (front) s.music.unshift(...add); else s.music.push(...add);
  const position = busy ? (front ? 1 : s.music.length - add.length + 1) : 0;
  playNextSong(gid);
  return { position, added: add.length };
}

export function skipSong(guildId) {
  const s = sessions.get(guildId);
  if (!s?.nowPlaying) return null;
  const skipped = s.nowPlaying;
  s.skipping = true; // bỏ qua thì không lặp lại bài đó
  s.musicPlayer.stop(true);
  return skipped;
}

export function stopMusic(guildId) {
  const s = sessions.get(guildId);
  if (!s) return false;
  const had = !!s.nowPlaying || s.music.length > 0;
  s.music.length = 0;
  s.autoplay = false;
  s.loop = 'off';
  if (s.nowPlaying) { s.skipping = true; s.musicPlayer.stop(true); }
  return had;
}

export function pauseMusic(guildId, pause) {
  const s = sessions.get(guildId);
  if (!s?.nowPlaying) return false;
  const ok = pause ? s.musicPlayer.pause() : s.musicPlayer.unpause();
  if (ok && pause && !s.pausedAt) s.pausedAt = Date.now();
  if (ok && !pause && s.pausedAt) { s.songStartedAt += Date.now() - s.pausedAt; s.pausedAt = null; } // bù thời gian tạm dừng
  return ok;
}

// volume: 1–100
export function setVolume(guildId, percent) {
  const s = sessions.get(guildId);
  if (!s) return false;
  s.volume = Math.min(100, Math.max(1, percent)) / 100;
  s.resource?.volume?.setVolume(s.volume);
  return true;
}

// mode: 'off' | 'one' | 'all'
export function setLoop(guildId, mode) {
  const s = sessions.get(guildId);
  if (!s) return false;
  s.loop = mode;
  return true;
}

export function shuffle(guildId) {
  const s = sessions.get(guildId);
  if (!s || s.music.length < 2) return false;
  for (let i = s.music.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s.music[i], s.music[j]] = [s.music[j], s.music[i]];
  }
  return true;
}

export function setAutoplay(guildId, on) {
  const s = sessions.get(guildId);
  if (!s) return false;
  s.autoplay = on;
  if (on) playNextSong(guildId);
  return true;
}

export function removeAt(guildId, index) {
  const s = sessions.get(guildId);
  if (!s || index < 1 || index > s.music.length) return null;
  return s.music.splice(index - 1, 1)[0];
}

export function getState(guildId) {
  const s = sessions.get(guildId);
  return {
    now: s?.nowPlaying ?? null, next: [...(s?.music ?? [])], loop: s?.loop ?? 'off', autoplay: !!s?.autoplay,
    volume: Math.round((s?.volume ?? DEFAULT_VOLUME) * 100), listening: !!s?.listening, connected: !!s,
    voiceChannelId: s?.voiceChannelId ?? null, joinedAt: s?.joinedAt ?? null,
    songStartedAt: s?.songStartedAt ?? null, paused: !!s?.pausedAt,
  };
}

// ================= NGHE GIỌNG NÓI =================
// onUtterance(userId, wavBuffer) được gọi mỗi khi một người nói xong một câu
export function setListening(guildId, on, onUtterance) {
  const s = sessions.get(guildId);
  if (!s) return false;
  s.listening = on;
  s.onUtterance = on ? onUtterance : null;
  return true;
}

const MIN_UTTERANCE_SEC = 1.0; // câu quá ngắn (tiếng ho, "ừ"…) bỏ qua, đỡ tốn lượt nhận dạng
const MAX_UTTERANCE_SEC = 15;

function recordUser(guildId, userId) {
  const s = sessions.get(guildId);
  if (!s?.listening || !s.onUtterance || s.recording.has(userId)) return;
  s.recording.add(userId);

  const opus = s.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 900 } });
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  const chunks = [];
  let bytes = 0;
  const maxBytes = MAX_UTTERANCE_SEC * 48000 * 4;

  const finish = () => {
    if (!s.recording.has(userId)) return;
    s.recording.delete(userId);
    const pcm = Buffer.concat(chunks);
    const seconds = pcm.length / (48000 * 4);
    if (seconds < MIN_UTTERANCE_SEC || !s.listening) return;
    try { s.onUtterance(userId, pcmToWav16kMono(pcm)); } catch (err) { console.error('Lỗi xử lý giọng nói:', err.message); }
  };

  opus.on('error', () => {});
  decoder.on('error', () => {});
  decoder.on('data', (d) => {
    if (bytes >= maxBytes) { opus.destroy(); return; }
    chunks.push(d);
    bytes += d.length;
  });
  decoder.on('end', finish);
  decoder.on('close', finish);
  opus.pipe(decoder);
}

// PCM 48kHz stereo 16-bit -> WAV 16kHz mono (đủ cho nhận dạng giọng nói, file nhỏ)
function pcmToWav16kMono(pcm) {
  const frames = Math.floor(pcm.length / 4);
  const outSamples = Math.floor(frames / 3);
  const data = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      const off = (i * 3 + k) * 4;
      sum += pcm.readInt16LE(off) + pcm.readInt16LE(off + 2);
    }
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / 6))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Cho phép /haru phát nhạc nền mà không báo "Đang phát"
export function setQuietAnnounce(guildId, quiet) {
  const s = sessions.get(guildId);
  if (s) s.quietAnnounce = quiet;
}

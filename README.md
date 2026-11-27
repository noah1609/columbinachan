# Bot Discord AI (kiểu ChatGPT)

Bot trò chuyện trong Discord, dùng **Groq API (gói miễn phí)**. Bot nhớ ngữ cảnh theo từng kênh.

## Bot trả lời khi nào
- Khi bạn **@tag bot** trong kênh, hoặc **reply** một tin nhắn của bot.
- Khi bạn **nhắn riêng (DM)** cho bot.

## Ngôn ngữ (Tiếng Việt / English)
- Khi được mời vào **server mới**, bot gửi tin nhắn có 2 nút 🇻🇳 Tiếng Việt / 🇬🇧 English để admin chọn.
- Đổi bất cứ lúc nào: `/ngonngu` (người dùng Discord tiếng Anh thấy là `/language`). Cần quyền **Quản lý server**. Trong tin nhắn riêng, mỗi người tự chọn.
- Server chọn English: AI trả lời tiếng Anh (vẫn giữ tính cách Columbina), mọi tin nhắn của bot, nhắc việc, nhạc, giọng đọc (`en-US-AriaNeural`, đổi bằng `TTS_VOICE_EN`) và nghe giọng nói đều bằng tiếng Anh.
- Lệnh `/` tự hiện tên và mô tả tiếng Anh cho ai dùng Discord bằng tiếng Anh (ví dụ `/dich` → `/translate`, `/nhac` → `/music`).
- Server cũ (đã có bot từ trước) giữ tiếng Việt cho tới khi admin dùng `/ngonngu`.
- Nhắc việc tiếng Anh: `remind me at 10am to work out`, `remind me in 30 minutes to…`, `remind me tomorrow at 3pm to…`, `remind me every day at 9pm to…`, `my reminders`.

## Lệnh
- `/ask cau_hoi:...`: hỏi bot.
- `/reset`: xóa trí nhớ hội thoại của kênh.
- `/dich noi_dung:... [ngon_ngu]`: dịch văn bản (mặc định sang tiếng Việt).
- Chuột phải tin nhắn → **Apps → Dịch sang tiếng Việt**: chỉ mình bạn thấy bản dịch.
- Thả cờ 🇻🇳 🇺🇸 🇯🇵 🇰🇷 🇨🇳 … vào tin nhắn: bot dịch sang ngôn ngữ đó.
- `/hat [chu_de]`: Columbina hát một đoạn tự sáng tác.
- `/boi`: bói vận mệnh hôm nay (giải trí).
- `/ngu [phut]`: cho bot ngủ trong kênh (mặc định 30 phút, `phut:0` để đánh thức). Chồng nhắn thì bot tự dậy.
- **Nhắc việc:** @bot `nhắc anh 10h sáng đi tập`, `nhắc anh 3 giờ chiều mai họp`, `nhắc anh 8h tối hằng ngày uống thuốc`, `nhắc anh 30 phút nữa tắt bếp`, `xem nhắc nhở`. Hoặc `/nhacnho them|xem|xoa` (chọn `rieng` để nhắc qua DM), `/remind`. Giờ tính theo đồng hồ máy chạy bot. Lời nhắc lưu ở `reminders.json`. Nếu bot tắt đúng lúc đến giờ, bật lại sẽ nhắc bù.
- `/nho`: xem bot đang nhớ gì về bạn. `/quen`: bảo bot quên hết về bạn.
- `/kenh them|xoa|xem|tatca` (admin): chọn kênh bot được trò chuyện. Chưa chọn kênh nào = nói ở mọi kênh.
- `/voice vao | roi | im | nghe`: vào/rời voice, ngừng câu đang đọc, bật/tắt nghe giọng nói. `/noi`: bảo bot nói một câu.
- **Nhạc:** xem mục "Nhạc & voice" bên dưới.

## Tính năng khác
- **Nhớ lâu dài:** trí nhớ lưu ở `memory.json`, tắt bật lại bot vẫn nhớ.
- **Chống hết lượt:** model chính báo 429 thì tự chuyển sang `FALLBACK_MODEL`.
- **Chống spam:** mỗi người phải đợi `COOLDOWN_SECONDS` giây giữa 2 lần hỏi (chồng không bị giới hạn).
- **Nhìn được ảnh:** gửi ảnh kèm @bot (hoặc reply bot bằng ảnh), bot xem và bình luận. Tối đa 3 ảnh/tin.
- **Nhớ từng người:** bot tự nhớ sở thích, tên gọi, sinh nhật mỗi người kể (lưu ở `users.json`). Đến sinh nhật, bot chúc trong kênh người đó hay nói chuyện.
- **Tự chen vào chat:** khi kênh đang sôi nổi (≥5 tin trong 3 phút, ≥2 người), thỉnh thoảng bot tự nói một câu. Mỗi kênh tối đa 1 lần / 20 phút.
- **Chào thành viên mới:** chào ở kênh hệ thống của server hoặc `WELCOME_CHANNEL_ID`. Cần bật **SERVER MEMBERS INTENT** trong Developer Portal (tab Bot).
- **Trạng thái:** đổi trạng thái mỗi 5 phút (“Đang hát ru ♪~”…).

## Cài đặt (khoảng 10 phút)

### 1. Tạo bot Discord
1. Vào https://discord.com/developers/applications → **New Application**.
2. Mở tab **Bot** → **Reset Token** → copy token.
3. Cũng ở tab **Bot**, bật **MESSAGE CONTENT INTENT**.
4. Mở tab **OAuth2 → URL Generator**:
   - Scopes: chọn `bot` và `applications.commands`.
   - Bot Permissions: chọn `Send Messages`, `Read Message History`, `View Channels`.
   - Mở link vừa tạo để mời bot vào server.

### 2. Lấy API key AI (miễn phí)
Vào https://console.groq.com → đăng nhập bằng Google hoặc email → **API Keys** → **Create API Key** → copy key.
Gói Free cho model `openai/gpt-oss-120b` khoảng 1.000 lượt hỏi/ngày. Hết lượt thì bot báo lỗi 429, đợi qua ngày là dùng lại được.

### 3. Chạy bot trong VS Code
1. **File → Open Folder** → chọn thư mục `discord-ai-bot`.
2. Đổi tên `.env.example` thành `.env`, rồi dán token và API key vào.
3. Mở Terminal (`Ctrl + \``) và chạy:
   ```
   npm install
   npm start
   ```
4. Khi thấy `✅ Đã đăng nhập: ...` là bot đã online. Thử `@TênBot xin chào` trong server.

## Tùy chỉnh trong `.env`
- `BOT_NAME`: tên bot tự xưng.
- `SYSTEM_PROMPT`: tính cách và cách trả lời của bot.
- `MAX_HISTORY`: số tin nhắn gần nhất bot nhớ trong mỗi kênh.
- `MODEL`: model muốn dùng, ví dụ `openai/gpt-oss-120b` (thông minh hơn) hoặc `openai/gpt-oss-20b` (nhanh hơn).
- `FALLBACK_MODEL`: model dự phòng khi hết lượt (mặc định `openai/gpt-oss-20b`).
- `OWNER_ID`: ID Discord của chồng.
- `COOLDOWN_SECONDS`: thời gian chờ chống spam (mặc định 4).
- `DEFAULT_LANG`: ngôn ngữ dịch mặc định (mặc định `vi`).
- `VISION_MODELS`: các model đọc ảnh, cách nhau dấu phẩy, thử lần lượt.
- `CHIME_CHANCE`: xác suất tự chen vào chat (mặc định `0.06` = 6%). Đặt `0` để tắt.
- `CHIME_COOLDOWN_MIN`: số phút giữa 2 lần chen trong 1 kênh (mặc định 20).
- `CHIME_CHANNELS`: ID các kênh được chen, cách nhau dấu phẩy. Để trống = mọi kênh.
- `WELCOME_CHANNEL_ID`: kênh chào thành viên mới.
- `BIRTHDAY_HOUR`: giờ bắt đầu chúc sinh nhật (mặc định 8).

Các biến trên đều có giá trị mặc định, không cần thêm vào `.env` nếu không muốn đổi.

## Nhạc & voice
**Ra lệnh bằng chữ:** @bot rồi nói tự nhiên (tiếng Việt hoặc tiếng Anh):
| Muốn | Nói |
|---|---|
| Mở bài | `mở cho anh bài Lạc Trôi`, `play Shape of You`, dán link YouTube/Spotify |
| Mở playlist | dán link playlist YouTube, album hoặc playlist Spotify (tối đa 50 bài) |
| Điều khiển | `qua bài` / `skip`, `dừng nhạc` / `stop`, `tạm dừng`, `phát tiếp`, `hàng đợi` / `np` |
| Lặp, trộn | `lặp lại bài này`, `lặp hàng đợi`, `tắt lặp`, `trộn bài` / `shuffle` |
| Âm lượng | `âm lượng 40`, `to lên`, `nhỏ lại` |
| Tự phát | `bật tự phát`: hết hàng đợi thì bot tự chọn bài liên quan |
| Xóa bài | `xóa bài số 3` |
| Yêu thích | `lưu bài này`, `danh sách yêu thích`, `mở danh sách yêu thích` |

**Lệnh gạch chéo:** `/phat`, `/nhac qua|dung|tamdung|tiep|hangdoi|lap|tron|amluong|tuphat|xoa`, `/yeuthich luu|xem|phat|xoa`, hoặc tiếng Anh `/play /skip /stop /pause /resume /queue /loop /shuffle /volume /autoplay /remove /leave`.

**Nói chuyện bằng giọng:** `/voice nghe` → trong voice, gọi **"Columbina"** ở đầu câu:
- *"Columbina, mở bài Lạc Trôi"*, *"Columbina, qua bài"* → điều khiển nhạc.
- *"Columbina, hôm nay em thế nào?"* → bot trả lời bằng giọng nói, và ghi lại hội thoại ở kênh chữ.
- Khi bot nói, nhạc tự tạm dừng rồi phát tiếp.
- Mỗi câu nói trong voice tốn 1 lượt nhận dạng giọng nói của Groq (miễn phí ~20 lượt/phút). Bot tự giới hạn 15 lượt/phút (`STT_PER_MIN`) và bỏ qua câu ngắn dưới 1 giây. Tắt bằng `/voice nghe bat:False`.

**Hát ru:** `/haru [phut]` → Columbina hát ru một bài tự sáng tác, mở nhạc piano nhẹ, rồi tự rời voice sau 30 phút (hoặc số phút bạn chọn).

**Tùy chỉnh trong `.env`:** `MUSIC_VOLUME` (0–1, mặc định 0.5), `MAX_SONG_MINUTES` (mặc định 15), `TTS_VOICE`, `STT_LANG` (mặc định `vi`, đặt `auto` để tự nhận ngôn ngữ), `VOICE_WAKE=off` (trả lời mọi câu, không cần gọi tên), `LULLABY_QUERY` (nhạc nền khi hát ru).

## Bật voice (làm 1 lần)
1. Mở terminal trong thư mục bot, chạy:
   ```
   npm install @discordjs/voice @snazzah/davey opusscript ffmpeg-static libsodium-wrappers msedge-tts
   ```
2. Cấp cho role của bot quyền **Connect** và **Speak**.
3. Chạy lại bot. Thấy `🔊 Đã bật tính năng voice` là xong.
- Giọng mặc định là `vi-VN-HoaiMyNeural` (nữ). Đổi bằng `TTS_VOICE` trong `.env`, ví dụ `vi-VN-NamMinhNeural` (nam).
- Cần Node.js 22.12 trở lên.

## Bật nhạc (làm 1 lần)
1. Tải `yt-dlp.exe` ở https://github.com/yt-dlp/yt-dlp/releases/latest (mục Assets).
2. Đặt `yt-dlp.exe` vào thư mục bot (cạnh `index.js`).
3. Bot **tự cập nhật yt-dlp** khi khởi động, mỗi 24 giờ, và ngay khi yt-dlp bị lỗi (tối đa 1 lần/giờ). Terminal sẽ hiện dòng `🔄 Kiểm tra yt-dlp`.
- `MUSIC_VOLUME` trong `.env`: âm lượng nhạc từ 0 đến 1 (mặc định 0.5). `MAX_SONG_MINUTES`: độ dài tối đa mỗi bài (mặc định 15).

## Ảnh trong câu trả lời
- **Bot xem ảnh:** gửi ảnh kèm @Columbina (bài tập, ảnh chụp màn hình, ảnh gacha…). Model đọc ảnh chép lại chữ/công thức, rồi model chính giải và trả lời theo giọng Columbina. Nội dung ảnh được nhớ lại nên hỏi tiếp được. Bot tự dò model đọc ảnh còn hoạt động trên Groq lúc khởi động (dòng `👁️ Model đọc ảnh:` trong terminal); muốn chỉ định thì đặt `VISION_MODELS=...`.
- **Bot gửi ảnh:** khi bạn nhờ vẽ, nhờ gửi ảnh hay "cho anh xem…", Columbina tự vẽ và gắn ảnh vào câu trả lời (chữ hiện trước, ảnh hiện sau vài giây).
- **`/ve mo_ta:...`** (tiếng Anh `/draw`): tự mô tả bức tranh muốn vẽ, chọn khổ vuông / ngang / dọc.
- **`/ungho`** (tiếng Anh `/donate`): gửi mã QR chuyển khoản ủng hộ (chỉ người gõ thấy). Lưu ảnh QR từ app ngân hàng thành `donate.png` cạnh `index.js`, và một bản trong `web/` để hiện trên trang web.
- Dùng Pollinations.ai miễn phí: khoảng 1 ảnh / 15 giây (bot tự xếp hàng), có logo nhỏ, đôi khi quá tải (bot tự thử lại). Lấy key miễn phí ở enter.pollinations.ai rồi đặt `POLLINATIONS_KEY=...` trong `.env` để ổn định hơn, không logo.
- Không vẽ người thật, nhân vật có bản quyền, nội dung 18+ hay máu me. Tắt hẳn: `IMAGE_GEN=off`.

## Giờ ngủ, ngày lễ, ảnh trích dẫn
- **Ngủ theo giờ thật (1:00–6:59):** trạng thái chuyển "💤 Đang ngủ…" (chấm vàng), ai gọi thì Columbina trả lời ngái ngủ; không tự chen chat hay thả biểu cảm. Nhạc, nhắc việc vẫn chạy. Đổi giờ: `SLEEP_HOURS=0-8`, tắt: `SLEEP_HOURS=off`.
- **Chào buổi sáng:** lúc thức dậy (7:00) Columbina chào ở kênh server hay trò chuyện nhất (server im lặng quá 3 ngày thì thôi). Admin bật/tắt: `/chaosang` (tiếng Anh `/morning`). Tắt hẳn: `MORNING_GREETING=off`.
- **Ngày lễ:** Tết, Giao thừa, Trung thu (âm lịch, có sẵn tới 2031), Năm mới, Valentine, 8/3, Cá tháng Tư, 1/6, 20/10, Halloween, 20/11, Giáng sinh, 31/12 → trạng thái, lời chào buổi sáng, cách nói chuyện và biểu cảm đổi theo dịp. AI cũng luôn biết giờ, thứ, mùa hiện tại.
- **Ảnh trích dẫn:** chuột phải tin nhắn → **Apps → Tạo ảnh trích dẫn** (tiếng Anh: *Make it a quote*). Cần cài 1 lần: `npm install sharp`.

## Tự thả biểu cảm
- Columbina thỉnh thoảng thả emoji vào tin nhắn theo cảm xúc: 🎂 sinh nhật, 🎉 chúc mừng, 🌙 ngủ ngon, 🫂 buồn, 😆 cười, 💜 yêu/cảm ơn, 🎶 nhạc, ❄️ Genshin, 🍰 đồ ăn, ☕ mệt, 👀 ảnh/thắc mắc… (hiểu cả tiếng Việt lẫn tiếng Anh, không tốn lượt AI).
- Tin có cảm xúc rõ: 35% được thả; tin bình thường: 4%; tin của chủ bot nhiều hơn. Mỗi kênh tối đa 1 lần / 90 giây.
- Admin bật/tắt cho server: `/bieucam` (tiếng Anh: `/reactions`). Tắt hẳn: `REACTIONS=off`. Chỉnh tần suất: `REACT_MOOD_CHANCE`, `REACT_PLAIN_CHANCE`, `REACT_COOLDOWN_SEC`.

## Rich Presence (hồ sơ Discord của chủ bot)
Khi bạn ngồi **cùng kênh voice** với Columbina, hồ sơ của bạn tự hiện:
- Đang phát nhạc: **Đang nghe** tên bài · "🎶 cùng Columbina ♪", có thanh thời gian chạy theo bài, ảnh bìa YouTube, nút "Nghe trên YouTube" và "Mời Columbina".
- Không phát nhạc: **Đang trò chuyện cùng Columbina** · tên kênh voice, đồng hồ đếm từ lúc bot vào voice.
- Lúc rảnh: "Columbina đang ngắm trăng…" (ẩn bằng `RPC_IDLE=hide`).

Cần:
1. App Discord của bạn đang mở **trên cùng máy** với bot.
2. Tải ảnh lên Developer Portal → **Rich Presence** → **Art Assets**, đặt tên **`columbina`** (ảnh vuông, tối thiểu 512×512).
- Tắt hẳn: `RICH_PRESENCE=off`. Nút "Xem Columbina" mặc định dẫn về `https://columbinanoah.netlify.app`. Đổi link bằng `WEBSITE_URL=...`, hoặc `WEBSITE_URL=off` để dẫn thẳng tới link mời Discord.

## Ghi lỗi & sao lưu
- Lỗi và cảnh báo được ghi vào `logs/<ngày>.log` (giữ 14 ngày). Lỗi làm sập bot được ghi dòng `CRASH` trước khi `start.bat` khởi động lại.
- Dữ liệu (trí nhớ, người dùng, cài đặt, lời nhắc, yêu thích, prompt) được sao lưu mỗi ngày vào `backups/<ngày>/` (giữ 7 ngày).
- Khôi phục: tắt bot, chép các file trong `backups/<ngày>/` đè vào thư mục bot, rồi bật lại.
- Chủ bot dùng `/baotri loi` để xem 10 lỗi gần nhất ngay trên Discord, `/baotri saoluu` để sao lưu ngay.
- Đổi số ngày giữ trong `.env`: `KEEP_LOG_DAYS`, `KEEP_BACKUP_DAYS`.

## Chạy 24/7
- Bấm đúp `start.bat`: bot chạy và tự khởi động lại sau 5 giây nếu bị lỗi hoặc tắt.
- Tự chạy khi bật máy: nhấn `Win + R`, gõ `shell:startup`, Enter. Chuột phải `start.bat` → **Create shortcut**, rồi kéo shortcut vào thư mục vừa mở.

## Lưu ý
- **Đừng chia sẻ file `.env`** cho ai, vì trong đó có token và API key. File này đã nằm trong `.gitignore`.
- Muốn bot quên sạch: tắt bot rồi xóa file `memory.json` và `users.json`.
- Bot chỉ chạy khi máy bạn đang bật (và đang chạy `start.bat` hoặc `npm start`).

import readline from "readline";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import { Telegraf, Markup } from "telegraf";
import dotenv from "dotenv";

/* ============================
    ==== TERMINAL SETUP .env ====
    ============================ */
function mask(v) {
    if (!v) return "";
    if (v.length <= 8) return "****";
    return v.slice(0, 4) + "****" + v.slice(-4);
}
function clean(v) {
    return String(v || "").replace(/^["']|["']$/g, "").trim();
}

async function runSetup() {
    if (fs.existsSync(".env")) dotenv.config();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(res => rl.question(q, res));

    async function askWithDefault(label, def, validator, errorMsg) {
        while (true) {
            const hint = def ? ` [Enter = pakai lama: ${mask(def)}]` : "";
            const answer = (await ask(`${label}${hint}\n> `)).trim();
            if (answer === "" && def) return def;
            if (validator(answer)) return answer;
            console.log(`❌ ${errorMsg}\n`);
        }
    }

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║  🔧  SETUP BOT OTP BY DPW                ║");
    console.log("╚══════════════════════════════════════════╝");
    if (fs.existsSync(".env")) {
        console.log("ℹ️  File .env sudah ada. Enter = pakai nilai lama.\n");
    } else {
        console.log("ℹ️  File .env belum ada. Isi data berikut:\n");
    }

    const botToken = await askWithDefault(
        "🤖 BOT TOKEN",
        clean(process.env.BOT_TOKEN),
        v => v.length >= 40 && /^\d/.test(v),
        "BOT TOKEN tidak valid! Minimal 40 karakter dan diawali angka."
    );
    const ownerId = await askWithDefault(
        "👤 OWNER ID (Telegram ID)",
        clean(process.env.OWNER_ID),
        v => /^\d+$/.test(v),
        "OWNER ID harus berupa angka!"
    );
    const apiKey = await askWithDefault(
        "🔑 API KEY DITZNESIA",
        clean(process.env.API_KEY),
        v => v.length >= 20,
        "API KEY terlalu pendek! Minimal 20 karakter."
    );
    let defChannel = clean(process.env.CHANNEL_USERNAME);
    if (defChannel && !defChannel.startsWith("@")) defChannel = "@" + defChannel;

    const channelInput = await askWithDefault(
        "📢 CHANNEL USERNAME (contoh: @mychannel)",
        defChannel,
        v => {
            const val = v.startsWith("@") ? v : "@" + v;
            return /^@[a-zA-Z0-9_]{3,}$/.test(val);
        },
        "Username channel tidak valid! Gunakan format @namachannel."
    );
    const channelUsername = channelInput.startsWith("@") ? channelInput : "@" + channelInput;

    const baseUrl = await askWithDefault(
        "🌐 BASE URL API (contoh: https://api.ditznesia.com/v1)",
        clean(process.env.BASE_URL),
        v => v === "" || /^https?:\/\//.test(v),
        "BASE URL harus diawali http:// atau https://"
    );

    const serverId = await askWithDefault(
        "🖥️ SERVER ID 1-6 (contoh: 1)",
        clean(process.env.SERVER_ID) || "1",
        v => v >= "1" && v <= "6",
        "Server ID harus antara 1-6."
    );

    rl.close();

    let envData = "";
    envData += `BOT_TOKEN=${botToken}\n`;
    envData += `OWNER_ID=${ownerId}\n`;
    envData += `API_KEY=${apiKey}\n`;
    envData += `CHANNEL_USERNAME=${channelUsername}\n`;
    if (baseUrl) envData += `BASE_URL=${baseUrl}\n`;
    envData += `SERVER_ID=${serverId}\n`;
    const MARKUP_HARGA = 1000;

    fs.writeFileSync(".env", envData);

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║  ✅  KONFIGURASI BERHASIL DISIMPAN       ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`🤖 Bot Token  : ${mask(botToken)}`);
    console.log(`👤 Owner ID   : ${ownerId}`);
    console.log(`🔑 API Key    : ${mask(apiKey)}`);
    console.log(`📢 Channel    : ${channelUsername}`);
    if (baseUrl) console.log(`🌐 Base URL   : ${baseUrl}`);
    console.log(`🖥️ Server ID  : ${serverId}`);
    console.log("");
}

const forceSetup = process.argv.includes("--setup");
const envMissing =
    !fs.existsSync(".env") ||
    fs.readFileSync(".env", "utf8").trim() === "";

if (forceSetup || envMissing) {
    await runSetup();
    console.log("🔄 Restarting bot...\n");
    await new Promise(r => setTimeout(r, 1200));
    const args = process.argv.slice(2).filter(a => a !== "--setup");
    const cmd = `"${process.execPath}" "${process.argv[1]}" ${args.join(" ")}`;
    exec(cmd, () => process.exit(0));
    await new Promise(() => {});
}

dotenv.config();

/* ============================
    ====== ENV PARSING (FIX) ====
    ============================ */
const BOT_TOKEN = clean(process.env.BOT_TOKEN);
const OWNER_ID = Number(clean(process.env.OWNER_ID));
const API_KEY = clean(process.env.API_KEY);
const CHANNEL_USERNAME = clean(process.env.CHANNEL_USERNAME);
const BASE_URL = clean(process.env.BASE_URL) || "";
const SERVER_ID = clean(process.env.SERVER_ID) || "1";

if (!BOT_TOKEN || !OWNER_ID || !API_KEY || !CHANNEL_USERNAME) {
    console.error("❌ Error: BOT_TOKEN, OWNER_ID, API_KEY, atau CHANNEL_USERNAME belum diset!");
    console.error("💡 Jalankan: node bot.js --setup");
    process.exit(1);
}
if (isNaN(OWNER_ID)) {
    console.error("❌ OWNER_ID bukan angka valid:", process.env.OWNER_ID);
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const DB_DIR = "./database";
const DB_PATH = path.join(DB_DIR, "user.json");
const LOGO_PATH = "./logo.jpg";

/* ============================
    ==== DATABASE (ROBUST) ======
    ============================ */
function ensureDBDir() {
    try {
        if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    } catch (e) {
        console.error("❌ Gagal buat folder database:", e.message);
        throw e;
    }
}

function loadDB() {
    ensureDBDir();
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, "{}");
        return {};
    }
    try {
        const raw = fs.readFileSync(DB_PATH, "utf8").trim();
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.error("❌ DB corrupt, reset:", e.message);
        fs.writeFileSync(DB_PATH, "{}");
        return {};
    }
}

function saveDB(db) {
    ensureDBDir();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function registerUser(id, firstName = "", username = "") {
    try {
        const key = String(id);
        const db = loadDB();
        if (!db[key]) {
            db[key] = {
                id: Number(id),
                first_name: firstName,
                username: username,
                saldo: 0,
                created_at: Date.now(),
                last_seen: Date.now()
            };
            saveDB(db);
            console.log(`✅ [DB] User baru terdaftar: ${key} (${firstName || "-"})`);
        } else {
            db[key].last_seen = Date.now();
            if (firstName) db[key].first_name = firstName;
            if (username) db[key].username = username;
            saveDB(db);
        }
    } catch (e) {
        console.error("❌ registerUser error:", e.message);
    }
}

/* ============================
    ====== JOIN VALIDATION ======
    ============================ */
let botAdminOk = null;
let botAdminCheckedAt = 0;

async function verifyBotIsAdmin() {
    const now = Date.now();
    if (botAdminOk !== null && now - botAdminCheckedAt < 5 * 60 * 1000) {
        return botAdminOk;
    }
    try {
        const me = await bot.telegram.getMe();
        const member = await bot.telegram.getChatMember(CHANNEL_USERNAME, me.id);
        botAdminOk = ["administrator", "creator"].includes(member.status);
        botAdminCheckedAt = now;
        if (!botAdminOk) {
            console.error(`⚠️  [ADMIN CHECK] Bot BUKAN admin di ${CHANNEL_USERNAME} (status=${member.status})`);
        } else {
            console.log(`✅ [ADMIN CHECK] Bot adalah ${member.status} di ${CHANNEL_USERNAME}`);
        }
        return botAdminOk;
    } catch (e) {
        console.error(`⚠️  [ADMIN CHECK] Gagal cek bot di ${CHANNEL_USERNAME}: ${e.message}`);
        botAdminOk = false;
        botAdminCheckedAt = now;
        return false;
    }
}

async function isJoinedChannel(ctx) {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        const status = member.status;
        return ["member", "administrator", "creator"].includes(status);
    } catch (e) {
        return false;
    }
}

function getJoinKeyboard() {
    const channelLink = `https://t.me/${CHANNEL_USERNAME.replace(/^@/, "")}`;
    return Markup.inlineKeyboard([
        [Markup.button.url("📢 Join Channel", channelLink)],
        [Markup.button.callback("✅ Cek Verifikasi", "check_join")]
    ]).reply_markup;
}

function getJoinCaption() {
    return `<b>🔒 AKSES DIBATASI</b>

Anda harus bergabung ke channel kami terlebih dahulu untuk bisa menggunakan bot ini.

📢 Channel: ${CHANNEL_USERNAME}

<i>Klik tombol "Join Channel" lalu "Cek Verifikasi".</i>`;
}

async function sendJoinMessage(ctx) {
    const caption = getJoinCaption();
    const extra = { parse_mode: "HTML", reply_markup: getJoinKeyboard() };
    try {
        if (fs.existsSync(LOGO_PATH)) {
            await ctx.replyWithPhoto({ source: fs.createReadStream(LOGO_PATH) }, { caption, ...extra });
        } else {
            await ctx.reply(caption, extra);
        }
    } catch (e) {
        console.error("sendJoinMessage error:", e.message);
    }
}

async function editToJoinMessage(ctx) {
    const caption = getJoinCaption();
    const extra = { parse_mode: "HTML", reply_markup: getJoinKeyboard() };
    try {
        await ctx.editMessageText(caption, extra);
    } catch (e) {
        if (e.message.includes("message is not modified")) return;
        try {
            await ctx.editMessageCaption(caption, extra);
        } catch (e2) {
            if (e2.message.includes("message is not modified")) return;
            console.error("editToJoinMessage fallback:", e2.message);
            await sendJoinMessage(ctx);
        }
    }
}

/* ============================
    == MIDDLEWARE WAJIB JOIN ====
    ============================ */
bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return next();

    if (ctx.from.id === OWNER_ID) {
        console.log(`👑 Owner bypass (tidak dicatat): ${ctx.from.id}`);
        return next();
    }

    registerUser(ctx.from.id, ctx.from.first_name || "", ctx.from.username || "");

    if (ctx.callbackQuery?.data === "check_join") return next();

    const joined = await isJoinedChannel(ctx);
    if (!joined) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery("❌ Anda belum join channel!", { show_alert: true }).catch(() => {});
            await editToJoinMessage(ctx);
        } else {
            await sendJoinMessage(ctx);
        }
        return;
    }

    return next();
});

/* ============================
    ====== HELPER FUNCTION ======
    ============================ */
async function editOrSendMessage(ctx, caption, options, photo) {
    try {
        if (ctx.callbackQuery) {
            if (photo && fs.existsSync(photo)) {
                await ctx.editMessageMedia({
                    type: "photo",
                    media: { source: fs.createReadStream(photo) },
                    caption: caption,
                    parse_mode: options.parse_mode
                });
                await ctx.editMessageReplyMarkup(options.reply_markup);
            } else {
                await ctx.editMessageText(caption, options);
            }
        } else {
            if (photo && fs.existsSync(photo)) {
                await ctx.replyWithPhoto({ source: fs.createReadStream(photo) }, { caption, ...options });
            } else {
                await ctx.reply(caption, options);
            }
        }
    } catch (error) {
        if (error.message.includes("message is not modified")) return;
        console.error("editOrSendMessage:", error.message);
        if (error.message.includes("query is too old") || error.message.includes("timeout")) {
            try {
                if (photo && fs.existsSync(photo)) {
                    await ctx.replyWithPhoto({ source: fs.createReadStream(photo) }, { caption, ...options });
                } else {
                    await ctx.reply(caption, options);
                }
            } catch (e) { console.error("send fallback:", e.message); }
        } else {
            throw error;
        }
    }
}

/* ============================
    ====== MAIN MENU ============
    ============================ */
function createMainMenu(id, firstName) {
    const db = loadDB();
    const user = db[String(id)] || {};
    const saldo = Number(user.saldo || 0);
    const saldoFmt = saldo.toLocaleString("id-ID");

    const date = new Date().toLocaleDateString("id-ID", {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric'
    });

    const caption = `
<b>🌸 𝓑𝓸𝓽 𝓞𝓣𝓟 𝓫𝔂 𝓓𝓟𝓦 🌸</b>
<i>⋆｡°✩ Sistem Otomatis • Online 24 Jam ✩°｡⋆</i>

こんにちは~ (≧▽≦)/
Halo, <b>${firstName}</b>!

<blockquote>✿ <b>ɪɴꜰᴏʀᴍᴀꜱɪ ᴜꜱᴇʀ</b> ✿
🆔 <b>ID</b>      : <code>${id}</code>
🎀 <b>Nama</b>    : ${firstName}
💰 <b>Saldo</b>   : <b>Rp ${saldoFmt}</b></blockquote>

<blockquote>✧ <b>ɪɴꜰᴏʀᴍᴀꜱɪ ʙᴏᴛ</b> ✧
⚡ <b>Status</b>  : Online 🟢
🛡️ <b>Sistem</b>  : Otomatis & Aman
🌙 <b>Tanggal</b> : ${date}
📝 <b>Catatan</b> : Pastikan saldo cukup ya~</blockquote>

<i>✨ Silakan pilih menu di bawah (⁠｡⁠•̀⁠ᴗ⁠-⁠)⁠✧</i>`.trim();

    return {
        caption,
        options: {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard([
                [
                    Markup.button.callback("📦 Layanan OTP", "list_layanan"),
                    Markup.button.callback("💰 Top Up", "topup")
                ],
                [
                    Markup.button.callback("👤 Profil", "profile"),
                    Markup.button.callback("🔄 Refresh", "start")
                ],
                [
                    Markup.button.url("💬 Hubungi Owner", "https://t.me/dpwoffc")
                ]
            ]).reply_markup
        }
    };
}

/* ============================
    ====== FITUR LAYANAN =======
    ============================ */
async function renderCountryList(ctx, page = 0) {
    try {
        const url = `${BASE_URL}/countries?apikey=${API_KEY}&server=${SERVER_ID}`;
        const response = await axios.get(url);
        const countries = Array.isArray(response.data) ? response.data : (response.data.data || []);
        
        if (countries.length === 0) {
            return ctx.answerCbQuery("❌ Tidak ada negara yang tersedia saat ini.", { show_alert: true }).catch(() => {});
        }

        const ITEMS_PER_PAGE = 6;
        const totalPages = Math.ceil(countries.length / ITEMS_PER_PAGE);
        
        if (page < 0) page = 0;
        if (page >= totalPages) page = totalPages - 1;

        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = countries.slice(start, end);

        const buttons = [];
        
        for (let i = 0; i < pageItems.length; i += 2) {
            const row = [];
            const item1 = pageItems[i];
            const item2 = pageItems[i + 1];

            const name1 = item1.name || item1.country || item1.country_name || "Unknown";
            const id1 = item1.id || item1.country_id || item1.code;
            row.push(Markup.button.callback(`🌍 ${name1}`, `order_${id1}`));

            if (item2) {
                const name2 = item2.name || item2.country || item2.country_name || "Unknown";
                const id2 = item2.id || item2.country_id || item2.code;
                row.push(Markup.button.callback(`🌍 ${name2}`, `order_${id2}`));
            }
            buttons.push(row);
        }

        const navRow = [];
        if (page > 0) navRow.push(Markup.button.callback("⬅️ Prev", `layanan_page_${page - 1}`));
        if (page < totalPages - 1) navRow.push(Markup.button.callback("Next ➡️", `layanan_page_${page + 1}`));
        if (navRow.length > 0) buttons.push(navRow);

        buttons.push([Markup.button.callback("🏠 Menu Utama", "start")]);

        const caption = `📦 <b>PILIH NEGARA</b>\n\n<i>Halaman ${page + 1} dari ${totalPages}</i>\n\nSilakan pilih negara untuk layanan OTP:`;
        
        const options = {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        };

        await editOrSendMessage(ctx, caption, options, LOGO_PATH);
        await ctx.answerCbQuery().catch(() => {});

    } catch (error) {
        console.error("Error fetching countries:", error.message);
        await ctx.answerCbQuery("❌ Gagal mengambil data layanan dari server.", { show_alert: true }).catch(() => {});
    }
}

async function renderServiceList(ctx, countryId, page = 0) {
    try {
        const url = `${BASE_URL}/services?apikey=${API_KEY}&server=${SERVER_ID}&country=${countryId}`;
        const response = await axios.get(url);
        const services = Array.isArray(response.data) ? response.data : (response.data.data || []);
        
        if (services.length === 0) {
            return ctx.answerCbQuery("❌ Tidak ada layanan di negara ini.", { show_alert: true }).catch(() => {});
        }

        const ITEMS_PER_PAGE = 6;
        const totalPages = Math.ceil(services.length / ITEMS_PER_PAGE);
        
        if (page < 0) page = 0;
        if (page >= totalPages) page = totalPages - 1;

        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = services.slice(start, end);

        const buttons = [];
        
        for (let i = 0; i < pageItems.length; i += 2) {
            const row = [];
            const item1 = pageItems[i];
            const item2 = pageItems[i + 1];

            const price1 = Number(item1.price).toLocaleString('id-ID');
            const name1 = (item1.service_name || item1.produk || "Unknown").toUpperCase();
            row.push(Markup.button.callback(`🛠️ ${name1} | ${price1}`, `buy_${countryId}_${item1.id}`));

            if (item2) {
                const price2 = Number(item2.price).toLocaleString('id-ID');
                const name2 = (item2.service_name || item2.produk || "Unknown").toUpperCase();
                row.push(Markup.button.callback(`🛠️ ${name2} | ${price2}`, `buy_${countryId}_${item2.id}`));
            }
            buttons.push(row);
        }

        const navRow = [];
        if (page > 0) navRow.push(Markup.button.callback("⬅️ Prev", `svc_page_${countryId}_${page - 1}`));
        if (page < totalPages - 1) navRow.push(Markup.button.callback("Next ➡️", `svc_page_${countryId}_${page + 1}`));
        if (navRow.length > 0) buttons.push(navRow);

        buttons.push([Markup.button.callback("🔙 Kembali ke Negara", "layanan_page_0")]);
        buttons.push([Markup.button.callback("🏠 Menu Utama", "start")]);

        const caption = `🛠️ <b>PILIH LAYANAN</b>\n\n📌 Negara ID: <code>${countryId}</code>\n📄 Halaman ${page + 1} dari ${totalPages}\n\n<i>Silakan pilih layanan yang ingin diorder:</i>`;
        
        const options = {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        };

        await editOrSendMessage(ctx, caption, options, LOGO_PATH);
        await ctx.answerCbQuery().catch(() => {});

    } catch (error) {
        console.error("Error fetching services:", error.message);
        await ctx.answerCbQuery("❌ Gagal mengambil data layanan.", { show_alert: true }).catch(() => {});
    }
}

// Handler Tombol Layanan Pertama Kali
bot.action("list_layanan", async (ctx) => {
    await renderCountryList(ctx, 0);
});

// Handler Navigasi Negara (Next & Prev)
bot.action(/^layanan_page_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await renderCountryList(ctx, page);
});

// Handler saat Negara Dipilih (lanjut ke pilih layanan)
bot.action(/^order_(.+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    await renderServiceList(ctx, countryId, 0);
});

// Handler Navigasi Layanan (Next & Prev)
bot.action(/^svc_page_(.+)_(\d+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    const page = parseInt(ctx.match[2], 10);
    await renderServiceList(ctx, countryId, page);
});

// Handler saat Layanan Dipilih (Placeholder untuk order)
bot.action(/^buy_(.+)_(.+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    const serviceId = ctx.match[2];
    
    await ctx.answerCbQuery(`Memproses order ${serviceId}...`, { show_alert: true }).catch(() => {});
    console.log(`User ${ctx.from.id} klik order: Negara ${countryId}, Layanan ${serviceId}`);
    // Di sini nanti kamu bisa tambahkan logika untuk memotong saldo & request API order
});

/* ============================
    ==== CHECK JOIN CALLBACK ====
    ============================ */
bot.action("check_join", async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        registerUser(ctx.from.id, ctx.from.first_name || "", ctx.from.username || "");
    }

    const joined = await isJoinedChannel(ctx);

    if (!joined) {
        await ctx.answerCbQuery("❌ Anda masih belum bergabung ke channel!", { show_alert: true }).catch(() => {});
        await editToJoinMessage(ctx);
        return;
    }

    await ctx.answerCbQuery("✅ Verifikasi berhasil!").catch(() => {});
    const { caption, options } = createMainMenu(ctx.from.id, ctx.from.first_name);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
});

/* ============================
    ========== START ============
    ============================ */
bot.start(async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        registerUser(ctx.from.id, ctx.from.first_name || "", ctx.from.username || "");
    }
    const { caption, options } = createMainMenu(ctx.from.id, ctx.from.first_name);

    if (fs.existsSync(LOGO_PATH)) {
        await ctx.replyWithPhoto({ source: fs.createReadStream(LOGO_PATH) }, { caption, ...options });
    } else {
        await ctx.reply(caption, options);
    }
});

/* ============================
    ====== CALLBACK START =======
    ============================ */
bot.action("start", async (ctx) => {
    const { caption, options } = createMainMenu(ctx.from.id, ctx.from.first_name);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
});

/* ============================
    ===== ERROR HANDLING ========
    ============================ */
bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err);
    if (ctx.message) {
        ctx.reply("❌ Terjadi kesalahan pada sistem. Silakan coba lagi.").catch(() => {});
    }
});

/* ============================
    ========= RUN BOT ===========
    ============================ */
(async () => {
    console.log("╔══════════════════════════════════════════╗");
    console.log("║  🤖 BOT OTP BY DPW                       ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`📸 Logo         : ${fs.existsSync(LOGO_PATH) ? "✅ Ada" : "⚠️  Tidak ditemukan"}`);
    console.log(`📢 Channel      : ${CHANNEL_USERNAME}`);
    console.log(`👑 Owner ID     : ${OWNER_ID}`);
    console.log(`📁 Database     : ${path.resolve(DB_PATH)}`);

    ensureDBDir();
    loadDB();
    console.log(`✅ Database siap`);

    await verifyBotIsAdmin();

    bot.launch();
    console.log("🚀 Bot BERJALAN...\n");
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
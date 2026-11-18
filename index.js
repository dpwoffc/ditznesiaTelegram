import readline from "readline";
import { spawn } from "child_process";
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

function parseEnvFile() {
    if (!fs.existsSync(".env")) return {};
    const content = fs.readFileSync(".env", "utf8");
    const env = {};
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim();
        if (k) env[k] = v;
    }
    return env;
}

function writeEnvFile(env) {
    const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(".env", lines.join("\n") + "\n");
}

const REQUIRED_KEYS = ["BOT_TOKEN", "OWNER_ID", "CHANNEL_USERNAME", "CHANNEL_NOTIF"];
const DEFAULT_VALUES = {
    BASE_URL: "https://www.ditznesia.com/api/dev",
    SERVER_ID: "6",
    OPERATOR: "any",
};

function getMissingRequired() {
    const env = parseEnvFile();
    return REQUIRED_KEYS.filter(k => !clean(env[k]));
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

    const existingEnv = parseEnvFile();

    const botToken = await askWithDefault(
        "🤖 BOT TOKEN",
        clean(existingEnv.BOT_TOKEN),
        v => v.length >= 40 && /^\d/.test(v),
        "BOT TOKEN tidak valid! Minimal 40 karakter dan diawali angka."
    );
    const ownerId = await askWithDefault(
        "👤 OWNER ID (Telegram ID)",
        clean(existingEnv.OWNER_ID),
        v => /^\d+$/.test(v),
        "OWNER ID harus berupa angka!"
    );

    let defChannel = clean(existingEnv.CHANNEL_USERNAME);
    if (defChannel && !defChannel.startsWith("@")) defChannel = "@" + defChannel;
    const channelInput = await askWithDefault(
        "📢 CHANNEL UTAMA (contoh: @mychannel)",
        defChannel,
        v => {
            const val = v.startsWith("@") ? v : "@" + v;
            return /^@[a-zA-Z0-9_]{3,}$/.test(val);
        },
        "Username channel tidak valid! Gunakan format @namachannel."
    );
    const channelUsername = channelInput.startsWith("@") ? channelInput : "@" + channelInput;

    let defNotif = clean(existingEnv.CHANNEL_NOTIF);
    if (defNotif && !defNotif.startsWith("@")) defNotif = "@" + defNotif;
    const notifInput = await askWithDefault(
        "🔔 CHANNEL NOTIFIKASI SUCCESS (contoh: @notifchannel)",
        defNotif,
        v => {
            const val = v.startsWith("@") ? v : "@" + v;
            return /^@[a-zA-Z0-9_]{3,}$/.test(val);
        },
        "Username channel notifikasi tidak valid!"
    );
    const channelNotif = notifInput.startsWith("@") ? notifInput : "@" + notifInput;

    rl.close();

    // Build .env with EXACT order & keys requested
    const newEnv = {
        BOT_TOKEN: botToken,
        OWNER_ID: ownerId,
        API_KEY: existingEnv.API_KEY || "",
        CHANNEL_USERNAME: channelUsername,
        CHANNEL_NOTIF: channelNotif,
        BASE_URL: existingEnv.BASE_URL || DEFAULT_VALUES.BASE_URL,
        SERVER_ID: existingEnv.SERVER_ID || DEFAULT_VALUES.SERVER_ID,
        OPERATOR: existingEnv.OPERATOR || DEFAULT_VALUES.OPERATOR,
    };

    writeEnvFile(newEnv);

    // === VERIFY: pastikan tidak ada key wajib yang kosong ===
    const verify = parseEnvFile();
    const stillMissing = REQUIRED_KEYS.filter(k => !clean(verify[k]));
    if (stillMissing.length > 0) {
        console.error("\n❌ SETUP GAGAL! Key wajib masih kosong:", stillMissing.join(", "));
        console.error("💡 Periksa izin tulis folder & coba lagi.\n");
        process.exit(1);
    }

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║  ✅  KONFIGURASI BERHASIL DISIMPAN       ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`🤖 Bot Token     : ${mask(botToken)}`);
    console.log(`👤 Owner ID      : ${ownerId}`);
    console.log(`📢 Channel Utama : ${channelUsername}`);
    console.log(`🔔 Channel Notif : ${channelNotif}`);
    console.log(`🌐 Base URL      : ${newEnv.BASE_URL}`);
    console.log(`🖥️ Server ID     : ${newEnv.SERVER_ID}`);
    console.log(`⚙️  Operator      : ${newEnv.OPERATOR}`);

    if (!newEnv.API_KEY) {
        console.log("\n⚠️  WARNING: API_KEY masih kosong!");
        console.log("💡 Edit file .env lalu isi:");
        console.log("   API_KEY=your_api_key_here\n");
    } else {
        console.log(`🔑 API Key       : ${mask(newEnv.API_KEY)}`);
    }
    console.log("");
}

const forceSetup = process.argv.includes("--setup");
const missingRequired = getMissingRequired();
const needSetup = forceSetup || missingRequired.length > 0;

if (needSetup) {
    if (!forceSetup && missingRequired.length > 0) {
        console.log(`ℹ️  Key wajib belum lengkap: ${missingRequired.join(", ")}`);
    }
    await runSetup();
    console.log("🔄 Restarting bot...\n");
    await new Promise(r => setTimeout(r, 800));

    const args = process.argv.slice(2).filter(a => a !== "--setup");
    const scriptPath = path.resolve(process.argv[1]);
    const child = spawn(process.execPath, [scriptPath, ...args], {
        detached: true,
        stdio: "inherit",
        cwd: process.cwd(),
    });
    child.unref();
    process.exit(0);
}

dotenv.config();

/* ============================
    ====== ENV PARSING (FIX) ====
    ============================ */
const BOT_TOKEN = clean(process.env.BOT_TOKEN);
const OWNER_ID = Number(clean(process.env.OWNER_ID));
const API_KEY = clean(process.env.API_KEY);
const CHANNEL_USERNAME = clean(process.env.CHANNEL_USERNAME);
const CHANNEL_NOTIF = clean(process.env.CHANNEL_NOTIF);
const BASE_URL = clean(process.env.BASE_URL) || DEFAULT_VALUES.BASE_URL;
const SERVER_ID = clean(process.env.SERVER_ID) || DEFAULT_VALUES.SERVER_ID;
const OPERATOR = clean(process.env.OPERATOR) || DEFAULT_VALUES.OPERATOR;
const MARKUP_HARGA = Number(clean(process.env.MARKUP_HARGA)) || 1000;
const MIN_TOPUP = 2000;
const CANCEL_WAIT_MS = 3 * 60 * 1000;       // 3 menit (user manual cancel)
const AUTO_CANCEL_AFTER_MS = 5 * 60 * 1000; // 5 menit (auto-cancel sistem)
const MAX_PENDING_DEPOSITS = 10;            // provider limit
const WORKER_INTERVAL_MS = 1000;            // 1 detik per deposit (round-robin)

if (!BOT_TOKEN || !OWNER_ID || !CHANNEL_USERNAME || !CHANNEL_NOTIF) {
    console.error("❌ Error: BOT_TOKEN, OWNER_ID, CHANNEL_USERNAME, atau CHANNEL_NOTIF belum diset!");
    console.error("💡 Jalankan: node bot.js --setup");
    process.exit(1);
}
if (isNaN(OWNER_ID)) {
    console.error("❌ OWNER_ID bukan angka valid:", process.env.OWNER_ID);
    process.exit(1);
}
if (!API_KEY) {
    console.warn("⚠️  API_KEY belum diset! Fitur layanan & deposit tidak akan berfungsi.");
}

const bot = new Telegraf(BOT_TOKEN);
const DB_DIR = "./database";
const DB_PATH = path.join(DB_DIR, "user.json");
const DEPOSIT_PATH = path.join(DB_DIR, "deposit.json");
const ORDER_PATH = path.join(DB_DIR, "order.json");
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

function loadJSON(p, def = {}) {
    ensureDBDir();
    if (!fs.existsSync(p)) {
        fs.writeFileSync(p, JSON.stringify(def, null, 2));
        return def;
    }
    try {
        const raw = fs.readFileSync(p, "utf8").trim();
        return raw ? JSON.parse(raw) : def;
    } catch (e) {
        console.error(`❌ ${p} corrupt, reset:`, e.message);
        fs.writeFileSync(p, JSON.stringify(def, null, 2));
        return def;
    }
}

function saveJSON(p, data) {
    ensureDBDir();
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function loadDB() { return loadJSON(DB_PATH, {}); }
function saveDB(db) { saveJSON(DB_PATH, db); }

function loadDeposits() { return loadJSON(DEPOSIT_PATH, {}); }
function saveDeposits(d) { saveJSON(DEPOSIT_PATH, d); }

function getDeposit(id) {
    const deposits = loadDeposits();
    return deposits[String(id)] || null;
}

function isDepositPending(status) {
    const s = String(status || "").toLowerCase();
    if (["success", "cancelled", "cancel", "batal", "expired", "failed"].includes(s)) return false;
    return true;
}

function isDepositTerminal(status) {
    return !isDepositPending(status);
}

function getPendingDeposits() {
    const deposits = loadDeposits();
    return Object.values(deposits)
        .filter(d => isDepositPending(d.status))
        .sort((a, b) => (a.created_at_ms || 0) - (b.created_at_ms || 0));
}

function getUserPendingDeposit(userId) {
    const deposits = loadDeposits();
    const found = Object.values(deposits).find(
        d => isDepositPending(d.status) && Number(d.user_id) === Number(userId)
    );
    return found || null;
}

function processDepositStatus(depId, apiData) {
    const key = String(depId);
    const deposits = loadDeposits();
    const dep = deposits[key];
    if (!dep) return null;

    const oldStatus = String(dep.status || "").toLowerCase();
    const newStatus = String(apiData?.status || oldStatus).toLowerCase();
    const isNewSuccess = newStatus === "success" && oldStatus !== "success";

    deposits[key] = {
        ...dep,
        nominal: Number(apiData?.nominal) || dep.nominal,
        total_bayar: Number(apiData?.total_bayar) || dep.total_bayar,
        total_diterima: Number(apiData?.total_diterima) || dep.total_diterima,
        trx_id: apiData?.trx_id || dep.trx_id,
        qr_link: apiData?.qr_link || dep.qr_link,
        status: newStatus,
        expires_at_ms: Number(apiData?.expires_at_ms) || dep.expires_at_ms,
        updated_at_ms: Date.now(),
    };
    saveDeposits(deposits);

    if (isNewSuccess) {
        const db = loadDB();
        const userKey = String(dep.user_id);
        if (!db[userKey]) {
            db[userKey] = {
                id: Number(dep.user_id),
                first_name: dep.user_name || "",
                username: dep.user_username || "",
                saldo: 0,
                created_at: Date.now(),
                last_seen: Date.now(),
            };
        }
        const creditAmount = Number(deposits[key].total_diterima) || Number(deposits[key].nominal) || 0;
        db[userKey].saldo = Number(db[userKey].saldo || 0) + creditAmount;
        saveDB(db);
        console.log(`💰 [DB] Saldo +${creditAmount} → user ${dep.user_id} (total: ${db[userKey].saldo})`);
    }

    return { oldStatus, newStatus, updated: deposits[key], isNewSuccess };
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
        let allOk = true;
        for (const ch of [CHANNEL_USERNAME, CHANNEL_NOTIF].filter(Boolean)) {
            try {
                const member = await bot.telegram.getChatMember(ch, me.id);
                const ok = ["administrator", "creator"].includes(member.status);
                console.log(`${ok ? "✅" : "⚠️"} [ADMIN CHECK] ${ch}: ${member.status}`);
                if (!ok) allOk = false;
            } catch (e) {
                console.error(`⚠️  [ADMIN CHECK] Gagal cek di ${ch}: ${e.message}`);
                allOk = false;
            }
        }
        botAdminOk = allOk;
        botAdminCheckedAt = now;
        return allOk;
    } catch (e) {
        console.error(`⚠️  [ADMIN CHECK] ${e.message}`);
        botAdminOk = false;
        botAdminCheckedAt = now;
        return false;
    }
}

async function getUnjoinedChannels(ctx) {
    const channels = [CHANNEL_USERNAME, CHANNEL_NOTIF].filter(Boolean);
    const results = await Promise.all(
        channels.map(async ch => {
            try {
                const member = await ctx.telegram.getChatMember(ch, ctx.from.id);
                return {
                    channel: ch,
                    ok: ["member", "administrator", "creator"].includes(member.status)
                };
            } catch (e) {
                return { channel: ch, ok: false };
            }
        })
    );
    return results.filter(r => !r.ok).map(r => r.channel);
}

function getJoinKeyboard(unjoined = []) {
    const buttons = [];
    for (const ch of unjoined) {
        const link = `https://t.me/${ch.replace(/^@/, "")}`;
        const isNotif = ch === CHANNEL_NOTIF;
        buttons.push([Markup.button.url(
            isNotif ? "🔔 Join Channel Notif" : "📢 Join Channel Utama",
            link
        )]);
    }
    buttons.push([Markup.button.callback("✅ Cek Verifikasi", "check_join")]);
    return Markup.inlineKeyboard(buttons).reply_markup;
}

function getJoinCaption(unjoined = []) {
    const list = unjoined.map(ch => `• ${ch}`).join("\n");
    return `<b>🔒 AKSES DIBATASI</b>

Anda harus bergabung ke channel berikut untuk menggunakan bot ini:

${list || `• ${CHANNEL_USERNAME}\n• ${CHANNEL_NOTIF}`}

<i>Klik tombol "Join" lalu "Cek Verifikasi".</i>`;
}

async function sendJoinMessage(ctx, unjoined = [CHANNEL_USERNAME, CHANNEL_NOTIF]) {
    const caption = getJoinCaption(unjoined);
    const extra = { parse_mode: "HTML", reply_markup: getJoinKeyboard(unjoined) };
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

async function editToJoinMessage(ctx, unjoined = [CHANNEL_USERNAME, CHANNEL_NOTIF]) {
    const caption = getJoinCaption(unjoined);
    const extra = { parse_mode: "HTML", reply_markup: getJoinKeyboard(unjoined) };
    try {
        await ctx.editMessageCaption(caption, extra);
    } catch (e) {
        if (e.message.includes("message is not modified")) return;
        try {
            await ctx.editMessageText(caption, extra);
        } catch (e2) {
            if (e2.message.includes("message is not modified")) return;
            console.error("editToJoinMessage fallback:", e2.message);
            await sendJoinMessage(ctx, unjoined);
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

    const unjoined = await getUnjoinedChannels(ctx);
    if (unjoined.length > 0) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery("❌ Anda belum join semua channel!", { show_alert: true }).catch(() => {});
            await editToJoinMessage(ctx, unjoined);
        } else {
            await sendJoinMessage(ctx, unjoined);
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
            try {
                await ctx.editMessageCaption(caption, options);
                return;
            } catch (e1) {
                if (e1.message.includes("message is not modified")) return;
                try {
                    await ctx.editMessageText(caption, options);
                    return;
                } catch (e2) {
                    if (e2.message.includes("message is not modified")) return;
                    throw e2;
                }
            }
        } else {
            if (photo && fs.existsSync(photo)) {
                await ctx.replyWithPhoto({ source: fs.createReadStream(photo) }, { caption, ...options });
            } else {
                await ctx.reply(caption, options);
            }
        }
    } catch (error) {
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

async function editOrSendPhotoURL(ctx, url, caption, options) {
    try {
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageMedia({ type: "photo", media: url, caption, ...options });
                return;
            } catch (e) {
                if (e.message.includes("message is not modified")) return;
                console.error("editMessageMedia error:", e.message);
            }
        }
        await ctx.replyWithPhoto(url, { caption, ...options });
    } catch (e) {
        console.error("editOrSendPhotoURL:", e.message);
        try { await ctx.reply(caption, options); } catch (e2) { console.error("fallback:", e2.message); }
    }
}

function applyMarkup(price) {
    const base = Number(price);
    if (!Number.isFinite(base) || base <= 0) return price;
    return base + MARKUP_HARGA;
}

function formatRupiah(n) {
    return Number(n || 0).toLocaleString("id-ID");
}

function formatDateTime(iso) {
    try {
        const d = new Date(String(iso).replace(" ", "T"));
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString("id-ID");
    } catch { return iso; }
}

function statusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "success") return "✅ SUCCESS";
    if (s === "batal" || s === "cancel" || s === "cancelled") return "❌ BATAL";
    if (s === "expired") return "⏰ EXPIRED";
    if (s === "failed") return "❌ FAILED";
    return "⏳ PENDING";
}

async function getOwnerStats() {
    const db = loadDB();
    let totalUserSaldo = 0;
    let userCount = 0;
    for (const [key, val] of Object.entries(db)) {
        if (Number(key) === OWNER_ID) continue;
        totalUserSaldo += Number(val.saldo || 0);
        userCount++;
    }

    let apiBalance = 0;
    let apiName = "Owner";
    let apiEmail = "-";
    let apiOk = false;
    try {
        if (API_KEY) {
            const res = await axios.get(`${BASE_URL}/profile?apikey=${API_KEY}`, { timeout: 10000 });
            apiBalance = Number(res.data.balance) || 0;
            apiName = res.data.name || "Owner";
            apiEmail = res.data.email || "-";
            apiOk = true;
        }
    } catch (e) {
        console.error("owner profile fetch error:", e.message);
    }

    return {
        apiBalance,
        totalUserSaldo,
        available: apiBalance - totalUserSaldo,
        userCount,
        apiName,
        apiEmail,
        apiOk
    };
}

/* ============================
    ====== MAIN MENU ============
    ============================ */
async function createMainMenu(id, firstName) {
    const isOwner = Number(id) === OWNER_ID;
    const date = new Date().toLocaleDateString("id-ID", {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric'
    });

    let caption;
    const buttons = [
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
    ];

    if (isOwner) {
        const stats = await getOwnerStats();
        const apiText = stats.apiOk
            ? `Rp ${formatRupiah(stats.apiBalance)}`
            : `<i>(API tidak dapat diakses)</i>`;

        caption = `
<b>🌸 𝓑𝓸𝓽 𝓞𝓣𝓟 𝓫𝔂 𝓓𝓟𝓦 🌸</b>
<i>⋆｡°✩ Sistem Otomatis • Online 24 Jam ✩°｡⋆</i>

こんにちは~ (≧▽≦)/
Halo, Owner <b>${stats.apiName || firstName}</b>!

<blockquote>👑 <b>ᴏᴡɴᴇʀ ᴘᴀɴᴇʟ</b> 👑
🆔 <b>ID</b>         : <code>${id}</code>
📧 <b>Email</b>      : ${stats.apiEmail}
👥 <b>User Aktif</b> : ${stats.userCount} user
🌙 <b>Tanggal</b>    : ${date}</blockquote>

<blockquote>💼 <b>ꜱᴀʟᴅᴏ ᴜꜱᴇʀ (ᴅʙ)</b>
💰 <b>Total</b>      : Rp ${formatRupiah(stats.totalUserSaldo)}</blockquote>

<blockquote>🏦 <b>ꜱᴀʟᴅᴏ ᴀᴘɪ</b>
💵 <b>Balance</b>    : ${apiText}
📊 <b>Available</b>  : <b>Rp ${formatRupiah(stats.available)}</b>
<i>(Saldo API − Total Saldo User)</i></blockquote>

<i>✨ Panel Owner Aktif (⁠｡⁠•̀⁠ᴗ⁠-⁠)⁠✧</i>`.trim();
    } else {
        const db = loadDB();
        const user = db[String(id)] || {};
        const saldo = Number(user.saldo || 0);

        caption = `
<b>🌸 𝓑𝓸𝓽 𝓞𝓣𝓟 𝓫𝔂 𝓓𝓟𝓦 🌸</b>
<i>⋆｡°✩ Sistem Otomatis • Online 24 Jam ✩°｡⋆</i>

こんにちは~ (≧▽≦)/
Halo, <b>${firstName}</b>!

<blockquote>✿ <b>ɪɴꜰᴏʀᴍᴀꜱɪ ᴜꜱᴇʀ</b> ✿
🆔 <b>ID</b>      : <code>${id}</code>
🎀 <b>Nama</b>    : ${firstName}
💰 <b>Saldo</b>   : <b>Rp ${formatRupiah(saldo)}</b></blockquote>

<blockquote>✧ <b>ɪɴꜰᴏʀᴍᴀꜱɪ ʙᴏᴛ</b> ✧
⚡ <b>Status</b>  : Online 🟢
🛡️ <b>Sistem</b>  : Otomatis & Aman
🌙 <b>Tanggal</b> : ${date}
📝 <b>Catatan</b> : Pastikan saldo cukup ya~</blockquote>

<i>✨ Silakan pilih menu di bawah (⁠｡⁠•̀⁠ᴗ⁠-⁠)⁠✧</i>`.trim();
    }

    return {
        caption,
        options: {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
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

            const price1 = Number(applyMarkup(item1.price)).toLocaleString('id-ID');
            const name1 = (item1.service_name || item1.produk || "Unknown").toUpperCase();
            row.push(Markup.button.callback(`🛠️ ${name1} | ${price1}`, `buy_${countryId}_${item1.id}`));

            if (item2) {
                const price2 = Number(applyMarkup(item2.price)).toLocaleString('id-ID');
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

bot.action("list_layanan", async (ctx) => {
    await renderCountryList(ctx, 0);
});

bot.action(/^layanan_page_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await renderCountryList(ctx, page);
});

bot.action(/^order_(.+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    await renderServiceList(ctx, countryId, 0);
});

bot.action(/^svc_page_(.+)_(\d+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    const page = parseInt(ctx.match[2], 10);
    await renderServiceList(ctx, countryId, page);
});

bot.action(/^buy_(.+)_(.+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    const serviceId = ctx.match[2];

    await ctx.answerCbQuery(`Memproses order ${serviceId}...`, { show_alert: true }).catch(() => {});
    console.log(`User ${ctx.from.id} klik order: Negara ${countryId}, Layanan ${serviceId}`);
});

/* ============================
    ====== FITUR TOP UP =========
    ============================ */
const topupState = new Map();

function getTopupAmount(userId) {
    const s = topupState.get(userId);
    return s ? s.amount : "";
}
function setTopupAmount(userId, amount) {
    topupState.set(userId, { amount: String(amount || "").slice(0, 9) });
}
function clearTopupAmount(userId) {
    topupState.delete(userId);
}

function buildTopupScreen(userId) {
    const amountStr = getTopupAmount(userId);
    const amountNum = Number(amountStr) || 0;
    const display = amountStr === "" ? "0" : formatRupiah(amountNum);
    const isEnough = amountNum >= MIN_TOPUP;
    const existing = getUserPendingDeposit(userId);

    const pendingInfo = existing
        ? `\n⚠️ <i>Anda masih memiliki deposit aktif: <code>${existing.id}</code>\nSelesaikan atau tunggu auto-cancel 5 menit dulu.</i>`
        : "";

    const caption = `
💰 <b>TOP UP SALDO</b>
━━━━━━━━━━━━━━━━━━━━

Nominal: <b>Rp ${display}</b>
Minimal: <b>Rp ${formatRupiah(MIN_TOPUP)}</b>${pendingInfo}

${amountStr === "" ? "⌨️ <i>Tekan tombol angka di bawah untuk memasukkan nominal.</i>" :
    isEnough ? "✅ <i>Nominal valid. Tekan <b>Lanjut</b> untuk melanjutkan.</i>"
             : `⚠️ <i>Nominal masih di bawah minimal Rp ${formatRupiah(MIN_TOPUP)}.</i>`}
`.trim();

    const buttons = [
        [
            Markup.button.callback("1", "tp_1"),
            Markup.button.callback("2", "tp_2"),
            Markup.button.callback("3", "tp_3"),
        ],
        [
            Markup.button.callback("4", "tp_4"),
            Markup.button.callback("5", "tp_5"),
            Markup.button.callback("6", "tp_6"),
        ],
        [
            Markup.button.callback("7", "tp_7"),
            Markup.button.callback("8", "tp_8"),
            Markup.button.callback("9", "tp_9"),
        ],
        [
            Markup.button.callback("0", "tp_0"),
            Markup.button.callback("⌫ Hapus", "tp_del"),
            Markup.button.callback("🗑️ Clear", "tp_clear"),
        ],
        [
            Markup.button.callback("✅ Lanjut", "tp_next"),
        ],
        [
            Markup.button.callback("🏠 Menu Utama", "start"),
        ],
    ];

    if (existing) {
        buttons.splice(buttons.length - 2, 0, [
            Markup.button.callback("📄 Lihat Deposit Aktif", `dep_view_${existing.id}`)
        ]);
    }

    return {
        caption,
        options: {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        }
    };
}

bot.action("topup", async (ctx) => {
    clearTopupAmount(ctx.from.id);
    const { caption, options } = buildTopupScreen(ctx.from.id);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    await ctx.answerCbQuery().catch(() => {});
});

bot.action(/^tp_(\d)$/, async (ctx) => {
    const digit = ctx.match[1];
    const current = getTopupAmount(ctx.from.id);
    let next = current + digit;

    if (current === "0") next = digit;
    if (current === "" && digit === "0") next = "0";
    if (next.length > 9) next = next.slice(0, 9);

    setTopupAmount(ctx.from.id, next);
    const { caption, options } = buildTopupScreen(ctx.from.id);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    await ctx.answerCbQuery().catch(() => {});
});

bot.action("tp_del", async (ctx) => {
    const current = getTopupAmount(ctx.from.id);
    const next = current.slice(0, -1);
    setTopupAmount(ctx.from.id, next);
    const { caption, options } = buildTopupScreen(ctx.from.id);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    await ctx.answerCbQuery().catch(() => {});
});

bot.action("tp_clear", async (ctx) => {
    clearTopupAmount(ctx.from.id);
    const { caption, options } = buildTopupScreen(ctx.from.id);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    await ctx.answerCbQuery().catch(() => {});
});

bot.action("tp_next", async (ctx) => {
    const amountStr = getTopupAmount(ctx.from.id);
    const amount = Number(amountStr) || 0;

    if (amount < MIN_TOPUP) {
        return ctx.answerCbQuery(
            `❌ Minimal top up Rp ${formatRupiah(MIN_TOPUP)}`,
            { show_alert: true }
        ).catch(() => {});
    }

    const existing = getUserPendingDeposit(ctx.from.id);
    if (existing) {
        return ctx.answerCbQuery(
            `🚫 Anda masih punya deposit aktif!\n\n` +
            `🆔 ID: ${existing.id}\n` +
            `💰 Nominal: Rp ${formatRupiah(existing.nominal)}\n` +
            `📊 Status: ${statusLabel(existing.status)}\n\n` +
            `Selesaikan atau tunggu auto-cancel (5 menit).`,
            { show_alert: true }
        ).catch(() => {});
    }

    await ctx.answerCbQuery(`💡 Konfirmasi deposit Rp ${formatRupiah(amount)}`).catch(() => {});

    const caption = `
🧾 <b>KONFIRMASI DEPOSIT</b>
━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID</b>       : <code>${ctx.from.id}</code>
👤 <b>Nama</b>     : ${ctx.from.first_name || "-"}
💰 <b>Nominal</b>  : <b>Rp ${formatRupiah(amount)}</b>

⚠️ <b>PERHATIAN:</b>
• Pastikan nominal sudah benar
• QR Code akan dibuat setelah konfirmasi
• Bayar sebelum waktu expired
• Deposit auto-cancel jika 5 menit tidak dibayar

<i>Buat deposit sekarang?</i>
`.trim();

    const options = {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("✅ Ya, Buat Deposit", "tp_confirm")],
            [Markup.button.callback("❌ Batal", "topup")],
            [Markup.button.callback("🏠 Menu Utama", "start")]
        ]).reply_markup
    };

    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
});

let creatingDepositCount = 0;
const creatingForUser = new Set();

function tryReserveDepositSlot() {
    const pending = getPendingDeposits();
    if (pending.length + creatingDepositCount >= MAX_PENDING_DEPOSITS) {
        return { ok: false, pending: pending.length };
    }
    creatingDepositCount++;
    return { ok: true, pending: pending.length };
}
function releaseDepositSlot() {
    if (creatingDepositCount > 0) creatingDepositCount--;
}

bot.action("tp_confirm", async (ctx) => {
    const amountStr = getTopupAmount(ctx.from.id);
    const amount = Number(amountStr) || 0;

    if (amount < MIN_TOPUP) {
        return ctx.answerCbQuery(
            `❌ Minimal top up Rp ${formatRupiah(MIN_TOPUP)}`,
            { show_alert: true }
        ).catch(() => {});
    }

    if (!API_KEY) {
        return ctx.answerCbQuery("❌ API_KEY belum diset oleh admin.", { show_alert: true }).catch(() => {});
    }

    const existing = getUserPendingDeposit(ctx.from.id);
    if (existing) {
        return ctx.answerCbQuery(
            `🚫 Anda masih punya deposit aktif!\n\n` +
            `🆔 ID: ${existing.id}\n` +
            `💰 Nominal: Rp ${formatRupiah(existing.nominal)}\n` +
            `📊 Status: ${statusLabel(existing.status)}\n\n` +
            `Tunggu auto-cancel (5 menit) atau cancel manual.`,
            { show_alert: true }
        ).catch(() => {});
    }

    if (creatingForUser.has(ctx.from.id)) {
        return ctx.answerCbQuery(
            "⏳ Deposit Anda sebelumnya masih diproses, tunggu sebentar...",
            { show_alert: true }
        ).catch(() => {});
    }

    const slot = tryReserveDepositSlot();
    if (!slot.ok) {
        return ctx.answerCbQuery(
            `🚫 Slot deposit penuh!\n\n` +
            `Saat ini ada ${slot.pending} deposit aktif.\n` +
            `Maksimal ${MAX_PENDING_DEPOSITS} deposit serentak.\n\n` +
            `Silakan coba lagi setelah ada yang selesai.`,
            { show_alert: true }
        ).catch(() => {});
    }

    creatingForUser.add(ctx.from.id);

    await ctx.answerCbQuery("⏳ Membuat deposit...").catch(() => {});

    try {
        const res = await axios.get(
            `${BASE_URL}/deposit/create?apikey=${API_KEY}&nominal=${amount}`,
            { timeout: 15000 }
        );

        const data = res.data || {};

        if (!data.id || !data.qr_link) {
            throw new Error("Response API tidak valid: " + JSON.stringify(data));
        }

        const record = {
            id: String(data.id),
            user_id: ctx.from.id,
            user_name: ctx.from.first_name || "",
            user_username: ctx.from.username || "",
            nominal: Number(data.nominal) || amount,
            total_bayar: Number(data.total_bayar) || amount,
            total_diterima: Number(data.total_diterima) || amount,
            trx_id: data.trx_id || "",
            qr_link: data.qr_link || "",
            status: data.status || "pending",
            created_at: data.created_at || new Date().toISOString(),
            expires_at_ms: Number(data.expires_at_ms) || 0,
            cashback_code: data.cashback_code || null,
            cashback_amount: Number(data.cashback_amount) || 0,
            created_at_ms: Date.now(),
            updated_at_ms: Date.now()
        };

        const deposits = loadDeposits();
        deposits[String(record.id)] = record;
        saveDeposits(deposits);

        clearTopupAmount(ctx.from.id);
        console.log(`📝 [DEPOSIT] Baru: ${record.id} user=${record.user_id} nominal=${record.nominal}`);

        await showDepositScreen(ctx, record);
    } catch (e) {
        console.error("create deposit error:", e.message);
        const msg = e.response?.data?.message || e.message || "Gagal buat deposit";
        await ctx.answerCbQuery(`❌ ${msg}`, { show_alert: true }).catch(() => {});
    } finally {
        releaseDepositSlot();
        creatingForUser.delete(ctx.from.id);
    }
});

async function showDepositScreen(ctx, dep) {
    const status = String(dep.status || "pending").toLowerCase();
    const isPending = isDepositPending(status);

    const expiredText = dep.expires_at_ms
        ? formatDateTime(new Date(dep.expires_at_ms).toISOString())
        : "-";

    const ageMs = Date.now() - Number(dep.created_at_ms || 0);
    const autoCancelText = isPending
        ? (ageMs >= AUTO_CANCEL_AFTER_MS
            ? "⏰ <i>Sedang diproses auto-cancel...</i>"
            : `⏰ Auto-cancel dalam <b>${Math.max(0, Math.ceil((AUTO_CANCEL_AFTER_MS - ageMs) / 1000))} detik</b>`)
        : "";

    const caption = `
🧾 <b>DETAIL DEPOSIT</b>
━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID Deposit</b> : <code>${dep.id}</code>
🔖 <b>TRX ID</b>     : <code>${dep.trx_id || "-"}</code>
💰 <b>Nominal</b>    : <b>Rp ${formatRupiah(dep.nominal)}</b>
💵 <b>Total Bayar</b>: Rp ${formatRupiah(dep.total_bayar)}
📥 <b>Diterima</b>   : Rp ${formatRupiah(dep.total_diterima)}
📊 <b>Status</b>     : <b>${statusLabel(status)}</b>
⏱️ <b>Expired</b>    : ${expiredText}
${autoCancelText}

<i>Scan QR Code di atas untuk membayar.</i>
${isPending ? "Silakan klik <b>Cek Status</b> setelah melakukan pembayaran." : ""}
`.trim();

    const buttons = [];
    if (isPending) {
        buttons.push([Markup.button.callback("🔄 Cek Status", `dep_check_${dep.id}`)]);
        const canCancel = ageMs >= CANCEL_WAIT_MS;
        if (canCancel) {
            buttons.push([Markup.button.callback("❌ Cancel Deposit", `dep_cancel_${dep.id}`)]);
        } else {
            const remain = Math.ceil((CANCEL_WAIT_MS - ageMs) / 1000);
            buttons.push([Markup.button.callback(`⏳ Cancel (${remain}s)`, "dep_cancel_wait")]);
        }
    } else {
        buttons.push([Markup.button.callback("🔄 Cek Status", `dep_check_${dep.id}`)]);
    }
    buttons.push([Markup.button.callback("💰 Top Up Lagi", "topup")]);
    buttons.push([Markup.button.callback("🏠 Menu Utama", "start")]);

    const options = {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    };

    if (dep.qr_link) {
        await editOrSendPhotoURL(ctx, dep.qr_link, caption, options);
    } else {
        await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    }
}

bot.action(/^dep_view_(.+)$/, async (ctx) => {
    const depId = ctx.match[1];
    const dep = getDeposit(depId);
    if (!dep) {
        return ctx.answerCbQuery("❌ Deposit tidak ditemukan", { show_alert: true }).catch(() => {});
    }
    if (dep.user_id !== ctx.from.id && ctx.from.id !== OWNER_ID) {
        return ctx.answerCbQuery("❌ Ini bukan deposit Anda", { show_alert: true }).catch(() => {});
    }
    await ctx.answerCbQuery().catch(() => {});
    await showDepositScreen(ctx, dep);
});

bot.action("dep_cancel_wait", async (ctx) => {
    return ctx.answerCbQuery(
        `⏳ Tunggu ${CANCEL_WAIT_MS / 1000} detik sejak deposit dibuat sebelum bisa cancel.`,
        { show_alert: true }
    ).catch(() => {});
});

bot.action(/^dep_check_(.+)$/, async (ctx) => {
    const depId = ctx.match[1];
    const dep = getDeposit(depId);

    if (!dep) {
        return ctx.answerCbQuery("❌ Deposit tidak ditemukan", { show_alert: true }).catch(() => {});
    }

    if (dep.user_id !== ctx.from.id && ctx.from.id !== OWNER_ID) {
        return ctx.answerCbQuery("❌ Ini bukan deposit Anda", { show_alert: true }).catch(() => {});
    }

    if (isDepositTerminal(dep.status)) {
        return ctx.answerCbQuery(
            `Status: ${statusLabel(dep.status)}`,
            { show_alert: true }
        ).catch(() => {});
    }

    await ctx.answerCbQuery("🔄 Mengecek status...").catch(() => {});

    try {
        if (!API_KEY) throw new Error("API_KEY belum diset");

        const res = await axios.get(
            `${BASE_URL}/deposit/status?apikey=${API_KEY}&id=${encodeURIComponent(depId)}`,
            { timeout: 15000 }
        );

        const result = processDepositStatus(depId, res.data || {});
        if (!result) {
            return ctx.answerCbQuery("❌ Deposit tidak ditemukan di DB", { show_alert: true }).catch(() => {});
        }

        if (result.isNewSuccess) {
            await notifyDepositSuccess(result.updated);
            await dmDepositSuccess(result.updated);
        }

        await showDepositScreen(ctx, result.updated);

        if (result.newStatus === "success") {
            await ctx.answerCbQuery("✅ Deposit berhasil! Saldo ditambahkan.", { show_alert: true }).catch(() => {});
        } else if (["batal", "cancel", "cancelled"].includes(result.newStatus)) {
            await ctx.answerCbQuery("❌ Deposit dibatalkan.", { show_alert: true }).catch(() => {});
        } else if (result.newStatus === "expired") {
            await ctx.answerCbQuery("⏰ Deposit expired.", { show_alert: true }).catch(() => {});
        } else {
            await ctx.answerCbQuery(`Status: ${statusLabel(result.newStatus)}`, { show_alert: true }).catch(() => {});
        }
    } catch (e) {
        console.error("check status error:", e.message);
        const msg = e.response?.data?.message || "Gagal cek status";
        await ctx.answerCbQuery(`❌ ${msg}`, { show_alert: true }).catch(() => {});
    }
});

bot.action(/^dep_cancel_(.+)$/, async (ctx) => {
    const depId = ctx.match[1];
    const dep = getDeposit(depId);

    if (!dep) {
        return ctx.answerCbQuery("❌ Deposit tidak ditemukan", { show_alert: true }).catch(() => {});
    }

    if (dep.user_id !== ctx.from.id && ctx.from.id !== OWNER_ID) {
        return ctx.answerCbQuery("❌ Ini bukan deposit Anda", { show_alert: true }).catch(() => {});
    }

    if (isDepositTerminal(dep.status)) {
        return ctx.answerCbQuery(
            `❌ Deposit sudah ${statusLabel(dep.status)}, tidak bisa dibatalkan`,
            { show_alert: true }
        ).catch(() => {});
    }

    const elapsed = Date.now() - Number(dep.created_at_ms || 0);
    if (elapsed < CANCEL_WAIT_MS) {
        const remainSec = Math.ceil((CANCEL_WAIT_MS - elapsed) / 1000);
        return ctx.answerCbQuery(
            `⏳ Tunggu ${remainSec} detik lagi sebelum bisa cancel.`,
            { show_alert: true }
        ).catch(() => {});
    }

    await ctx.answerCbQuery("⏳ Membatalkan deposit...").catch(() => {});

    try {
        if (!API_KEY) throw new Error("API_KEY belum diset");

        const res = await axios.get(
            `${BASE_URL}/deposit/cancel?apikey=${API_KEY}&id=${encodeURIComponent(depId)}`,
            { timeout: 15000 }
        );

        const result = processDepositStatus(depId, res.data || {});
        if (!result) {
            return ctx.answerCbQuery("❌ Deposit tidak ditemukan di DB", { show_alert: true }).catch(() => {});
        }

        if (result.isNewSuccess) {
            await notifyDepositSuccess(result.updated);
            await dmDepositSuccess(result.updated);
        }

        await showDepositScreen(ctx, result.updated);

        if (["batal", "cancel", "cancelled"].includes(result.newStatus)) {
            await ctx.answerCbQuery("✅ Deposit dibatalkan", { show_alert: true }).catch(() => {});
        } else if (result.newStatus === "success") {
            await ctx.answerCbQuery("✅ Deposit sudah terbayar, tidak bisa dibatalkan", { show_alert: true }).catch(() => {});
        } else {
            await ctx.answerCbQuery(`Status: ${statusLabel(result.newStatus)}`, { show_alert: true }).catch(() => {});
        }
    } catch (e) {
        console.error("cancel deposit error:", e.message);
        const msg = e.response?.data?.message || "Gagal cancel deposit";
        await ctx.answerCbQuery(`❌ ${msg}`, { show_alert: true }).catch(() => {});
    }
});

async function notifyDepositSuccess(dep) {
    if (!CHANNEL_NOTIF) return;
    const text = `
✅ <b>DEPOSIT SUCCESS</b>
━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID Deposit</b> : <code>${dep.id}</code>
🔖 <b>TRX ID</b>     : <code>${dep.trx_id || "-"}</code>
👤 <b>User</b>       : ${dep.user_name || "-"} (<code>${dep.user_id}</code>)
💰 <b>Nominal</b>    : Rp ${formatRupiah(dep.nominal)}
💵 <b>Total Bayar</b>: Rp ${formatRupiah(dep.total_bayar)}
📥 <b>Diterima</b>   : Rp ${formatRupiah(dep.total_diterima)}
⏱️ <b>Waktu</b>      : ${new Date().toLocaleString("id-ID")}

<i>Saldo user telah ditambahkan otomatis.</i>
`.trim();
    try {
        await bot.telegram.sendMessage(CHANNEL_NOTIF, text, { parse_mode: "HTML" });
        console.log(`🔔 [NOTIF] Success deposit ${dep.id} → ${CHANNEL_NOTIF}`);
    } catch (e) {
        console.error("notify deposit error:", e.message);
    }
}

async function dmDepositSuccess(dep) {
    const text = `
✅ <b>DEPOSIT BERHASIL!</b>
━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID</b>       : <code>${dep.id}</code>
💰 <b>Nominal</b>  : <b>Rp ${formatRupiah(dep.total_diterima || dep.nominal)}</b>

Saldo Anda sudah ditambahkan otomatis. Terima kasih! 🌸
`.trim();
    try {
        await bot.telegram.sendMessage(dep.user_id, text, { parse_mode: "HTML" });
    } catch (e) {
        // user might have blocked bot — ignore
    }
}

/* ============================
    == AUTO-CHECK WORKER (BG) ===
    ============================ */
let workerCursor = 0;
let workerRunning = false;

async function autoCancelOne(dep) {
    try {
        const res = await axios.get(
            `${BASE_URL}/deposit/cancel?apikey=${API_KEY}&id=${encodeURIComponent(dep.id)}`,
            { timeout: 8000 }
        );
        const result = processDepositStatus(dep.id, res.data || {});
        if (result && result.oldStatus !== result.newStatus) {
            console.log(`⏰ [WORKER] Auto-cancel ${dep.id}: ${result.oldStatus} → ${result.newStatus}`);
        }
        if (result?.isNewSuccess) {
            await notifyDepositSuccess(result.updated);
            await dmDepositSuccess(result.updated);
        }
        return true;
    } catch (e) {
        console.error(`[WORKER] auto-cancel ${dep.id} error:`, e.message);
        const ageMs = Date.now() - Number(dep.created_at_ms || 0);
        if (ageMs >= AUTO_CANCEL_AFTER_MS + 60 * 1000) {
            const result = processDepositStatus(dep.id, { ...dep, status: "expired" });
            if (result) {
                console.log(`⏰ [WORKER] ${dep.id} forced expired (cancel API failing)`);
            }
        }
        return false;
    }
}

async function autoCheckOne() {
    if (workerRunning) return;
    workerRunning = true;
    try {
        if (!API_KEY) return;

        const pending = getPendingDeposits();
        if (pending.length === 0) {
            workerCursor = 0;
            return;
        }

        if (workerCursor >= pending.length) workerCursor = 0;
        const dep = pending[workerCursor];
        workerCursor = (workerCursor + 1) % pending.length;

        const ageMs = Date.now() - Number(dep.created_at_ms || 0);

        if (ageMs >= AUTO_CANCEL_AFTER_MS) {
            await autoCancelOne(dep);
            return;
        }

        let apiData = null;
        try {
            const res = await axios.get(
                `${BASE_URL}/deposit/status?apikey=${API_KEY}&id=${encodeURIComponent(dep.id)}`,
                { timeout: 8000 }
            );
            apiData = res.data || {};
        } catch (apiErr) {
            if (dep.expires_at_ms && Date.now() > dep.expires_at_ms) {
                const result = processDepositStatus(dep.id, { ...dep, status: "expired" });
                if (result) {
                    console.log(`⏰ [WORKER] ${dep.id} → expired (fallback)`);
                }
            }
            return;
        }

        if (!apiData || !apiData.status) return;

        const result = processDepositStatus(dep.id, apiData);
        if (!result) return;

        if (result.oldStatus !== result.newStatus) {
            console.log(`🔄 [WORKER] ${dep.id}: ${result.oldStatus} → ${result.newStatus}`);
        }

        if (result.isNewSuccess) {
            await notifyDepositSuccess(result.updated);
            await dmDepositSuccess(result.updated);
        }
    } catch (e) {
        console.error("[WORKER] error:", e.message);
    } finally {
        workerRunning = false;
    }
}

function startAutoCheckWorker() {
    const loop = async () => {
        await autoCheckOne();
        setTimeout(loop, WORKER_INTERVAL_MS);
    };
    loop();
    console.log(`🔁 Auto-check worker aktif (interval ${WORKER_INTERVAL_MS}ms per deposit)`);
    console.log(`⏰ Auto-cancel pending > ${AUTO_CANCEL_AFTER_MS / 1000}s`);
}

/* ============================
    ====== PROFILE USER ========
    ============================ */
bot.action("profile", async (ctx) => {
    const isOwner = ctx.from.id === OWNER_ID;

    if (isOwner) {
        const stats = await getOwnerStats();
        const caption = `
👑 <b>PROFIL OWNER</b>
━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID</b>            : <code>${ctx.from.id}</code>
👤 <b>Nama</b>          : ${stats.apiName || ctx.from.first_name || "-"}
📧 <b>Email</b>         : ${stats.apiEmail}
👥 <b>Total User</b>    : ${stats.userCount} user
💰 <b>Saldo API</b>     : Rp ${formatRupiah(stats.apiBalance)}
💼 <b>Saldo User</b>    : Rp ${formatRupiah(stats.totalUserSaldo)}
📊 <b>Available</b>     : <b>Rp ${formatRupiah(stats.available)}</b>
`.trim();

        const options = {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback("🔄 Refresh", "profile")],
                [Markup.button.callback("🏠 Menu Utama", "start")]
            ]).reply_markup
        };
        await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    } else {
        const db = loadDB();
        const user = db[String(ctx.from.id)] || {};
        const saldo = Number(user.saldo || 0);
        const pending = getUserPendingDeposit(ctx.from.id);

        const pendingInfo = pending
            ? `\n⏳ <b>Deposit Aktif</b> : <code>${pending.id}</code>`
            : "";

        const caption = `
👤 <b>PROFIL USER</b>
━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID</b>        : <code>${ctx.from.id}</code>
🎀 <b>Nama</b>      : ${ctx.from.first_name || "-"}
💰 <b>Saldo</b>     : <b>Rp ${formatRupiah(saldo)}</b>
📅 <b>Terdaftar</b> : ${user.created_at ? new Date(user.created_at).toLocaleDateString("id-ID") : "-"}${pendingInfo}
`.trim();

        const buttons = [];
        if (pending) {
            buttons.push([Markup.button.callback("📄 Lihat Deposit Aktif", `dep_view_${pending.id}`)]);
        }
        buttons.push([Markup.button.callback("💰 Top Up", "topup")]);
        buttons.push([Markup.button.callback("🔄 Refresh", "profile")]);
        buttons.push([Markup.button.callback("🏠 Menu Utama", "start")]);

        const options = {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        };
        await editOrSendMessage(ctx, caption, options, LOGO_PATH);
    }

    await ctx.answerCbQuery().catch(() => {});
});

/* ============================
    ==== CHECK JOIN CALLBACK ====
    ============================ */
bot.action("check_join", async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        registerUser(ctx.from.id, ctx.from.first_name || "", ctx.from.username || "");
    }

    const unjoined = await getUnjoinedChannels(ctx);

    if (unjoined.length > 0) {
        await ctx.answerCbQuery("❌ Anda masih belum bergabung ke semua channel!", { show_alert: true }).catch(() => {});
        await editToJoinMessage(ctx, unjoined);
        return;
    }

    await ctx.answerCbQuery("✅ Verifikasi berhasil!").catch(() => {});
    const { caption, options } = await createMainMenu(ctx.from.id, ctx.from.first_name);
    await editOrSendMessage(ctx, caption, options, LOGO_PATH);
});

/* ============================
    ========== START ============
    ============================ */
bot.start(async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        registerUser(ctx.from.id, ctx.from.first_name || "", ctx.from.username || "");
    }
    const { caption, options } = await createMainMenu(ctx.from.id, ctx.from.first_name);

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
    clearTopupAmount(ctx.from.id);
    const { caption, options } = await createMainMenu(ctx.from.id, ctx.from.first_name);
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
    console.log(`📸 Logo          : ${fs.existsSync(LOGO_PATH) ? "✅ Ada" : "⚠️  Tidak ditemukan"}`);
    console.log(`📢 Channel Utama : ${CHANNEL_USERNAME}`);
    console.log(`🔔 Channel Notif : ${CHANNEL_NOTIF}`);
    console.log(`👑 Owner ID      : ${OWNER_ID}`);
    console.log(`🔑 API Key       : ${API_KEY ? "✅ Set" : "❌ Belum diset"}`);
    console.log(`🌐 Base URL      : ${BASE_URL}`);
    console.log(`🖥️ Server ID     : ${SERVER_ID}`);
    console.log(`⚙️  Operator      : ${OPERATOR}`);
    console.log(`💵 Markup        : Rp ${MARKUP_HARGA.toLocaleString("id-ID")}`);
    console.log(`💰 Min Top Up    : Rp ${MIN_TOPUP.toLocaleString("id-ID")}`);
    console.log(`⏱️  Cancel Wait   : ${CANCEL_WAIT_MS / 1000} detik (manual)`);
    console.log(`⏰ Auto-Cancel   : ${AUTO_CANCEL_AFTER_MS / 1000} detik (sistem)`);
    console.log(`🚫 Max Pending   : ${MAX_PENDING_DEPOSITS} deposit (global)`);
    console.log(`👤 Per User      : 1 deposit aktif`);
    console.log(`🔁 Worker        : tiap ${WORKER_INTERVAL_MS}ms (round-robin)`);
    console.log(`📁 Database      : ${path.resolve(DB_PATH)}`);
    console.log(`📁 Deposits      : ${path.resolve(DEPOSIT_PATH)}`);

    ensureDBDir();
    loadDB();
    loadDeposits();
    console.log(`✅ Database siap`);

    await verifyBotIsAdmin();

    bot.launch();
    console.log("🚀 Bot BERJALAN...\n");

    startAutoCheckWorker();
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

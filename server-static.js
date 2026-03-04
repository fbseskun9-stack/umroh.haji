// Static Server untuk Vercel/Netlify
// Hanya untuk serving HTML files + Bot API notifications

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// CONFIGURATION
const BOT_TOKEN = '8674470639:AAE7GidUqbbPUYiqNBHawJA3ZWlIh25-_T4';
const ADMIN_CHAT_ID = '1323510267';

// Simpan data user
const users = new Map();

function formatPhone(phone) {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '62' + p.substring(1);
    else if (p.startsWith('8')) p = '62' + p;
    return '+' + p;
}

// API: Submit Registration
app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, address } = req.body;
        
        if (!name || !phone) {
            return res.json({ success: false, error: 'Data tidak lengkap' });
        }
        
        const formattedPhone = formatPhone(phone);
        
        // Simpan data user
        users.set(formattedPhone, {
            name,
            address,
            registeredAt: new Date().toISOString()
        });
        
        // Kirim notifikasi ke admin via Bot API
        const message = `🔔 *Pendaftaran Baru Haji & Umrah*

👤 *Nama:* ${name}
📱 *Nomor Telegram:* ${formattedPhone}
📍 *Alamat:* ${address || 'Tidak diisi'}
⏰ *Waktu:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        
        res.json({ success: true, message: 'Pendaftaran berhasil!' });
        
    } catch (e) {
        console.error('Error:', e);
        res.json({ success: false, error: e.message });
    }
});

// API: Check Status
app.get('/api/status', (req, res) => {
    res.json({ 
        usersCount: users.size,
        status: 'Active'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});

module.exports = app;

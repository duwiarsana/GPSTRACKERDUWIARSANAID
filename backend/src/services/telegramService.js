const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return token;
}

async function sendMessage(chatId, text, options = {}) {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: true,
  };

  const timeoutMs = Number(options.timeoutMs ?? 10000);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const errText = data?.description || `HTTP ${res.status}`;
      throw new Error(`Telegram sendMessage failed: ${errText}`);
    }
    return data.result;
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Telegram sendMessage failed: timeout');
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { sendMessage };

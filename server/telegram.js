const API = 'https://api.telegram.org';

const token = () => process.env.TELEGRAM_BOT_TOKEN;

let botUsername = null;

async function call(method, body, timeoutMs = 10_000) {
  const res = await fetch(`${API}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method}: ошибка ${res.status}`);
  return data.result;
}

export function botStatus() {
  return { configured: Boolean(token()), username: botUsername };
}

export async function sendSurveyLink({ chatId, name, url }) {
  if (!token()) return { sent: false, reason: 'Бот не настроен (нет TELEGRAM_BOT_TOKEN)' };
  if (!chatId) return { sent: false, reason: 'Новичок не подключил бота' };

  // Telegram rejects inline URL buttons pointing to localhost, so local links go as plain text.
  const isLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url);
  const firstName = name.split(' ')[1] || name;
  const text = [
    `${firstName}, здравствуйте!`,
    'Расскажите, как проходят первые дни на новом месте. Это 4 вопроса и меньше минуты.',
    isLocal ? `\nОпрос: ${url}` : '',
  ].join('\n');

  const body = { chat_id: chatId, text };
  if (!isLocal) body.reply_markup = { inline_keyboard: [[{ text: 'Пройти опрос', url }]] };

  try {
    await call('sendMessage', body);
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: `Telegram: ${err.message}` };
  }
}

const SHARE_PHONE_KEYBOARD = {
  keyboard: [[{ text: 'Поделиться номером', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

function reply(chatId, text, replyMarkup) {
  return call('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup }).catch((err) =>
    console.error('Telegram: не удалось ответить:', err.message),
  );
}

function replyFor(message, onContact) {
  const chatId = message.chat.id;

  if (message.contact) {
    // request_contact sends the user's own verified number; a forwarded contact has someone else's user_id.
    if (message.contact.user_id !== message.from.id) {
      return reply(chatId, 'Отправьте, пожалуйста, свой номер кнопкой ниже.', SHARE_PHONE_KEYBOARD);
    }
    const employees = onContact(message.contact.phone_number, chatId);
    if (employees.length === 0) {
      return reply(
        chatId,
        'Не нашли этот номер среди новых сотрудников. Проверьте, что в отделе кадров указан именно он, или обратитесь в HR.',
        SHARE_PHONE_KEYBOARD,
      );
    }
    const firstName = employees[0].name.split(' ')[1] || employees[0].name;
    return reply(
      chatId,
      [
        `${firstName}, добро пожаловать в «СпортОпт»!`,
        '',
        'Бот подключён. В первые три месяца сюда будут приходить короткие опросы о том, как у вас дела.',
        'Если что-то не так, руководитель свяжется с вами в течение двух рабочих дней.',
      ].join('\n'),
      { remove_keyboard: true },
    );
  }

  if (message.text?.startsWith('/start')) {
    return reply(
      chatId,
      'Здравствуйте! Это бот для новых сотрудников «СпортОпт».\n\nЧтобы бот вас узнал, нажмите кнопку «Поделиться номером» ниже. Номер сверяется с данными отдела кадров.',
      SHARE_PHONE_KEYBOARD,
    );
  }

  return reply(chatId, 'Опросы будут приходить сюда. Если вы ещё не подключились, нажмите /start.');
}

// Long polling: works without a public URL. Only one server instance may poll a given bot.
export async function startBot({ onContact }) {
  if (!token()) {
    console.log('Telegram: TELEGRAM_BOT_TOKEN не задан, бот выключен');
    return;
  }

  try {
    const me = await call('getMe');
    botUsername = me.username;
    await call('deleteWebhook');
    console.log(`Telegram: бот @${botUsername} запущен`);
  } catch (err) {
    console.error('Telegram: не удалось запустить бота:', err.message);
    return;
  }

  let offset = 0;
  while (true) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35_000);
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await replyFor(update.message, onContact);
      }
    } catch (err) {
      console.error('Telegram: ошибка getUpdates:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

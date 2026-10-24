# ⏳ Claude Limit Timer

[English](#english) · [Русский](#русский)

---

## English

A mod for Claude Code that keeps the 5-hour usage limit in view:

- **Status line under the prompt:** `⏳ 5h limit: 44% · resets in 2h 13m · week 13%`, refreshed every 30 seconds.
- **⏰ One hour before the reset:** a toast and a system notification, once per window.
- **✅ When the limit resets:** a toast and a notification that you are back at full speed.

The figures come from Claude Code itself (the rate-limit windows each response reports). No unofficial requests are made.

### Install

At the prompt of a Claude Code terminal session, type:

```
/plugin install limit-timer --marketplace sedochenkos/claude-limit-timer
```

Answer `y` to add the marketplace, then press Enter to pick the user scope. Run `/reload-plugins` (or start a new session). The mod also loads in the Code tab of the Claude desktop app.

**Requirements:** Claude Code signed in with a Claude subscription (Pro or Max). With API-key billing Claude reports no 5-hour window, so the mod only shows a hint.

### Language

`auto` (default) follows your system locale: Russian for `ru_*`, English otherwise. To force one, set **Language** to `ru` or `en` on the settings screen shown during install (it can be changed later in the plugin's settings).

### Browser version (claude.ai)

`userscript/claude-limit-timer.user.js` is a Tampermonkey script for claude.ai in the browser: the same badge in the bottom-right corner and the same notifications, in the browser's language. It reads an internal claude.ai endpoint, so a site update may break it; the badge then shows «⚠️ No limit data».

### Development

```
claude plugin validate .
claude plugin test .
```

`WARN_MS` (how early to remind) and `TICK_MS` (refresh interval) sit at the top of `hooks/register.ts`.

---

## Русский

Мод для Claude Code, который держит 5-часовой лимит на виду:

- **Строка состояния под полем ввода:** `⏳ Лимит 5ч: 44% · сброс через 2ч 13м · неделя 13%`, обновляется каждые 30 секунд.
- **⏰ За час до сброса:** всплывающее сообщение и системное уведомление, один раз на окно.
- **✅ Когда лимит сбросился:** сообщение и уведомление, что можно снова работать на полную.

Цифры берутся из самого Claude Code (окна лимитов, которые сообщает каждый ответ). Никаких неофициальных запросов.

### Установка

В поле ввода сессии Claude Code в терминале введи:

```
/plugin install limit-timer --marketplace sedochenkos/claude-limit-timer
```

Ответь `y` на добавление маркетплейса, затем Enter для области «user». Выполни `/reload-plugins` (или открой новую сессию). Мод работает и во вкладке Code десктоп-приложения Claude.

**Требования:** вход в Claude Code через подписку Claude (Pro или Max). При оплате через API-ключ Claude не сообщает 5-часовое окно, и мод покажет только подсказку.

### Язык

`auto` (по умолчанию) берёт язык системы: русский для `ru_*`, иначе английский. Чтобы выбрать вручную, укажи **Language** = `ru` или `en` на экране настроек при установке (потом это меняется в настройках плагина).

### Версия для браузера (claude.ai)

`userscript/claude-limit-timer.user.js` — скрипт для Tampermonkey: такая же плашка в правом нижнем углу claude.ai и те же уведомления, на языке браузера. Он опирается на внутренний запрос claude.ai, поэтому после обновлений сайта может сломаться — тогда на плашке появится «⚠️ Нет данных о лимите».

---

## License

[MIT](LICENSE) © 2026 Sergey Sedochenko

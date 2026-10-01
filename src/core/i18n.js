/*
 * OLX Smart Helper — localization.
 *
 * Loaded in every context (content script, popup, options page).
 *
 * Two languages are in play at once:
 *   - UI language: what the user reads. "auto" follows the OLX domain
 *     (olx.ro → ro, olx.pl → pl, olx.ua → uk, olx.bg → bg, others → ru) or a
 *     language the user locked in the popup / options page.
 *   - Seller language: always the domain's language. A message sent to a
 *     Romanian seller is Romanian even if the user reads the UI in Russian.
 *
 * The preference lives in `olxsh_flags.locale` ("auto" | locale code), so it
 * travels with the existing JSON backup. The content script also records
 * `olxsh_flags.domainLocale` so extension pages (which have no OLX hostname)
 * can follow the last visited OLX domain in auto mode.
 */
(function () {
  "use strict";

  const H = (window.OLXHelper = window.OLXHelper || {});

  const FLAGS_KEY = "olxsh_flags";
  const LOCALES = ["ro", "pl", "uk", "bg", "ru"];
  const FALLBACK = "ru";
  const NATIVE_NAMES = { ro: "Română", pl: "Polski", uk: "Українська", bg: "Български", ru: "Русский" };
  const ALIASES = { ua: "uk" };
  const TLD_TO_LOCALE = { ro: "ro", pl: "pl", ua: "uk", bg: "bg" };

  /* ---------- dictionaries ---------- */

  const DICT = {
    ru: {
      "common.version": "Версия",
      "common.storageUnavailable": "Хранилище недоступно.",
      "common.copyFailed": "Не удалось скопировать",
      "common.close": "Закрыть",
      "common.cancel": "Отмена",
      "common.save": "Сохранить",
      "common.delete": "Удалить",
      "common.undo": "Вернуть",
      "common.untitled": "Объявление",

      "lang.title": "Язык интерфейса",
      "lang.auto": "Авто (по домену OLX)",
      "lang.autoHint": "Авто: olx.ro → Română, olx.pl → Polski, olx.ua → Українська, olx.bg → Български, остальные → Русский.",
      "lang.current": "Сейчас: {lang}",
      "lang.sellerNote": "Сообщения продавцу всегда пишутся на языке сайта OLX.",

      "verdict.good": "Выгодная цена",
      "verdict.good.short": "Выгодно",
      "verdict.fair": "Рыночная цена",
      "verdict.fair.short": "Рынок",
      "verdict.high": "Цена завышена",
      "verdict.high.short": "Выше рынка",
      "verdict.unknown": "Мало данных",
      "verdict.unknown.short": "Мало данных",
      "confidence.aria": "Уверенность: {level}/3",

      "reason.delta": "{pct} к медиане (похожих: {n})",
      "reason.suspicious": "Подозрительно низкая цена — проверьте продавца",
      "reason.negotiable": "Продавец готов торговаться",
      "reason.free": "Отдают бесплатно",
      "reason.exchange": "Только обмен",
      "reason.noprice": "Цена не найдена",
      "reason.few": "Мало похожих (найдено: {n})",
      "reason.none": "Нет похожих на странице",

      "pill.median": "Медиана: {price} (похожих: {n})",
      "pill.thisPrice": "Эта цена: {price} ({pct})",
      "pill.noData": "Недостаточно похожих объявлений на странице",
      "pill.suspicious": "⚠ Подозрительно низкая цена",

      "w.settings": "Настройки",
      "w.collapse": "Свернуть / развернуть",
      "w.price": "Цена объявления",
      "w.price.free": "Бесплатно",
      "w.price.exchange": "Обмен",
      "w.price.none": "Цена не найдена",
      "w.tag.negotiable": "торг",
      "w.tag.source": "источник: {src}",
      "w.src.dom": "страница",
      "w.src.jsonld": "schema.org",
      "w.src.meta": "meta-теги",
      "w.src.heuristic": "эвристика",
      "w.gauge.cheaper": "дешевле",
      "w.gauge.median": "медиана",
      "w.gauge.pricier": "дороже",
      "w.stat.median": "Медиана",
      "w.stat.delta": "Разница",
      "w.stat.comps": "Похожих",
      "w.range": "Типичный диапазон: {from} – {to}",
      "w.empty": "Мало похожих на странице для оценки. Нажмите «{action}» — в выдаче цены будут размечены.",
      "w.signal.drop": "↓ Цена снижена",
      "w.signal.rise": "↑ Цена выросла",
      "w.signal.was": "было {price}",
      "w.signal.new": "Впервые видите",
      "w.signal.relist": "Возможно, перевыставлено",
      "w.offer.title": "Быстрый торг",
      "w.offer.less": "Уменьшить",
      "w.offer.more": "Увеличить",
      "w.offer.copy": "Копировать",
      "w.action.similar": "Найти такие же",
      "w.action.presets": "Шаблоны",
      "w.action.copyDefault": "Скопировать шаблон по умолчанию",
      "w.comps": "Похожие на странице · {n}",
      "w.meta.statusAria": "Статус общения с продавцом",
      "w.meta.save": "Сохранить",
      "w.meta.saved": "В списке",
      "w.meta.note": "Заметка по объявлению…",

      "status.not_contacted": "Не связывался",
      "status.contacted": "Написал",
      "status.replied": "Ответил",
      "status.ignored": "Игнор",

      "presets.title": "Шаблоны сообщений",
      "presets.new": "Новый шаблон",
      "presets.default": "По умолчанию",
      "presets.copy": "Скопировать",
      "presets.isDefault": "Шаблон по умолчанию",
      "presets.makeDefault": "Сделать по умолчанию",
      "presets.edit": "Редактировать",
      "presets.empty": "Пока нет шаблонов",
      "presets.emptyHint": "Добавьте первый — он появится в кнопке «Шаблоны» на объявлениях.",
      "presets.name": "Название",
      "presets.text": "Текст сообщения",
      "presets.add": "Добавить",
      "presets.drag": "Перетащите, чтобы изменить порядок",
      "presets.hint": "Перетаскивайте за ⠿, чтобы изменить порядок. ★ — шаблон для кнопки ⚡ на объявлении.",
      "presets.deleted": "Шаблон «{label}» удалён",
      "presets.untitled": "Без названия",

      "toast.copied": "Скопировано: {label}",
      "toast.noDefault": "Нет шаблона по умолчанию",
      "toast.offerCopied": "Предложение скопировано — вставьте в чат продавцу",

      "opt.docTitle": "OLX Smart Helper — настройки",
      "opt.tagline": "Рыночная оценка цен прямо на OLX",
      "opt.tab.general": "Общие",
      "opt.tab.presets": "Шаблоны",
      "opt.tab.saved": "Сохранённое",
      "opt.tab.backup": "Резервная копия",
      "opt.tab.debug": "Отладка",

      "saved.title": "Сохранённые объявления",
      "saved.empty": "Пока пусто. На странице объявления нажмите «{save}» — объявление появится здесь с ценой, статусом и датой.",
      "saved.on": "сохранено {date}",
      "saved.remove": "Убрать",
      "saved.csv": "Экспорт в CSV",
      "saved.csvEmpty": "Список пуст — нечего экспортировать.",
      "saved.csvDone": "Экспортировано объявлений: {n}.",

      "backup.title": "Резервная копия",
      "backup.desc": "Шаблоны, заметки, статусы, сохранённое и настройки — в одном JSON-файле.",
      "backup.export": "Экспорт (JSON)",
      "backup.import": "Импорт (объединить)",
      "backup.replace": "Заменить всё",
      "backup.hint": "«Заменить всё» перезапишет все текущие данные — это необратимо.",
      "backup.exported": "Экспортировано.",
      "backup.confirmReplace":
        "Заменить ВСЕ данные содержимым файла?\n\nТекущие шаблоны, заметки, статусы, список и настройки будут удалены без возможности восстановления.",
      "backup.badJson": "Файл повреждён или не является JSON.",
      "backup.badFormat": "Неверный формат файла (ожидается резервная копия OLX Smart Helper).",
      "backup.imported": "Импортировано — шаблонов: {p}, объявлений: {l}.",
      "backup.replaced": "Заменено — шаблонов: {p}, объявлений: {l}.",
      "backup.error": "Ошибка импорта: {msg}",
      "backup.readError": "Не удалось прочитать файл.",

      "debug.title": "Отладка",
      "debug.toggle": "Собирать диагностику извлечения",
      "debug.toggleHint": "Пишет события в консоль страницы и в журнал ниже (последние 20).",
      "debug.events": "События",
      "debug.copy": "Скопировать",
      "debug.refresh": "Обновить",
      "debug.clear": "Очистить",
      "debug.empty": "Нет событий. Включите режим и обновите страницу OLX.",
      "debug.on": "Отладка включена — откройте или обновите страницу OLX.",
      "debug.off": "Отладка выключена.",
      "debug.copied": "Диагностика скопирована в буфер.",
      "debug.diagTitle": "OLX Smart Helper — диагностика",
      "debug.diagDate": "Дата",
      "debug.diagCount": "Событий",
      "debug.diagNone": "(нет событий)",

      "popup.allSettings": "Все настройки",
      "popup.add": "Добавить шаблон",
      "popup.text": "Текст",

      "nego.greet": "Здравствуйте! Интересует «{title}».",
      "nego.market": "Похожие предложения сейчас в среднем по {market}.",
      "nego.offer": "Отдадите за {offer}? Могу быстро забрать.",
    },

    uk: {
      "common.version": "Версія",
      "common.storageUnavailable": "Сховище недоступне.",
      "common.copyFailed": "Не вдалося скопіювати",
      "common.close": "Закрити",
      "common.cancel": "Скасувати",
      "common.save": "Зберегти",
      "common.delete": "Видалити",
      "common.undo": "Повернути",
      "common.untitled": "Оголошення",

      "lang.title": "Мова інтерфейсу",
      "lang.auto": "Авто (за доменом OLX)",
      "lang.autoHint": "Авто: olx.ro → Română, olx.pl → Polski, olx.ua → Українська, olx.bg → Български, інші → Русский.",
      "lang.current": "Зараз: {lang}",
      "lang.sellerNote": "Повідомлення продавцю завжди пишуться мовою сайту OLX.",

      "verdict.good": "Вигідна ціна",
      "verdict.good.short": "Вигідно",
      "verdict.fair": "Ринкова ціна",
      "verdict.fair.short": "Ринок",
      "verdict.high": "Ціна завищена",
      "verdict.high.short": "Вище ринку",
      "verdict.unknown": "Мало даних",
      "verdict.unknown.short": "Мало даних",
      "confidence.aria": "Впевненість: {level}/3",

      "reason.delta": "{pct} до медіани (схожих: {n})",
      "reason.suspicious": "Підозріло низька ціна — перевірте продавця",
      "reason.negotiable": "Продавець готовий торгуватися",
      "reason.free": "Віддають безкоштовно",
      "reason.exchange": "Лише обмін",
      "reason.noprice": "Ціну не знайдено",
      "reason.few": "Мало схожих (знайдено: {n})",
      "reason.none": "Немає схожих на сторінці",

      "pill.median": "Медіана: {price} (схожих: {n})",
      "pill.thisPrice": "Ця ціна: {price} ({pct})",
      "pill.noData": "Недостатньо схожих оголошень на сторінці",
      "pill.suspicious": "⚠ Підозріло низька ціна",

      "w.settings": "Налаштування",
      "w.collapse": "Згорнути / розгорнути",
      "w.price": "Ціна оголошення",
      "w.price.free": "Безкоштовно",
      "w.price.exchange": "Обмін",
      "w.price.none": "Ціну не знайдено",
      "w.tag.negotiable": "торг",
      "w.tag.source": "джерело: {src}",
      "w.src.dom": "сторінка",
      "w.src.jsonld": "schema.org",
      "w.src.meta": "meta-теги",
      "w.src.heuristic": "евристика",
      "w.gauge.cheaper": "дешевше",
      "w.gauge.median": "медіана",
      "w.gauge.pricier": "дорожче",
      "w.stat.median": "Медіана",
      "w.stat.delta": "Різниця",
      "w.stat.comps": "Схожих",
      "w.range": "Типовий діапазон: {from} – {to}",
      "w.empty": "Замало схожих на сторінці для оцінки. Натисніть «{action}» — у видачі ціни буде позначено.",
      "w.signal.drop": "↓ Ціну знижено",
      "w.signal.rise": "↑ Ціна зросла",
      "w.signal.was": "було {price}",
      "w.signal.new": "Бачите вперше",
      "w.signal.relist": "Можливо, перевиставлено",
      "w.offer.title": "Швидкий торг",
      "w.offer.less": "Зменшити",
      "w.offer.more": "Збільшити",
      "w.offer.copy": "Копіювати",
      "w.action.similar": "Знайти такі ж",
      "w.action.presets": "Шаблони",
      "w.action.copyDefault": "Скопіювати шаблон за замовчуванням",
      "w.comps": "Схожі на сторінці · {n}",
      "w.meta.statusAria": "Статус спілкування з продавцем",
      "w.meta.save": "Зберегти",
      "w.meta.saved": "У списку",
      "w.meta.note": "Нотатка до оголошення…",

      "status.not_contacted": "Не зв’язувався",
      "status.contacted": "Написав",
      "status.replied": "Відповів",
      "status.ignored": "Ігнор",

      "presets.title": "Шаблони повідомлень",
      "presets.new": "Новий шаблон",
      "presets.default": "За замовчуванням",
      "presets.copy": "Скопіювати",
      "presets.isDefault": "Шаблон за замовчуванням",
      "presets.makeDefault": "Зробити за замовчуванням",
      "presets.edit": "Редагувати",
      "presets.empty": "Шаблонів поки немає",
      "presets.emptyHint": "Додайте перший — він з’явиться в кнопці «Шаблони» на оголошеннях.",
      "presets.name": "Назва",
      "presets.text": "Текст повідомлення",
      "presets.add": "Додати",
      "presets.drag": "Перетягніть, щоб змінити порядок",
      "presets.hint": "Перетягуйте за ⠿, щоб змінити порядок. ★ — шаблон для кнопки ⚡ на оголошенні.",
      "presets.deleted": "Шаблон «{label}» видалено",
      "presets.untitled": "Без назви",

      "toast.copied": "Скопійовано: {label}",
      "toast.noDefault": "Немає шаблону за замовчуванням",
      "toast.offerCopied": "Пропозицію скопійовано — вставте в чат продавцю",

      "opt.docTitle": "OLX Smart Helper — налаштування",
      "opt.tagline": "Ринкова оцінка цін просто на OLX",
      "opt.tab.general": "Загальні",
      "opt.tab.presets": "Шаблони",
      "opt.tab.saved": "Збережене",
      "opt.tab.backup": "Резервна копія",
      "opt.tab.debug": "Налагодження",

      "saved.title": "Збережені оголошення",
      "saved.empty": "Поки порожньо. На сторінці оголошення натисніть «{save}» — оголошення з’явиться тут із ціною, статусом і датою.",
      "saved.on": "збережено {date}",
      "saved.remove": "Прибрати",
      "saved.csv": "Експорт у CSV",
      "saved.csvEmpty": "Список порожній — нічого експортувати.",
      "saved.csvDone": "Експортовано оголошень: {n}.",

      "backup.title": "Резервна копія",
      "backup.desc": "Шаблони, нотатки, статуси, збережене та налаштування — в одному JSON-файлі.",
      "backup.export": "Експорт (JSON)",
      "backup.import": "Імпорт (об’єднати)",
      "backup.replace": "Замінити все",
      "backup.hint": "«Замінити все» перезапише всі поточні дані — це незворотно.",
      "backup.exported": "Експортовано.",
      "backup.confirmReplace":
        "Замінити ВСІ дані вмістом файлу?\n\nПоточні шаблони, нотатки, статуси, список і налаштування буде видалено без можливості відновлення.",
      "backup.badJson": "Файл пошкоджено або це не JSON.",
      "backup.badFormat": "Невірний формат файлу (очікується резервна копія OLX Smart Helper).",
      "backup.imported": "Імпортовано — шаблонів: {p}, оголошень: {l}.",
      "backup.replaced": "Замінено — шаблонів: {p}, оголошень: {l}.",
      "backup.error": "Помилка імпорту: {msg}",
      "backup.readError": "Не вдалося прочитати файл.",

      "debug.title": "Налагодження",
      "debug.toggle": "Збирати діагностику витягування даних",
      "debug.toggleHint": "Пише події в консоль сторінки та в журнал нижче (останні 20).",
      "debug.events": "Події",
      "debug.copy": "Скопіювати",
      "debug.refresh": "Оновити",
      "debug.clear": "Очистити",
      "debug.empty": "Подій немає. Увімкніть режим і оновіть сторінку OLX.",
      "debug.on": "Налагодження увімкнено — відкрийте або оновіть сторінку OLX.",
      "debug.off": "Налагодження вимкнено.",
      "debug.copied": "Діагностику скопійовано в буфер.",
      "debug.diagTitle": "OLX Smart Helper — діагностика",
      "debug.diagDate": "Дата",
      "debug.diagCount": "Подій",
      "debug.diagNone": "(подій немає)",

      "popup.allSettings": "Усі налаштування",
      "popup.add": "Додати шаблон",
      "popup.text": "Текст",

      "nego.greet": "Добрий день! Цікавить «{title}».",
      "nego.market": "Схожі пропозиції зараз в середньому по {market}.",
      "nego.offer": "Чи віддасте за {offer}? Можу швидко забрати.",
    },

    pl: {
      "common.version": "Wersja",
      "common.storageUnavailable": "Pamięć niedostępna.",
      "common.copyFailed": "Nie udało się skopiować",
      "common.close": "Zamknij",
      "common.cancel": "Anuluj",
      "common.save": "Zapisz",
      "common.delete": "Usuń",
      "common.undo": "Cofnij",
      "common.untitled": "Ogłoszenie",

      "lang.title": "Język interfejsu",
      "lang.auto": "Auto (wg domeny OLX)",
      "lang.autoHint": "Auto: olx.ro → Română, olx.pl → Polski, olx.ua → Українська, olx.bg → Български, pozostałe → Русский.",
      "lang.current": "Teraz: {lang}",
      "lang.sellerNote": "Wiadomości do sprzedającego są zawsze w języku serwisu OLX.",

      "verdict.good": "Okazyjna cena",
      "verdict.good.short": "Okazja",
      "verdict.fair": "Cena rynkowa",
      "verdict.fair.short": "Rynkowa",
      "verdict.high": "Cena zawyżona",
      "verdict.high.short": "Powyżej rynku",
      "verdict.unknown": "Za mało danych",
      "verdict.unknown.short": "Mało danych",
      "confidence.aria": "Pewność: {level}/3",

      "reason.delta": "{pct} względem mediany (podobnych: {n})",
      "reason.suspicious": "Podejrzanie niska cena — sprawdź sprzedającego",
      "reason.negotiable": "Sprzedający jest otwarty na negocjacje",
      "reason.free": "Za darmo",
      "reason.exchange": "Tylko zamiana",
      "reason.noprice": "Nie znaleziono ceny",
      "reason.few": "Mało podobnych (znaleziono: {n})",
      "reason.none": "Brak podobnych na stronie",

      "pill.median": "Mediana: {price} (podobnych: {n})",
      "pill.thisPrice": "Ta cena: {price} ({pct})",
      "pill.noData": "Za mało podobnych ogłoszeń na stronie",
      "pill.suspicious": "⚠ Podejrzanie niska cena",

      "w.settings": "Ustawienia",
      "w.collapse": "Zwiń / rozwiń",
      "w.price": "Cena ogłoszenia",
      "w.price.free": "Za darmo",
      "w.price.exchange": "Zamiana",
      "w.price.none": "Nie znaleziono ceny",
      "w.tag.negotiable": "do negocjacji",
      "w.tag.source": "źródło: {src}",
      "w.src.dom": "strona",
      "w.src.jsonld": "schema.org",
      "w.src.meta": "tagi meta",
      "w.src.heuristic": "heurystyka",
      "w.gauge.cheaper": "taniej",
      "w.gauge.median": "mediana",
      "w.gauge.pricier": "drożej",
      "w.stat.median": "Mediana",
      "w.stat.delta": "Różnica",
      "w.stat.comps": "Podobnych",
      "w.range": "Typowy zakres: {from} – {to}",
      "w.empty": "Za mało podobnych ogłoszeń na stronie, by ocenić cenę. Kliknij „{action}” — w wynikach ceny zostaną oznaczone.",
      "w.signal.drop": "↓ Cena obniżona",
      "w.signal.rise": "↑ Cena wzrosła",
      "w.signal.was": "było {price}",
      "w.signal.new": "Widzisz pierwszy raz",
      "w.signal.relist": "Możliwe ponowne wystawienie",
      "w.offer.title": "Szybka negocjacja",
      "w.offer.less": "Zmniejsz",
      "w.offer.more": "Zwiększ",
      "w.offer.copy": "Kopiuj",
      "w.action.similar": "Znajdź takie same",
      "w.action.presets": "Szablony",
      "w.action.copyDefault": "Kopiuj domyślny szablon",
      "w.comps": "Podobne na stronie · {n}",
      "w.meta.statusAria": "Status kontaktu ze sprzedającym",
      "w.meta.save": "Zapisz",
      "w.meta.saved": "Na liście",
      "w.meta.note": "Notatka do ogłoszenia…",

      "status.not_contacted": "Bez kontaktu",
      "status.contacted": "Napisano",
      "status.replied": "Jest odpowiedź",
      "status.ignored": "Pominięte",

      "presets.title": "Szablony wiadomości",
      "presets.new": "Nowy szablon",
      "presets.default": "Domyślny",
      "presets.copy": "Kopiuj",
      "presets.isDefault": "Szablon domyślny",
      "presets.makeDefault": "Ustaw jako domyślny",
      "presets.edit": "Edytuj",
      "presets.empty": "Brak szablonów",
      "presets.emptyHint": "Dodaj pierwszy — pojawi się pod przyciskiem „Szablony” w ogłoszeniach.",
      "presets.name": "Nazwa",
      "presets.text": "Treść wiadomości",
      "presets.add": "Dodaj",
      "presets.drag": "Przeciągnij, aby zmienić kolejność",
      "presets.hint": "Przeciągaj za ⠿, aby zmienić kolejność. ★ — szablon dla przycisku ⚡ w ogłoszeniu.",
      "presets.deleted": "Usunięto szablon „{label}”",
      "presets.untitled": "Bez nazwy",

      "toast.copied": "Skopiowano: {label}",
      "toast.noDefault": "Brak domyślnego szablonu",
      "toast.offerCopied": "Oferta skopiowana — wklej ją na czacie ze sprzedającym",

      "opt.docTitle": "OLX Smart Helper — ustawienia",
      "opt.tagline": "Rynkowa ocena cen bezpośrednio na OLX",
      "opt.tab.general": "Ogólne",
      "opt.tab.presets": "Szablony",
      "opt.tab.saved": "Zapisane",
      "opt.tab.backup": "Kopia zapasowa",
      "opt.tab.debug": "Debugowanie",

      "saved.title": "Zapisane ogłoszenia",
      "saved.empty": "Na razie pusto. Na stronie ogłoszenia kliknij „{save}” — pojawi się tutaj z ceną, statusem i datą.",
      "saved.on": "zapisano {date}",
      "saved.remove": "Usuń",
      "saved.csv": "Eksport do CSV",
      "saved.csvEmpty": "Lista jest pusta — nie ma czego eksportować.",
      "saved.csvDone": "Wyeksportowano ogłoszeń: {n}.",

      "backup.title": "Kopia zapasowa",
      "backup.desc": "Szablony, notatki, statusy, zapisane ogłoszenia i ustawienia — w jednym pliku JSON.",
      "backup.export": "Eksport (JSON)",
      "backup.import": "Import (scal)",
      "backup.replace": "Zastąp wszystko",
      "backup.hint": "„Zastąp wszystko” nadpisze wszystkie bieżące dane — tego nie można cofnąć.",
      "backup.exported": "Wyeksportowano.",
      "backup.confirmReplace":
        "Zastąpić WSZYSTKIE dane zawartością pliku?\n\nBieżące szablony, notatki, statusy, lista i ustawienia zostaną trwale usunięte.",
      "backup.badJson": "Plik jest uszkodzony lub nie jest plikiem JSON.",
      "backup.badFormat": "Nieprawidłowy format pliku (oczekiwano kopii zapasowej OLX Smart Helper).",
      "backup.imported": "Zaimportowano — szablonów: {p}, ogłoszeń: {l}.",
      "backup.replaced": "Zastąpiono — szablonów: {p}, ogłoszeń: {l}.",
      "backup.error": "Błąd importu: {msg}",
      "backup.readError": "Nie udało się odczytać pliku.",

      "debug.title": "Debugowanie",
      "debug.toggle": "Zbieraj diagnostykę ekstrakcji",
      "debug.toggleHint": "Zapisuje zdarzenia w konsoli strony i w dzienniku poniżej (ostatnie 20).",
      "debug.events": "Zdarzenia",
      "debug.copy": "Kopiuj",
      "debug.refresh": "Odśwież",
      "debug.clear": "Wyczyść",
      "debug.empty": "Brak zdarzeń. Włącz tryb i odśwież stronę OLX.",
      "debug.on": "Debugowanie włączone — otwórz lub odśwież stronę OLX.",
      "debug.off": "Debugowanie wyłączone.",
      "debug.copied": "Diagnostykę skopiowano do schowka.",
      "debug.diagTitle": "OLX Smart Helper — diagnostyka",
      "debug.diagDate": "Data",
      "debug.diagCount": "Zdarzeń",
      "debug.diagNone": "(brak zdarzeń)",

      "popup.allSettings": "Wszystkie ustawienia",
      "popup.add": "Dodaj szablon",
      "popup.text": "Treść",

      "nego.greet": "Dzień dobry! Interesuje mnie „{title}”.",
      "nego.market": "Podobne oferty są teraz średnio po {market}.",
      "nego.offer": "Czy sprzeda Pan/Pani za {offer}? Mogę szybko odebrać.",
    },

    ro: {
      "common.version": "Versiune",
      "common.storageUnavailable": "Stocarea nu este disponibilă.",
      "common.copyFailed": "Copierea a eșuat",
      "common.close": "Închide",
      "common.cancel": "Renunță",
      "common.save": "Salvează",
      "common.delete": "Șterge",
      "common.undo": "Anulează",
      "common.untitled": "Anunț",

      "lang.title": "Limba interfeței",
      "lang.auto": "Auto (după domeniul OLX)",
      "lang.autoHint": "Auto: olx.ro → Română, olx.pl → Polski, olx.ua → Українська, olx.bg → Български, restul → Русский.",
      "lang.current": "Acum: {lang}",
      "lang.sellerNote": "Mesajele către vânzător sunt scrise mereu în limba site-ului OLX.",

      "verdict.good": "Preț avantajos",
      "verdict.good.short": "Avantajos",
      "verdict.fair": "Preț de piață",
      "verdict.fair.short": "La piață",
      "verdict.high": "Preț umflat",
      "verdict.high.short": "Peste piață",
      "verdict.unknown": "Date insuficiente",
      "verdict.unknown.short": "Puține date",
      "confidence.aria": "Încredere: {level}/3",

      "reason.delta": "{pct} față de mediană (similare: {n})",
      "reason.suspicious": "Preț suspect de mic — verificați vânzătorul",
      "reason.negotiable": "Vânzătorul acceptă negocieri",
      "reason.free": "Se oferă gratuit",
      "reason.exchange": "Doar schimb",
      "reason.noprice": "Prețul nu a fost găsit",
      "reason.few": "Puține anunțuri similare (găsite: {n})",
      "reason.none": "Niciun anunț similar pe pagină",

      "pill.median": "Mediana: {price} (similare: {n})",
      "pill.thisPrice": "Acest preț: {price} ({pct})",
      "pill.noData": "Prea puține anunțuri similare pe pagină",
      "pill.suspicious": "⚠ Preț suspect de mic",

      "w.settings": "Setări",
      "w.collapse": "Restrânge / extinde",
      "w.price": "Prețul anunțului",
      "w.price.free": "Gratuit",
      "w.price.exchange": "Schimb",
      "w.price.none": "Prețul nu a fost găsit",
      "w.tag.negotiable": "negociabil",
      "w.tag.source": "sursa: {src}",
      "w.src.dom": "pagina",
      "w.src.jsonld": "schema.org",
      "w.src.meta": "etichete meta",
      "w.src.heuristic": "euristică",
      "w.gauge.cheaper": "mai ieftin",
      "w.gauge.median": "mediana",
      "w.gauge.pricier": "mai scump",
      "w.stat.median": "Mediana",
      "w.stat.delta": "Diferență",
      "w.stat.comps": "Similare",
      "w.range": "Interval tipic: {from} – {to}",
      "w.empty": "Prea puține anunțuri similare pe pagină pentru o evaluare. Apăsați „{action}” — în rezultate prețurile vor fi marcate.",
      "w.signal.drop": "↓ Preț redus",
      "w.signal.rise": "↑ Preț crescut",
      "w.signal.was": "era {price}",
      "w.signal.new": "Văzut prima dată",
      "w.signal.relist": "Posibil republicat",
      "w.offer.title": "Negociere rapidă",
      "w.offer.less": "Micșorează",
      "w.offer.more": "Mărește",
      "w.offer.copy": "Copiază",
      "w.action.similar": "Găsește la fel",
      "w.action.presets": "Șabloane",
      "w.action.copyDefault": "Copiază șablonul implicit",
      "w.comps": "Similare pe pagină · {n}",
      "w.meta.statusAria": "Starea comunicării cu vânzătorul",
      "w.meta.save": "Salvează",
      "w.meta.saved": "În listă",
      "w.meta.note": "Notiță despre anunț…",

      "status.not_contacted": "Necontactat",
      "status.contacted": "Am scris",
      "status.replied": "A răspuns",
      "status.ignored": "Ignorat",

      "presets.title": "Șabloane de mesaje",
      "presets.new": "Șablon nou",
      "presets.default": "Implicit",
      "presets.copy": "Copiază",
      "presets.isDefault": "Șablon implicit",
      "presets.makeDefault": "Setează ca implicit",
      "presets.edit": "Editează",
      "presets.empty": "Încă nu există șabloane",
      "presets.emptyHint": "Adăugați primul — va apărea la butonul „Șabloane” din anunțuri.",
      "presets.name": "Nume",
      "presets.text": "Textul mesajului",
      "presets.add": "Adaugă",
      "presets.drag": "Trageți pentru a schimba ordinea",
      "presets.hint": "Trageți de ⠿ pentru a reordona. ★ — șablonul pentru butonul ⚡ din anunț.",
      "presets.deleted": "Șablonul „{label}” a fost șters",
      "presets.untitled": "Fără nume",

      "toast.copied": "Copiat: {label}",
      "toast.noDefault": "Nu există un șablon implicit",
      "toast.offerCopied": "Oferta a fost copiată — lipiți-o în chatul cu vânzătorul",

      "opt.docTitle": "OLX Smart Helper — setări",
      "opt.tagline": "Evaluarea prețurilor de piață direct pe OLX",
      "opt.tab.general": "General",
      "opt.tab.presets": "Șabloane",
      "opt.tab.saved": "Salvate",
      "opt.tab.backup": "Copie de rezervă",
      "opt.tab.debug": "Depanare",

      "saved.title": "Anunțuri salvate",
      "saved.empty": "Deocamdată e gol. Pe pagina unui anunț apăsați „{save}” — va apărea aici cu preț, stare și dată.",
      "saved.on": "salvat {date}",
      "saved.remove": "Elimină",
      "saved.csv": "Export CSV",
      "saved.csvEmpty": "Lista e goală — nimic de exportat.",
      "saved.csvDone": "Anunțuri exportate: {n}.",

      "backup.title": "Copie de rezervă",
      "backup.desc": "Șabloane, notițe, stări, anunțuri salvate și setări — într-un singur fișier JSON.",
      "backup.export": "Export (JSON)",
      "backup.import": "Import (combină)",
      "backup.replace": "Înlocuiește tot",
      "backup.hint": "„Înlocuiește tot” va suprascrie toate datele curente — acțiune ireversibilă.",
      "backup.exported": "Exportat.",
      "backup.confirmReplace":
        "Înlocuiți TOATE datele cu conținutul fișierului?\n\nȘabloanele, notițele, stările, lista și setările curente vor fi șterse definitiv.",
      "backup.badJson": "Fișierul este deteriorat sau nu este JSON.",
      "backup.badFormat": "Format de fișier invalid (se așteaptă o copie de rezervă OLX Smart Helper).",
      "backup.imported": "Importat — șabloane: {p}, anunțuri: {l}.",
      "backup.replaced": "Înlocuit — șabloane: {p}, anunțuri: {l}.",
      "backup.error": "Eroare la import: {msg}",
      "backup.readError": "Fișierul nu a putut fi citit.",

      "debug.title": "Depanare",
      "debug.toggle": "Colectează diagnostice de extragere",
      "debug.toggleHint": "Scrie evenimentele în consola paginii și în jurnalul de mai jos (ultimele 20).",
      "debug.events": "Evenimente",
      "debug.copy": "Copiază",
      "debug.refresh": "Reîmprospătează",
      "debug.clear": "Golește",
      "debug.empty": "Niciun eveniment. Activați modul și reîncărcați pagina OLX.",
      "debug.on": "Depanare activată — deschideți sau reîncărcați pagina OLX.",
      "debug.off": "Depanare dezactivată.",
      "debug.copied": "Diagnosticul a fost copiat în clipboard.",
      "debug.diagTitle": "OLX Smart Helper — diagnostic",
      "debug.diagDate": "Data",
      "debug.diagCount": "Evenimente",
      "debug.diagNone": "(niciun eveniment)",

      "popup.allSettings": "Toate setările",
      "popup.add": "Adaugă șablon",
      "popup.text": "Text",

      "nego.greet": "Bună ziua! Mă interesează „{title}”.",
      "nego.market": "Anunțuri similare sunt acum în medie la {market}.",
      "nego.offer": "Ați accepta {offer}? Pot ridica rapid.",
    },

    bg: {
      "common.version": "Версия",
      "common.storageUnavailable": "Хранилището не е достъпно.",
      "common.copyFailed": "Неуспешно копиране",
      "common.close": "Затвори",
      "common.cancel": "Отказ",
      "common.save": "Запази",
      "common.delete": "Изтрий",
      "common.undo": "Върни",
      "common.untitled": "Обява",

      "lang.title": "Език на интерфейса",
      "lang.auto": "Авто (според домейна на OLX)",
      "lang.autoHint": "Авто: olx.ro → Română, olx.pl → Polski, olx.ua → Українська, olx.bg → Български, останалите → Русский.",
      "lang.current": "Сега: {lang}",
      "lang.sellerNote": "Съобщенията до продавача винаги са на езика на сайта на OLX.",

      "verdict.good": "Изгодна цена",
      "verdict.good.short": "Изгодно",
      "verdict.fair": "Пазарна цена",
      "verdict.fair.short": "Пазарна",
      "verdict.high": "Завишена цена",
      "verdict.high.short": "Над пазара",
      "verdict.unknown": "Малко данни",
      "verdict.unknown.short": "Малко данни",
      "confidence.aria": "Увереност: {level}/3",

      "reason.delta": "{pct} спрямо медианата (подобни: {n})",
      "reason.suspicious": "Подозрително ниска цена — проверете продавача",
      "reason.negotiable": "Продавачът е готов да преговаря",
      "reason.free": "Подарява се",
      "reason.exchange": "Само замяна",
      "reason.noprice": "Цената не е намерена",
      "reason.few": "Малко подобни (намерени: {n})",
      "reason.none": "Няма подобни на страницата",

      "pill.median": "Медиана: {price} (подобни: {n})",
      "pill.thisPrice": "Тази цена: {price} ({pct})",
      "pill.noData": "Недостатъчно подобни обяви на страницата",
      "pill.suspicious": "⚠ Подозрително ниска цена",

      "w.settings": "Настройки",
      "w.collapse": "Свий / разгъни",
      "w.price": "Цена на обявата",
      "w.price.free": "Безплатно",
      "w.price.exchange": "Замяна",
      "w.price.none": "Цената не е намерена",
      "w.tag.negotiable": "по договаряне",
      "w.tag.source": "източник: {src}",
      "w.src.dom": "страницата",
      "w.src.jsonld": "schema.org",
      "w.src.meta": "meta тагове",
      "w.src.heuristic": "евристика",
      "w.gauge.cheaper": "по-евтино",
      "w.gauge.median": "медиана",
      "w.gauge.pricier": "по-скъпо",
      "w.stat.median": "Медиана",
      "w.stat.delta": "Разлика",
      "w.stat.comps": "Подобни",
      "w.range": "Типичен диапазон: {from} – {to}",
      "w.empty": "Твърде малко подобни обяви на страницата за оценка. Натиснете „{action}“ — в резултатите цените ще бъдат отбелязани.",
      "w.signal.drop": "↓ Цената е намалена",
      "w.signal.rise": "↑ Цената е повишена",
      "w.signal.was": "беше {price}",
      "w.signal.new": "Виждате за първи път",
      "w.signal.relist": "Вероятно е публикувана повторно",
      "w.offer.title": "Бързо пазарене",
      "w.offer.less": "Намали",
      "w.offer.more": "Увеличи",
      "w.offer.copy": "Копирай",
      "w.action.similar": "Намери същите",
      "w.action.presets": "Шаблони",
      "w.action.copyDefault": "Копирай шаблона по подразбиране",
      "w.comps": "Подобни на страницата · {n}",
      "w.meta.statusAria": "Статус на комуникацията с продавача",
      "w.meta.save": "Запази",
      "w.meta.saved": "В списъка",
      "w.meta.note": "Бележка към обявата…",

      "status.not_contacted": "Без контакт",
      "status.contacted": "Писах",
      "status.replied": "Отговори",
      "status.ignored": "Игнориран",

      "presets.title": "Шаблони за съобщения",
      "presets.new": "Нов шаблон",
      "presets.default": "По подразбиране",
      "presets.copy": "Копирай",
      "presets.isDefault": "Шаблон по подразбиране",
      "presets.makeDefault": "Задай по подразбиране",
      "presets.edit": "Редактирай",
      "presets.empty": "Все още няма шаблони",
      "presets.emptyHint": "Добавете първия — ще се появи в бутона „Шаблони“ на обявите.",
      "presets.name": "Име",
      "presets.text": "Текст на съобщението",
      "presets.add": "Добави",
      "presets.drag": "Плъзнете, за да промените реда",
      "presets.hint": "Плъзгайте за ⠿, за да подредите. ★ — шаблонът за бутона ⚡ в обявата.",
      "presets.deleted": "Шаблонът „{label}“ е изтрит",
      "presets.untitled": "Без име",

      "toast.copied": "Копирано: {label}",
      "toast.noDefault": "Няма шаблон по подразбиране",
      "toast.offerCopied": "Предложението е копирано — поставете го в чата с продавача",

      "opt.docTitle": "OLX Smart Helper — настройки",
      "opt.tagline": "Пазарна оценка на цените директно в OLX",
      "opt.tab.general": "Общи",
      "opt.tab.presets": "Шаблони",
      "opt.tab.saved": "Запазени",
      "opt.tab.backup": "Резервно копие",
      "opt.tab.debug": "Диагностика",

      "saved.title": "Запазени обяви",
      "saved.empty": "Засега е празно. На страницата на обява натиснете „{save}“ — тя ще се появи тук с цена, статус и дата.",
      "saved.on": "запазено {date}",
      "saved.remove": "Премахни",
      "saved.csv": "Експорт в CSV",
      "saved.csvEmpty": "Списъкът е празен — няма какво да се експортира.",
      "saved.csvDone": "Експортирани обяви: {n}.",

      "backup.title": "Резервно копие",
      "backup.desc": "Шаблони, бележки, статуси, запазени обяви и настройки — в един JSON файл.",
      "backup.export": "Експорт (JSON)",
      "backup.import": "Импорт (обедини)",
      "backup.replace": "Замени всичко",
      "backup.hint": "„Замени всичко“ ще презапише всички текущи данни — необратимо.",
      "backup.exported": "Експортирано.",
      "backup.confirmReplace":
        "Да се заменят ли ВСИЧКИ данни със съдържанието на файла?\n\nТекущите шаблони, бележки, статуси, списък и настройки ще бъдат изтрити безвъзвратно.",
      "backup.badJson": "Файлът е повреден или не е JSON.",
      "backup.badFormat": "Невалиден формат на файла (очаква се резервно копие на OLX Smart Helper).",
      "backup.imported": "Импортирано — шаблони: {p}, обяви: {l}.",
      "backup.replaced": "Заменено — шаблони: {p}, обяви: {l}.",
      "backup.error": "Грешка при импорт: {msg}",
      "backup.readError": "Файлът не може да бъде прочетен.",

      "debug.title": "Диагностика",
      "debug.toggle": "Събирай диагностика на извличането",
      "debug.toggleHint": "Записва събития в конзолата на страницата и в дневника по-долу (последните 20).",
      "debug.events": "Събития",
      "debug.copy": "Копирай",
      "debug.refresh": "Обнови",
      "debug.clear": "Изчисти",
      "debug.empty": "Няма събития. Включете режима и презаредете страницата на OLX.",
      "debug.on": "Диагностиката е включена — отворете или презаредете страница на OLX.",
      "debug.off": "Диагностиката е изключена.",
      "debug.copied": "Диагностиката е копирана в клипборда.",
      "debug.diagTitle": "OLX Smart Helper — диагностика",
      "debug.diagDate": "Дата",
      "debug.diagCount": "Събития",
      "debug.diagNone": "(няма събития)",

      "popup.allSettings": "Всички настройки",
      "popup.add": "Добави шаблон",
      "popup.text": "Текст",

      "nego.greet": "Здравейте! Интересувам се от „{title}“.",
      "nego.market": "Подобни обяви в момента са средно по {market}.",
      "nego.offer": "Бихте ли го дали за {offer}? Мога да го взема бързо.",
    },
  };

  // First-run message templates, seeded in the active UI language.
  const PRESET_SEEDS = {
    ru: [
      ["Актуально?", "Здравствуйте! Актуально ли это объявление?"],
      ["Заберу сегодня", "Если предложение ещё актуально, могу забрать сегодня. Удобно ли вам?"],
      ["Торг при самовывозе", "Если заберу лично и без торга, сможете немного снизить цену?"],
      ["Состояние товара", "Можете, пожалуйста, рассказать подробнее о состоянии товара? Есть ли скрытые дефекты?"],
      ["Доставка", "Отправите ли вы через службу доставки? Какой способ вам удобнее?"],
    ],
    uk: [
      ["Актуально?", "Добрий день! Чи ще актуальне оголошення?"],
      ["Заберу сьогодні", "Якщо пропозиція ще актуальна, можу забрати сьогодні. Вам зручно?"],
      ["Торг при самовивозі", "Якщо заберу особисто, чи можете трохи знизити ціну?"],
      ["Стан товару", "Розкажіть, будь ласка, детальніше про стан товару. Чи є приховані дефекти?"],
      ["Доставка", "Чи відправите службою доставки? Який спосіб вам зручніший?"],
    ],
    pl: [
      ["Aktualne?", "Dzień dobry! Czy ogłoszenie jest nadal aktualne?"],
      ["Odbiór dziś", "Jeśli oferta jest aktualna, mogę odebrać dzisiaj. Czy to Panu/Pani pasuje?"],
      ["Negocjacja przy odbiorze", "Jeśli odbiorę osobiście, czy mógłby Pan / mogłaby Pani trochę obniżyć cenę?"],
      ["Stan przedmiotu", "Czy może Pan/Pani napisać więcej o stanie przedmiotu? Czy są jakieś ukryte wady?"],
      ["Wysyłka", "Czy jest możliwa wysyłka? Jaki sposób dostawy jest dla Pana/Pani wygodny?"],
    ],
    ro: [
      ["Disponibil?", "Bună ziua! Anunțul mai este valabil?"],
      ["Ridic azi", "Dacă oferta mai este valabilă, pot ridica astăzi. Vă convine?"],
      ["Negociere la ridicare", "Dacă ridic personal, ați putea scădea puțin prețul?"],
      ["Starea produsului", "Îmi puteți spune mai multe despre starea produsului? Are defecte ascunse?"],
      ["Livrare", "Trimiteți prin curier? Ce variantă vă este mai comodă?"],
    ],
    bg: [
      ["Актуално?", "Здравейте! Обявата още ли е актуална?"],
      ["Взимам днес", "Ако предложението е актуално, мога да го взема днес. Удобно ли ви е?"],
      ["Пазарене при вземане", "Ако го взема лично, бихте ли намалили малко цената?"],
      ["Състояние", "Може ли да разкажете повече за състоянието? Има ли скрити дефекти?"],
      ["Доставка", "Изпращате ли с куриер? Кой начин ви е по-удобен?"],
    ],
  };

  /* ---------- locale resolution ---------- */

  function normalizeLocale(code) {
    const c = String(code || "").toLowerCase().split(/[-_]/)[0];
    const n = ALIASES[c] || c;
    return LOCALES.includes(n) ? n : null;
  }

  // OLX hostname → locale ("www.olx.ro" → "ro"; olx.kz / olx.uz → "ru").
  // Returns null for non-OLX hosts (extension pages).
  function localeFromHost(host) {
    const h = String(host || "").toLowerCase();
    if (!/(^|\.)olx\.[a-z]+$/.test(h)) return null;
    return TLD_TO_LOCALE[h.split(".").pop()] || FALLBACK;
  }

  function sellerLocale(host = location.hostname) {
    return localeFromHost(host) || FALLBACK;
  }

  const state = {
    preference: "auto",
    domainLocale: null,
    active: FALLBACK,
    listeners: new Set(),
  };

  function resolve() {
    if (state.preference !== "auto") return state.preference;
    return (
      localeFromHost(location.hostname) ||
      state.domainLocale ||
      normalizeLocale(typeof navigator !== "undefined" && navigator.language) ||
      FALLBACK
    );
  }

  /* ---------- storage ---------- */

  function readFlags() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(FLAGS_KEY, (o) => resolve((o && o[FLAGS_KEY]) || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  function patchFlags(patch) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(FLAGS_KEY, (o) => {
          const flags = { ...((o && o[FLAGS_KEY]) || {}), ...patch };
          chrome.storage.local.set({ [FLAGS_KEY]: flags }, () => resolve(flags));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function update(nextPreference, nextDomain) {
    if (nextPreference !== undefined) state.preference = normalizeLocale(nextPreference) || "auto";
    if (nextDomain) state.domainLocale = normalizeLocale(nextDomain) || state.domainLocale;
    const next = resolve();
    if (next === state.active) return;
    state.active = next;
    for (const fn of state.listeners) {
      try {
        fn(next);
      } catch (e) {
        /* a broken listener must not block the others */
      }
    }
  }

  async function init() {
    const flags = await readFlags();
    state.preference = normalizeLocale(flags.locale) || "auto";
    state.domainLocale = normalizeLocale(flags.domainLocale);

    // Remember the OLX domain so extension pages can follow it in auto mode.
    const fromHost = localeFromHost(location.hostname);
    if (fromHost && fromHost !== state.domainLocale) {
      state.domainLocale = fromHost;
      patchFlags({ domainLocale: fromHost });
    }
    state.active = resolve();

    // Follow changes made in the popup / options page / another tab.
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[FLAGS_KEY]) return;
        const nv = changes[FLAGS_KEY].newValue || {};
        update(nv.locale, nv.domainLocale);
      });
    } catch (e) {
      /* storage events unavailable */
    }
    return state.active;
  }

  const ready = init();

  /* ---------- public API ---------- */

  function format(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  }

  function tFor(locale, key, params) {
    const dict = DICT[normalizeLocale(locale) || FALLBACK];
    const str = dict[key] != null ? dict[key] : DICT[FALLBACK][key];
    return str == null ? key : format(str, params);
  }

  function t(key, params) {
    return tFor(state.active, key, params);
  }

  // Persist "auto" or a locale code; applies immediately in this context.
  async function setPreference(pref) {
    const value = normalizeLocale(pref) || "auto";
    update(value);
    await patchFlags({ locale: value });
    return state.active;
  }

  function onChange(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  /*
   * Translate static markup:
   *   data-i18n="key"              → textContent
   *   data-i18n-placeholder="key"  → placeholder
   *   data-i18n-title="key"        → title
   *   data-i18n-aria="key"         → aria-label
   * <html data-i18n-doc-title="key"> sets document.title.
   */
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    for (const [attr, target] of [
      ["data-i18n-placeholder", "placeholder"],
      ["data-i18n-title", "title"],
      ["data-i18n-aria", "aria-label"],
    ]) {
      root.querySelectorAll(`[${attr}]`).forEach((el) => el.setAttribute(target, t(el.getAttribute(attr))));
    }
    if (root === document) {
      document.documentElement.lang = state.active;
      const docTitle = document.documentElement.getAttribute("data-i18n-doc-title");
      if (docTitle) document.title = t(docTitle);
    }
  }

  function defaultPresets(locale = state.active) {
    return (PRESET_SEEDS[locale] || PRESET_SEEDS[FALLBACK]).map(([label, text], i) => ({
      label,
      text,
      ...(i === 0 ? { isDefault: true } : {}),
    }));
  }

  H.i18n = {
    LOCALES,
    FALLBACK,
    NATIVE_NAMES,
    DICT,
    ready,
    t,
    tFor,
    apply,
    onChange,
    setPreference,
    getPreference: () => state.preference,
    getActive: () => state.active,
    localeFromHost,
    sellerLocale,
    normalizeLocale,
    defaultPresets,
  };
})();

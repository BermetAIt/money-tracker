import { icon } from "./icons.js?v=2";
import { bootShell, pageRoot } from "./layout.js?v=4";

const FAQS = [
  {
    question: "Как добавить расход?",
    answer:
      "Откройте раздел «Операции» и нажмите «Добавить расход». Укажите название, сумму, категорию, счёт и дату, затем сохраните запись.",
    search: "операция добавить расход сумма категория счет дата",
  },
  {
    question: "Как задать лимит на категорию?",
    answer:
      "Перейдите в «Бюджеты», нажмите «Новый бюджет», выберите категорию и укажите сумму лимита. Быстро изменить лимит можно кнопками «+» и «−» на карточке категории.",
    search: "бюджет лимит категория новый изменить",
  },
  {
    question: "Что означают цвета на полосах бюджета?",
    answer:
      "Зелёный означает, что лимит не близок к исчерпанию. При расходе от 80% появляется предупреждение, а при достижении лимита показывается превышение.",
    search: "цвет полосы прогресс бюджет 80 процентов превышение",
  },
  {
    question: "Как перевести деньги между счетами?",
    answer:
      "Откройте «Счета» и выберите «Перевод между счетами». Укажите исходный и целевой счёт, сумму и подтвердите перевод.",
    search: "перевод переводить счет счета между",
  },
  {
    question: "Как работает ИИ-помощник?",
    answer:
      "Помощник отвечает на вопросы о ваших операциях и бюджетах. Откройте раздел «ИИ-помощник» и задайте вопрос или выберите один из примеров.",
    search: "ии ai помощник вопрос расходы операции бюджет",
  },
  {
    question: "Как выгрузить операции?",
    answer:
      "В разделе «Операции» нажмите «Экспорт CSV». Файл можно открыть в табличном редакторе. Экспорт данных также доступен в настройках.",
    search: "выгрузка экспорт csv файл данные операции",
  },
  {
    question: "Как изменить валюту или тему?",
    answer:
      "Откройте «Настройки». В блоке «Внешний вид» выберите тему и акцентный цвет, а в блоке «Валюта и формат» — нужную валюту.",
    search: "настройки изменить сменить валюта тема светлая темная",
  },
];

const me = await bootShell("help");
if (me) {
  const root = pageRoot();
  root.innerHTML = `
    <div class="help-page">
      <section class="help-hero inup" aria-labelledby="help-title">
        <h1 id="help-title">Чем вам помочь?</h1>
        <p>Ответы на частые вопросы, короткие инструкции и подсказки.</p>
        <label class="help-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.3"></circle>
            <path d="m15.5 15.5 4.2 4.2"></path>
          </svg>
          <span class="sr-only">Поиск по справке</span>
          <input id="help-search" type="search" placeholder="Например: как добавить бюджет" autocomplete="off">
          <kbd aria-hidden="true">/</kbd>
        </label>
      </section>

      <section class="help-topics" aria-label="Популярные разделы">
        <a class="card help-topic rise" style="--i:1" href="/operations">
          <span class="help-topic-icon">${icon("ops")}</span>
          <strong>Первые шаги</strong>
          <span>Добавьте первую операцию и посмотрите, как меняется баланс.</span>
          <span class="help-topic-link">Открыть раздел ${icon("arrow")}</span>
        </a>
        <a class="card help-topic rise" style="--i:2" href="/budgets">
          <span class="help-topic-icon">${icon("bud")}</span>
          <strong>Бюджеты без стресса</strong>
          <span>Настройте лимиты и следите за расходами в течение месяца.</span>
          <span class="help-topic-link">Открыть раздел ${icon("arrow")}</span>
        </a>
        <a class="card help-topic rise" style="--i:3" href="/assistant">
          <span class="help-topic-icon">${icon("ai")}</span>
          <strong>Спросите ИИ-помощника</strong>
          <span>Задайте вопрос о своих расходах и получите ответ на основе данных.</span>
          <span class="help-topic-link">Открыть помощника ${icon("arrow")}</span>
        </a>
      </section>

      <div class="help-content">
        <section class="card help-faq" aria-labelledby="help-faq-title">
          <div class="help-section-head">
            <h2 id="help-faq-title">Частые вопросы</h2>
            <span id="help-faq-count" aria-live="polite">${FAQS.length} вопросов</span>
          </div>
          <div class="help-faq-list" id="help-faq-list">
            ${FAQS.map(
              ({ question, answer, search }) => `
                <details class="help-faq-item" data-search="${search}">
                  <summary>
                    <span>${question}</span>
                    <span class="help-faq-chevron">${icon("chev")}</span>
                  </summary>
                  <div class="help-faq-answer"><p>${answer}</p></div>
                </details>`,
            ).join("")}
          </div>
          <p class="help-no-results" id="help-no-results" role="status" hidden>
            По этому запросу ничего не найдено. Попробуйте другие слова или спросите ИИ-помощника.
          </p>
        </section>

        <aside class="help-aside" aria-label="Дополнительная помощь">
          <section class="card help-contact">
            <h2>Не нашли ответ?</h2>
            <p>Спросите ИИ-помощника — он подскажет по вашим операциям и бюджетам.</p>
            <a class="primary help-contact-link" href="/assistant">${icon("ai")}Спросить помощника</a>
          </section>
          <nav class="card help-shortcuts" aria-labelledby="help-shortcuts-title">
            <h2 id="help-shortcuts-title">Быстрые клавиши</h2>
            <a href="/operations"><span>Открыть операции</span><kbd>O</kbd></a>
            <a href="/assistant"><span>Открыть ИИ-помощника</span><kbd>A</kbd></a>
            <a href="/settings"><span>Перейти в настройки</span><kbd>S</kbd></a>
            <a href="#help-search" data-focus-search><span>Поиск по справке</span><kbd>/</kbd></a>
          </nav>
        </aside>
      </div>
    </div>
  `;

  const search = root.querySelector("#help-search");
  const faqItems = [...root.querySelectorAll(".help-faq-item")];
  const faqCount = root.querySelector("#help-faq-count");
  const noResults = root.querySelector("#help-no-results");

  search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
    let visibleCount = 0;
    for (const item of faqItems) {
      const text = `${item.textContent} ${item.dataset.search}`
        .toLocaleLowerCase("ru")
        .replace(/ё/g, "е");
      const matches = text.includes(query);
      item.hidden = !matches;
      if (matches) visibleCount += 1;
    }
    faqCount.textContent = query ? `Найдено: ${visibleCount}` : `${FAQS.length} вопросов`;
    noResults.hidden = visibleCount > 0;
  });

  root.querySelector("[data-focus-search]").addEventListener("click", (event) => {
    event.preventDefault();
    search.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target instanceof HTMLElement &&
        (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
    ) {
      return;
    }
    const shortcuts = { o: "/operations", a: "/assistant", s: "/settings" };
    if (event.key === "/") {
      event.preventDefault();
      search.focus();
    } else if (shortcuts[event.key.toLowerCase()]) {
      window.location.href = shortcuts[event.key.toLowerCase()];
    }
  });
}

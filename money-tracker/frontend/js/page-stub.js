import { bootShell, emptyState, pageRoot } from "./layout.js";

const meta = {
  ops: { title: "Операции", text: "Здесь появятся доходы и расходы с поиском и фильтрами." },
  ana: { title: "Аналитика", text: "Графики и сравнение месяцев будут на следующем этапе." },
  bud: { title: "Бюджеты", text: "Задайте лимиты по категориям — экран уже в том же стиле." },
  acc: { title: "Счета", text: "Карта, наличные, депозит и копилка появятся здесь." },
  ai: { title: "ИИ-помощник", text: "Чат по вашим тратам подключится после остальных экранов." },
  profile: { title: "Профиль", text: "Данные, цели и сеансы — в том же визуальном языке." },
  set: { title: "Настройки", text: "Тема, валюта и уведомления будут здесь." },
  help: { title: "Помощь", text: "Справка, FAQ и горячие клавиши появятся на этом экране." },
};

const pageId = document.body.dataset.page;
const info = meta[pageId];
const me = await bootShell(pageId);
if (me && info) {
  pageRoot().innerHTML = `
    <div class="page-head inup" style="--i:0">
      <div>
        <h1>${info.title}</h1>
        <p>${info.text}</p>
      </div>
    </div>
    ${emptyState("Раздел готовится", "Каркас уже в стиле Money Tracker: те же карточки, меню и анимации.")}
  `;
}

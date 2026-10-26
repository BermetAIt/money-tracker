const SYMBOLS = { KGS: "₸", RUB: "₽", USD: "$", EUR: "€" };
const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MONTHS_NOM = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function symbol(currency) {
  return SYMBOLS[currency] || "₸";
}

export function formatMoney(minor, currency = "KGS", withSymbol = true) {
  const major = Math.round(Number(minor) / 100);
  const formatted = Math.abs(major).toLocaleString("ru-RU").replace(/,/g, " ");
  const sign = major < 0 ? "−" : "";
  return withSymbol ? `${sign}${formatted} ${symbol(currency)}` : `${sign}${formatted}`;
}

export function formatCompact(minor) {
  const major = Math.round(Number(minor) / 100);
  return major.toLocaleString("ru-RU").replace(/,/g, " ");
}

export function formatDateLong(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDayShort(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
}

export function monthTitle(year, month) {
  return `${MONTHS_NOM[month - 1]} ${year}`;
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

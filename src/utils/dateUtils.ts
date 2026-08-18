export function isWeekend() {
  const hoje = new Date();
  const dia = hoje.getDay();
  return dia === 0 || dia === 6;
}

export function formatDate(date: Date, locale: string = 'pt-BR') {
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatTime(date: Date, locale: string = 'pt-BR') {
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getDayName(date: Date, locale: string = 'pt-BR') {
  return date.toLocaleDateString(locale, {
    weekday: 'long'
  });
}

export function getNextWeekday(weekday: number) {
  const today = new Date();
  const diff = (weekday - today.getDay() + 7) % 7;
  const result = new Date(today);
  result.setDate(today.getDate() + (diff === 0 ? 7 : diff));
  return result;
}
 
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWeekend = isWeekend;
exports.formatDate = formatDate;
exports.formatTime = formatTime;
exports.getDayName = getDayName;
exports.getNextWeekday = getNextWeekday;
function isWeekend() {
    const hoje = new Date();
    const dia = hoje.getDay();
    return dia === 0 || dia === 6;
}
function formatDate(date, locale = 'pt-BR') {
    return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}
function formatTime(date, locale = 'pt-BR') {
    return date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit'
    });
}
function getDayName(date, locale = 'pt-BR') {
    return date.toLocaleDateString(locale, {
        weekday: 'long'
    });
}
function getNextWeekday(weekday) {
    const today = new Date();
    const diff = (weekday - today.getDay() + 7) % 7;
    const result = new Date(today);
    result.setDate(today.getDate() + (diff === 0 ? 7 : diff));
    return result;
}
//# sourceMappingURL=dateUtils.js.map
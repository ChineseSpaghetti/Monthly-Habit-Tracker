const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function getTodayDate(): string {
  return formatDateKey(new Date());
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getNumberOfDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export function getMonthYearLabel(year: number, month: number): string {
  return `${getMonthName(month)} ${year}`;
}

export function formatLongDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_NAMES[date.getDay()]}, ${day} ${getMonthName(month)}`;
}

export function getDateKeyForDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getCurrentYearMonth(): { year: number; month: number } {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

export function getPreviousYearMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

export function getNextYearMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

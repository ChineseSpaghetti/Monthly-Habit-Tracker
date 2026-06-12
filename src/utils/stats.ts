import type { Habit, HabitLog, MonthPlan } from "../types";
import { getDateKeyForDay, getNumberOfDaysInMonth } from "./date";

export type MonthlyStats = {
  completedChecks: number;
  possibleChecks: number;
  overallPercentage: number;
};

export type HabitScore = {
  habit: Habit;
  completed: number;
  possible: number;
  percentage: number;
};

function roundPercentage(completed: number, possible: number): number {
  if (possible === 0) {
    return 0;
  }
  return Math.round((completed / possible) * 100);
}

export function calculateHabitPercentage(
  habit: Habit,
  logs: HabitLog[],
  year: number,
  month: number,
): number {
  return calculateHabitScore(habit, logs, year, month).percentage;
}

export function calculateHabitScore(
  habit: Habit,
  logs: HabitLog[],
  year: number,
  month: number,
): HabitScore {
  const possible = getNumberOfDaysInMonth(year, month);
  const completed = logs.filter(
    (log) =>
      log.habitId === habit.id &&
      log.completed &&
      isDateInMonth(log.date, year, month),
  ).length;

  return {
    habit,
    completed,
    possible,
    percentage: roundPercentage(completed, possible),
  };
}

export function calculateOverallMonthlyPercentage(
  habits: Habit[],
  logs: HabitLog[],
  year: number,
  month: number,
): number {
  return calculateMonthlyStats(habits, logs, year, month).overallPercentage;
}

export function calculateMonthlyStats(
  habits: Habit[],
  logs: HabitLog[],
  year: number,
  month: number,
): MonthlyStats {
  const possibleChecks = habits.length * getNumberOfDaysInMonth(year, month);
  const habitIds = new Set(habits.map((habit) => habit.id));
  const completedChecks = logs.filter(
    (log) =>
      habitIds.has(log.habitId) &&
      log.completed &&
      isDateInMonth(log.date, year, month),
  ).length;

  return {
    completedChecks,
    possibleChecks,
    overallPercentage: roundPercentage(completedChecks, possibleChecks),
  };
}

export function getHabitScores(
  habits: Habit[],
  logs: HabitLog[],
  plan: MonthPlan,
): HabitScore[] {
  return habits.map((habit) =>
    calculateHabitScore(habit, logs, plan.year, plan.month),
  );
}

export function getCompletedLog(
  logs: HabitLog[],
  habitId: string,
  date: string,
): HabitLog | undefined {
  return logs.find(
    (log) => log.habitId === habitId && log.date === date && log.completed,
  );
}

export function isCompletedOnDate(
  logs: HabitLog[],
  habitId: string,
  date: string,
): boolean {
  return Boolean(getCompletedLog(logs, habitId, date));
}

export function getTodayProgress(
  habits: Habit[],
  logs: HabitLog[],
  todayDate: string,
): { completed: number; total: number; percentage: number } {
  const completed = habits.filter((habit) =>
    isCompletedOnDate(logs, habit.id, todayDate),
  ).length;

  return {
    completed,
    total: habits.length,
    percentage: roundPercentage(completed, habits.length),
  };
}

export function getAllDateKeysForMonth(year: number, month: number): string[] {
  return Array.from({ length: getNumberOfDaysInMonth(year, month) }, (_, index) =>
    getDateKeyForDay(year, month, index + 1),
  );
}

function isDateInMonth(dateKey: string, year: number, month: number): boolean {
  return dateKey.startsWith(`${year}-${String(month).padStart(2, "0")}-`);
}

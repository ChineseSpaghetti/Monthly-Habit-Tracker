import type { Habit, HabitLog, HabitTrackerData, MonthPlan } from "./types";
import { getPreviousYearMonth } from "./utils/date";

const STORAGE_KEY = "monthly-habit-tracker-data";

const emptyData: HabitTrackerData = {
  monthPlans: [],
  habits: [],
  habitLogs: [],
};

export function loadTrackerData(): HabitTrackerData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyData;
  }

  try {
    const parsed = JSON.parse(raw) as HabitTrackerData;
    return {
      monthPlans: Array.isArray(parsed.monthPlans) ? parsed.monthPlans : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      habitLogs: Array.isArray(parsed.habitLogs) ? parsed.habitLogs : [],
    };
  } catch {
    return emptyData;
  }
}

export function saveTrackerData(data: HabitTrackerData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearTrackerData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function createMonthPlan(
  data: HabitTrackerData,
  year: number,
  month: number,
): { data: HabitTrackerData; plan: MonthPlan } {
  const existing = findMonthPlan(data, year, month);
  if (existing) {
    return { data, plan: existing };
  }

  const plan: MonthPlan = {
    id: createId(),
    year,
    month,
    createdAt: new Date().toISOString(),
  };

  return {
    plan,
    data: {
      ...data,
      monthPlans: [...data.monthPlans, plan],
    },
  };
}

export function copyPreviousMonthHabits(
  data: HabitTrackerData,
  targetYear: number,
  targetMonth: number,
): { data: HabitTrackerData; plan: MonthPlan; copiedCount: number } {
  const previous = getPreviousYearMonth(targetYear, targetMonth);
  const previousPlan = findMonthPlan(data, previous.year, previous.month);
  const previousHabits = previousPlan
    ? getHabitsForPlan(data, previousPlan.id)
    : [];

  const created = createMonthPlan(data, targetYear, targetMonth);
  const alreadyHasHabits = getHabitsForPlan(created.data, created.plan.id).length > 0;

  if (alreadyHasHabits || previousHabits.length === 0) {
    return {
      data: created.data,
      plan: created.plan,
      copiedCount: alreadyHasHabits ? 0 : previousHabits.length,
    };
  }

  const now = new Date().toISOString();
  const copiedHabits = previousHabits.map((habit) => ({
    id: createId(),
    monthPlanId: created.plan.id,
    name: habit.name,
    sortOrder: habit.sortOrder,
    createdAt: now,
  }));

  return {
    plan: created.plan,
    copiedCount: copiedHabits.length,
    data: {
      ...created.data,
      habits: [...created.data.habits, ...copiedHabits],
    },
  };
}

export function addHabitToPlan(
  data: HabitTrackerData,
  monthPlanId: string,
  name: string,
): { data: HabitTrackerData; habit: Habit } {
  const planHabits = getHabitsForPlan(data, monthPlanId);
  const now = new Date().toISOString();
  const habit: Habit = {
    id: createId(),
    monthPlanId,
    name,
    sortOrder: planHabits.length,
    createdAt: now,
  };

  return {
    habit,
    data: {
      ...data,
      habits: [...data.habits, habit],
    },
  };
}

export function toggleHabitLog(
  data: HabitTrackerData,
  habitId: string,
  date: string,
): HabitTrackerData {
  const existing = data.habitLogs.find(
    (log) => log.habitId === habitId && log.date === date,
  );
  const now = new Date().toISOString();

  if (!existing) {
    const log: HabitLog = {
      id: createId(),
      habitId,
      date,
      completed: true,
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...data,
      habitLogs: [...data.habitLogs, log],
    };
  }

  return {
    ...data,
    habitLogs: data.habitLogs.map((log) =>
      log.id === existing.id
        ? { ...log, completed: !log.completed, updatedAt: now }
        : log,
    ),
  };
}

export function findMonthPlan(
  data: HabitTrackerData,
  year: number,
  month: number,
): MonthPlan | undefined {
  return data.monthPlans.find(
    (plan) => plan.year === year && plan.month === month,
  );
}

export function getHabitsForPlan(
  data: HabitTrackerData,
  monthPlanId: string,
): Habit[] {
  return data.habits
    .filter((habit) => habit.monthPlanId === monthPlanId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function getLogsForHabits(
  data: HabitTrackerData,
  habits: Habit[],
): HabitLog[] {
  const habitIds = new Set(habits.map((habit) => habit.id));
  return data.habitLogs.filter((log) => habitIds.has(log.habitId));
}

export function getSortedMonthPlans(data: HabitTrackerData): MonthPlan[] {
  return [...data.monthPlans].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    return b.month - a.month;
  });
}

export function exportTrackerData(data: HabitTrackerData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "habit-tracker-backup.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

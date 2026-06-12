import type { HabitTrackerData } from "./types";

const STORAGE_KEY = "monthly-habit-tracker-data";
const IMPORT_MARKER_PREFIX = "monthly-habit-tracker-imported";

export const emptyTrackerData: HabitTrackerData = {
  monthPlans: [],
  habits: [],
  habitLogs: [],
};

export function loadLocalTrackerData(): HabitTrackerData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyTrackerData;
  }

  try {
    const parsed = JSON.parse(raw) as HabitTrackerData;
    return {
      monthPlans: Array.isArray(parsed.monthPlans) ? parsed.monthPlans : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      habitLogs: Array.isArray(parsed.habitLogs) ? parsed.habitLogs : [],
    };
  } catch {
    return emptyTrackerData;
  }
}

export function hasLocalTrackerData(data = loadLocalTrackerData()): boolean {
  return (
    data.monthPlans.length > 0 ||
    data.habits.length > 0 ||
    data.habitLogs.some((log) => log.completed)
  );
}

export function hasCompletedImport(userId: string): boolean {
  return localStorage.getItem(getImportMarkerKey(userId)) === "true";
}

export function markImportComplete(userId: string): void {
  localStorage.setItem(getImportMarkerKey(userId), "true");
}

export function clearLocalTrackerData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function getImportMarkerKey(userId: string): string {
  return `${IMPORT_MARKER_PREFIX}:${userId}`;
}

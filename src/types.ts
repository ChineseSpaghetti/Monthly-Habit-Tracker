export type MonthPlan = {
  id: string;
  year: number;
  month: number;
  createdAt: string;
};

export type Habit = {
  id: string;
  monthPlanId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export type HabitLog = {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HabitTrackerData = {
  monthPlans: MonthPlan[];
  habits: Habit[];
  habitLogs: HabitLog[];
};

export type TabKey = "today" | "month" | "stats" | "history" | "settings";

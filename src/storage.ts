import type { Habit, HabitLog, HabitTrackerData, MonthPlan } from "./types";
import { supabase } from "./supabaseClient";
import { getPreviousYearMonth } from "./utils/date";

type MonthPlanRow = {
  id: string;
  user_id: string;
  year: number;
  month: number;
  created_at: string;
  import_source_id: string | null;
};

type HabitRow = {
  id: string;
  user_id: string;
  month_plan_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  import_source_id: string | null;
};

type HabitLogRow = {
  id: string;
  user_id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  import_source_id: string | null;
};

export async function loadTrackerData(): Promise<HabitTrackerData> {
  const [monthPlansResult, habitsResult, habitLogsResult] = await Promise.all([
    supabase
      .from("month_plans")
      .select("id,user_id,year,month,created_at,import_source_id")
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase
      .from("habits")
      .select("id,user_id,month_plan_id,name,sort_order,created_at,import_source_id")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("habit_logs")
      .select("id,user_id,habit_id,date,completed,created_at,updated_at,import_source_id"),
  ]);

  if (monthPlansResult.error) {
    throw monthPlansResult.error;
  }
  if (habitsResult.error) {
    throw habitsResult.error;
  }
  if (habitLogsResult.error) {
    throw habitLogsResult.error;
  }

  return {
    monthPlans: (monthPlansResult.data ?? []).map(mapMonthPlan),
    habits: (habitsResult.data ?? []).map(mapHabit),
    habitLogs: (habitLogsResult.data ?? []).map(mapHabitLog),
  };
}

export async function createMonthPlan(
  _data: HabitTrackerData,
  year: number,
  month: number,
): Promise<{ data: HabitTrackerData; plan: MonthPlan }> {
  const row = await findOrCreateMonthPlan(year, month);
  const data = await loadTrackerData();
  return {
    data,
    plan: mapMonthPlan(row),
  };
}

export async function copyPreviousMonthHabits(
  data: HabitTrackerData,
  targetYear: number,
  targetMonth: number,
): Promise<{ data: HabitTrackerData; plan: MonthPlan; copiedCount: number }> {
  const previous = getPreviousYearMonth(targetYear, targetMonth);
  const previousPlan = findMonthPlan(data, previous.year, previous.month);
  const previousHabits = previousPlan ? getHabitsForPlan(data, previousPlan.id) : [];
  const targetPlanRow = await findOrCreateMonthPlan(targetYear, targetMonth);
  const targetPlan = mapMonthPlan(targetPlanRow);
  const targetHabits = getHabitsForPlan(data, targetPlan.id);

  if (targetHabits.length === 0 && previousHabits.length > 0) {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from("habits").insert(
      previousHabits.map((habit) => ({
        user_id: userId,
        month_plan_id: targetPlan.id,
        name: habit.name,
        sort_order: habit.sortOrder,
      })),
    );

    if (error) {
      throw error;
    }
  }

  return {
    data: await loadTrackerData(),
    plan: targetPlan,
    copiedCount: targetHabits.length === 0 ? previousHabits.length : 0,
  };
}

export async function addHabitToPlan(
  data: HabitTrackerData,
  monthPlanId: string,
  name: string,
): Promise<{ data: HabitTrackerData; habit: Habit }> {
  const userId = await getCurrentUserId();
  const planHabits = getHabitsForPlan(data, monthPlanId);
  const { data: habitRow, error } = await supabase
    .from("habits")
    .insert({
      user_id: userId,
      month_plan_id: monthPlanId,
      name,
      sort_order: planHabits.length,
    })
    .select("id,user_id,month_plan_id,name,sort_order,created_at,import_source_id")
    .single();

  if (error) {
    throw error;
  }

  return {
    data: await loadTrackerData(),
    habit: mapHabit(habitRow),
  };
}

export async function updateHabitName(
  habitId: string,
  name: string,
): Promise<{ data: HabitTrackerData; habit: Habit }> {
  const { data: habitRow, error } = await supabase
    .from("habits")
    .update({ name })
    .eq("id", habitId)
    .select("id,user_id,month_plan_id,name,sort_order,created_at,import_source_id")
    .single();

  if (error) {
    throw error;
  }

  return {
    data: await loadTrackerData(),
    habit: mapHabit(habitRow),
  };
}

export async function deleteHabit(habitId: string): Promise<HabitTrackerData> {
  const { error } = await supabase.from("habits").delete().eq("id", habitId);

  if (error) {
    throw error;
  }

  return loadTrackerData();
}

export async function toggleHabitLog(
  data: HabitTrackerData,
  habitId: string,
  date: string,
): Promise<HabitTrackerData> {
  const userId = await getCurrentUserId();
  const existing = data.habitLogs.find(
    (log) => log.habitId === habitId && log.date === date,
  );

  if (!existing) {
    const { error } = await supabase.from("habit_logs").insert({
      user_id: userId,
      habit_id: habitId,
      date,
      completed: true,
    });

    if (error) {
      throw error;
    }

    return loadTrackerData();
  }

  const { error } = await supabase
    .from("habit_logs")
    .update({
      completed: !existing.completed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (error) {
    throw error;
  }

  return loadTrackerData();
}

export async function clearTrackerData(): Promise<HabitTrackerData> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("month_plans").delete().eq("user_id", userId);

  if (error) {
    throw error;
  }

  return loadTrackerData();
}

export async function importTrackerData(
  localData: HabitTrackerData,
): Promise<HabitTrackerData> {
  const userId = await getCurrentUserId();
  const monthPlanIdMap = new Map<string, string>();
  const habitIdMap = new Map<string, string>();

  const sortedPlans = [...localData.monthPlans].sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }
    return a.month - b.month;
  });

  for (const plan of sortedPlans) {
    const { data, error } = await supabase
      .from("month_plans")
      .upsert(
        {
          user_id: userId,
          year: plan.year,
          month: plan.month,
          import_source_id: `month_plan:${plan.id}`,
        },
        { onConflict: "user_id,year,month" },
      )
      .select("id,user_id,year,month,created_at,import_source_id")
      .single();

    if (error) {
      throw error;
    }
    monthPlanIdMap.set(plan.id, data.id);
  }

  const habitInserts = localData.habits
    .filter((habit) => monthPlanIdMap.has(habit.monthPlanId))
    .map((habit) => ({
      user_id: userId,
      month_plan_id: monthPlanIdMap.get(habit.monthPlanId)!,
      name: habit.name,
      sort_order: habit.sortOrder,
      import_source_id: `habit:${habit.id}`,
    }));

  if (habitInserts.length > 0) {
    const { data, error } = await supabase
      .from("habits")
      .upsert(habitInserts, { onConflict: "user_id,import_source_id" })
      .select("id,user_id,month_plan_id,name,sort_order,created_at,import_source_id");

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      if (row.import_source_id?.startsWith("habit:")) {
        habitIdMap.set(row.import_source_id.slice("habit:".length), row.id);
      }
    }
  }

  const logInserts = localData.habitLogs
    .filter((log) => log.completed && habitIdMap.has(log.habitId))
    .map((log) => ({
      user_id: userId,
      habit_id: habitIdMap.get(log.habitId)!,
      date: log.date,
      completed: true,
      import_source_id: `habit_log:${log.id}`,
    }));

  if (logInserts.length > 0) {
    const { error } = await supabase
      .from("habit_logs")
      .upsert(logInserts, { onConflict: "user_id,habit_id,date" });

    if (error) {
      throw error;
    }
  }

  return loadTrackerData();
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

async function findOrCreateMonthPlan(
  year: number,
  month: number,
): Promise<MonthPlanRow> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("month_plans")
    .upsert(
      {
        user_id: userId,
        year,
        month,
      },
      { onConflict: "user_id,year,month" },
    )
    .select("id,user_id,year,month,created_at,import_source_id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }
  if (!user) {
    throw new Error("You must be signed in to update habits.");
  }

  return user.id;
}

function mapMonthPlan(row: MonthPlanRow): MonthPlan {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    createdAt: row.created_at,
  };
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    monthPlanId: row.month_plan_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapHabitLog(row: HabitLogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.date,
    completed: row.completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

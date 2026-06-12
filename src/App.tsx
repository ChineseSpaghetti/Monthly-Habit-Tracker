import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addHabitToPlan,
  clearTrackerData,
  copyPreviousMonthHabits,
  createMonthPlan,
  exportTrackerData,
  findMonthPlan,
  getHabitsForPlan,
  getLogsForHabits,
  getSortedMonthPlans,
  loadTrackerData,
  saveTrackerData,
  toggleHabitLog,
} from "./storage";
import type { Habit, HabitTrackerData, MonthPlan, TabKey } from "./types";
import {
  formatLongDate,
  getCurrentYearMonth,
  getDateKeyForDay,
  getMonthYearLabel,
  getNextYearMonth,
  getNumberOfDaysInMonth,
  getPreviousYearMonth,
  getTodayDate,
} from "./utils/date";
import {
  calculateHabitPercentage,
  calculateMonthlyStats,
  getHabitScores,
  getTodayProgress,
  isCompletedOnDate,
} from "./utils/stats";

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "today", label: "Today", icon: "□" },
  { key: "month", label: "Month", icon: "■" },
  { key: "stats", label: "Stats", icon: "%" },
  { key: "history", label: "History", icon: "◷" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

function App() {
  const [data, setData] = useState<HabitTrackerData>(() => loadTrackerData());
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [setupTarget, setSetupTarget] = useState<{ year: number; month: number } | null>(
    null,
  );
  const [showAddHabit, setShowAddHabit] = useState(false);

  const todayDate = getTodayDate();
  const current = getCurrentYearMonth();
  const currentPlan = findMonthPlan(data, current.year, current.month);

  useEffect(() => {
    saveTrackerData(data);
  }, [data]);

  useEffect(() => {
    if (!selectedPlanId && currentPlan) {
      setSelectedPlanId(currentPlan.id);
    }
  }, [currentPlan, selectedPlanId]);

  const selectedPlan = useMemo(() => {
    if (activeTab === "today") {
      return currentPlan;
    }

    return (
      data.monthPlans.find((plan) => plan.id === selectedPlanId) ??
      currentPlan ??
      getSortedMonthPlans(data)[0]
    );
  }, [activeTab, currentPlan, data, selectedPlanId]);

  const targetForSetup =
    setupTarget ??
    (!currentPlan && activeTab === "today"
      ? { year: current.year, month: current.month }
      : null);

  const updateData = (nextData: HabitTrackerData) => {
    setData(nextData);
  };

  const handleCreateEmptyMonth = (year: number, month: number) => {
    const created = createMonthPlan(data, year, month);
    updateData(created.data);
    setSelectedPlanId(created.plan.id);
    setSetupTarget(null);
    setActiveTab("today");
  };

  const handleCopyPrevious = (year: number, month: number) => {
    const copied = copyPreviousMonthHabits(data, year, month);
    updateData(copied.data);
    setSelectedPlanId(copied.plan.id);
    setSetupTarget(null);
    setActiveTab("today");
  };

  const handleAddHabit = (name: string) => {
    if (!currentPlan) {
      return;
    }
    const added = addHabitToPlan(data, currentPlan.id, name);
    updateData(added.data);
    setShowAddHabit(false);
  };

  const handleToggle = (habitId: string, date: string) => {
    updateData(toggleHabitLog(data, habitId, date));
  };

  const openNextMonthSetup = () => {
    const anchor = selectedPlan ?? currentPlan;
    const target = anchor
      ? getNextYearMonth(anchor.year, anchor.month)
      : { year: current.year, month: current.month };
    setSetupTarget(target);
  };

  if (targetForSetup) {
    return (
      <NewMonthSetup
        target={targetForSetup}
        data={data}
        onCopyPrevious={handleCopyPrevious}
        onStartEmpty={handleCreateEmptyMonth}
      />
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {activeTab === "today" && currentPlan && (
          <TodayTab
            plan={currentPlan}
            data={data}
            todayDate={todayDate}
            onAddHabit={() => setShowAddHabit(true)}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "month" && selectedPlan && (
          <MonthTab plan={selectedPlan} data={data} onToggle={handleToggle} />
        )}

        {activeTab === "stats" && selectedPlan && (
          <StatsTab plan={selectedPlan} data={data} />
        )}

        {activeTab === "history" && (
          <HistoryTab
            data={data}
            onSelect={(planId) => {
              setSelectedPlanId(planId);
              setActiveTab("month");
            }}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            selectedPlan={selectedPlan}
            data={data}
            onCopyLastMonth={() => {
              const anchor = selectedPlan ?? currentPlan;
              const target = anchor ?? { year: current.year, month: current.month };
              handleCopyPrevious(target.year, target.month);
            }}
            onStartNewMonth={openNextMonthSetup}
            onExport={() => exportTrackerData(data)}
            onClear={() => {
              if (window.confirm("Clear all local habit data?")) {
                clearTrackerData();
                setData(loadTrackerData());
                setSelectedPlanId(null);
                setActiveTab("today");
              }
            }}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {showAddHabit && currentPlan && (
        <AddHabitModal
          plan={currentPlan}
          onClose={() => setShowAddHabit(false)}
          onSave={handleAddHabit}
        />
      )}
    </div>
  );
}

type PlanProps = {
  plan: MonthPlan;
  data: HabitTrackerData;
};

function TodayTab({
  plan,
  data,
  todayDate,
  onAddHabit,
  onToggle,
}: PlanProps & {
  todayDate: string;
  onAddHabit: () => void;
  onToggle: (habitId: string, date: string) => void;
}) {
  const habits = getHabitsForPlan(data, plan.id);
  const logs = getLogsForHabits(data, habits);
  const monthly = calculateMonthlyStats(habits, logs, plan.year, plan.month);
  const today = getTodayProgress(habits, logs, todayDate);

  return (
    <section className="screen">
      <ScreenHeader
        title={getMonthYearLabel(plan.year, plan.month)}
        subtitle={formatLongDate(todayDate)}
      />

      <ProgressPanel
        label="monthly progress"
        value={`${monthly.overallPercentage}%`}
        percent={monthly.overallPercentage}
        helper={`${today.completed} / ${today.total} done today`}
      />

      <h2 className="section-title">Today's habits</h2>
      <div className="habit-list">
        {habits.length === 0 ? (
          <EmptyPanel text="add your first habit for this month" />
        ) : (
          habits.map((habit) => {
            const checked = isCompletedOnDate(logs, habit.id, todayDate);
            return (
              <button
                className="habit-row"
                key={habit.id}
                onClick={() => onToggle(habit.id, todayDate)}
                type="button"
              >
                <span className={`check-box ${checked ? "checked" : ""}`}>
                  {checked ? "✓" : ""}
                </span>
                <span className="habit-name">{habit.name}</span>
                <span className="habit-state">{checked ? "done" : "todo"}</span>
              </button>
            );
          })
        )}
      </div>

      <button className="primary-button" type="button" onClick={onAddHabit}>
        + add habit
      </button>
    </section>
  );
}

function MonthTab({
  plan,
  data,
  onToggle,
}: PlanProps & { onToggle: (habitId: string, date: string) => void }) {
  const habits = getHabitsForPlan(data, plan.id);
  const logs = getLogsForHabits(data, habits);
  const monthly = calculateMonthlyStats(habits, logs, plan.year, plan.month);
  const dayCount = getNumberOfDaysInMonth(plan.year, plan.month);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  return (
    <section className="screen">
      <ScreenHeader
        title={getMonthYearLabel(plan.year, plan.month)}
        subtitle="monthly grid"
      />

      <ProgressPanel
        label="overall"
        value={`${monthly.overallPercentage}%`}
        percent={monthly.overallPercentage}
        compact
      />

      <h2 className="section-title">Habit / day</h2>
      <div className="grid-card">
        {habits.length === 0 ? (
          <EmptyPanel text="no habits in this month yet" />
        ) : (
          <div className="month-grid-wrap" aria-label="Monthly habit grid">
            <div
              className="month-grid"
              style={{
                gridTemplateColumns: `minmax(92px, 118px) repeat(${dayCount}, 28px) 44px`,
              }}
            >
              <div className="grid-head sticky-col">habit</div>
              {days.map((day) => (
                <div className="grid-head day-head" key={day}>
                  {day}
                </div>
              ))}
              <div className="grid-head day-head">%</div>

              {habits.map((habit) => (
                <MonthGridRow
                  key={habit.id}
                  habit={habit}
                  logs={logs}
                  plan={plan}
                  days={days}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        )}
        <p className="scroll-hint">← horizontally scroll to see all days →</p>
      </div>

      <button className="primary-button" type="button">
        toggle any day
      </button>
    </section>
  );
}

function MonthGridRow({
  habit,
  logs,
  plan,
  days,
  onToggle,
}: {
  habit: Habit;
  logs: HabitTrackerData["habitLogs"];
  plan: MonthPlan;
  days: number[];
  onToggle: (habitId: string, date: string) => void;
}) {
  const percentage = calculateHabitPercentage(habit, logs, plan.year, plan.month);

  return (
    <>
      <div className="grid-cell habit-cell sticky-col">{habit.name}</div>
      {days.map((day) => {
        const date = getDateKeyForDay(plan.year, plan.month, day);
        const checked = isCompletedOnDate(logs, habit.id, date);
        return (
          <button
            className={`dot-cell ${checked ? "active" : ""}`}
            key={date}
            type="button"
            aria-label={`${habit.name}, day ${day}, ${checked ? "done" : "todo"}`}
            onClick={() => onToggle(habit.id, date)}
          />
        );
      })}
      <div className="grid-cell percent-cell">{percentage}</div>
    </>
  );
}

function StatsTab({ plan, data }: PlanProps) {
  const habits = getHabitsForPlan(data, plan.id);
  const logs = getLogsForHabits(data, habits);
  const monthly = calculateMonthlyStats(habits, logs, plan.year, plan.month);
  const scores = getHabitScores(habits, logs, plan);
  const best = [...scores].sort((a, b) => b.percentage - a.percentage)[0];
  const worst = [...scores].sort((a, b) => a.percentage - b.percentage)[0];

  return (
    <section className="screen">
      <ScreenHeader
        title="Stats"
        subtitle={`${getMonthYearLabel(plan.year, plan.month)} summary`}
      />

      <ProgressPanel
        label="monthly score"
        value={`${monthly.overallPercentage}%`}
        percent={monthly.overallPercentage}
      />

      <div className="stat-cards">
        <MetricCard label="completed" value={monthly.completedChecks.toString()} />
        <MetricCard label="possible" value={monthly.possibleChecks.toString()} />
        <MetricCard
          label="best"
          value={best ? `${best.habit.name} ${best.percentage}%` : "--"}
        />
        <MetricCard
          label="focus"
          value={worst ? `${worst.habit.name} ${worst.percentage}%` : "--"}
        />
      </div>

      <h2 className="section-title">Habit scores</h2>
      {scores.length === 0 ? (
        <EmptyPanel text="scores appear after you add habits" />
      ) : (
        <div className="score-list">
          {scores.map((score) => (
            <div className="score-row" key={score.habit.id}>
              <div className="score-line">
                <span>{score.habit.name}</span>
                <span>{score.percentage}%</span>
              </div>
              <ProgressBar percent={score.percentage} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryTab({
  data,
  onSelect,
}: {
  data: HabitTrackerData;
  onSelect: (planId: string) => void;
}) {
  const plans = getSortedMonthPlans(data);

  return (
    <section className="screen">
      <ScreenHeader title="History" subtitle="monthly records" />

      <div className="history-list">
        {plans.length === 0 ? (
          <EmptyPanel text="no saved months yet" />
        ) : (
          plans.map((plan) => {
            const habits = getHabitsForPlan(data, plan.id);
            const logs = getLogsForHabits(data, habits);
            const stats = calculateMonthlyStats(habits, logs, plan.year, plan.month);

            return (
              <button
                className="history-card"
                key={plan.id}
                onClick={() => onSelect(plan.id)}
                type="button"
              >
                <div>
                  <h2>{getMonthYearLabel(plan.year, plan.month)}</h2>
                  <p>{habits.length} habits</p>
                </div>
                <div className="history-progress">
                  <strong>{stats.overallPercentage}%</strong>
                  <ProgressBar percent={stats.overallPercentage} />
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="note-panel">
        tap a month to view
        <br />
        grid + stats stay saved
      </div>
    </section>
  );
}

function SettingsTab({
  selectedPlan,
  data,
  onCopyLastMonth,
  onStartNewMonth,
  onExport,
  onClear,
}: {
  selectedPlan?: MonthPlan;
  data: HabitTrackerData;
  onCopyLastMonth: () => void;
  onStartNewMonth: () => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const label = selectedPlan
    ? getMonthYearLabel(selectedPlan.year, selectedPlan.month)
    : "No month selected";
  const previous = selectedPlan
    ? getPreviousYearMonth(selectedPlan.year, selectedPlan.month)
    : null;
  const previousPlan = previous
    ? findMonthPlan(data, previous.year, previous.month)
    : undefined;
  const previousDetail = previousPlan && previous
    ? getMonthYearLabel(previous.year, previous.month)
    : "no previous";

  return (
    <section className="screen">
      <ScreenHeader title="Settings" subtitle="simple controls" />

      <h2 className="section-title">Current month</h2>
      <div className="settings-list">
        <SettingsRow label={label} detail="active" />
        <SettingsRow
          label="Copy previous month"
          detail={previousDetail}
          onClick={onCopyLastMonth}
        />
        <SettingsRow label="Start new month" onClick={onStartNewMonth} />
      </div>

      <h2 className="section-title">Preferences</h2>
      <div className="settings-list">
        <SettingsRow label="Typewriter font" detail="on" />
        <SettingsRow label="Minimal theme" detail="on" />
        <SettingsRow label="Local storage" detail="on" />
      </div>

      <h2 className="section-title">Data</h2>
      <div className="settings-list">
        <SettingsRow label="Export data" onClick={onExport} />
        <SettingsRow label="Clear local data" onClick={onClear} />
      </div>
    </section>
  );
}

function NewMonthSetup({
  target,
  data,
  onCopyPrevious,
  onStartEmpty,
}: {
  target: { year: number; month: number };
  data: HabitTrackerData;
  onCopyPrevious: (year: number, month: number) => void;
  onStartEmpty: (year: number, month: number) => void;
}) {
  const previous = getPreviousYearMonth(target.year, target.month);
  const previousPlan = findMonthPlan(data, previous.year, previous.month);
  const previousLabel = getMonthYearLabel(previous.year, previous.month).split(" ")[0];

  return (
    <main className="app-main setup-main">
      <section className="screen">
        <ScreenHeader
          title={`Set up ${getMonthYearLabel(target.year, target.month)}`}
          subtitle="new monthly plan"
        />

        <div className="intro-card">
          <h2>How do you want to start?</h2>
          <p>
            Copy your {previousLabel} habits, or start empty and build a fresh
            list.
          </p>
        </div>

        <button
          className="primary-button setup-button"
          type="button"
          disabled={!previousPlan}
          onClick={() => onCopyPrevious(target.year, target.month)}
        >
          copy {previousLabel} habits
        </button>
        <button
          className="secondary-button setup-button"
          type="button"
          onClick={() => onStartEmpty(target.year, target.month)}
        >
          start empty
        </button>

        <div className="note-panel copy-note">
          <strong>copy means:</strong>
          <span>✓ habit names</span>
          <span>✓ habit order</span>
          <span>× completion logs</span>
        </div>
      </section>
    </main>
  );
}

function AddHabitModal({
  plan,
  onClose,
  onSave,
}: {
  plan: MonthPlan;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-screen" aria-hidden="true">
        <ScreenHeader
          title={getMonthYearLabel(plan.year, plan.month)}
          subtitle="habit editor overlay"
        />
        <div className="skeleton skeleton-lg">today's habits</div>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <form
        className="habit-modal"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Add habit</h2>
        <label htmlFor="habit-name">habit name</label>
        <input
          id="habit-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Study English"
        />
        <p>daily checkbox habit</p>
        <button className="primary-button" type="submit">
          save habit
        </button>
      </form>
    </div>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="screen-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function ProgressPanel({
  label,
  value,
  percent,
  compact,
  helper,
}: {
  label: string;
  value: string;
  percent: number;
  compact?: boolean;
  helper?: string;
}) {
  return (
    <div className={`progress-panel ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <div className="progress-content">
        <strong>{value}</strong>
        <ProgressBar percent={percent} />
        <em>{percent}%</em>
      </div>
      {helper && <p className="progress-helper">{helper}</p>}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="progress-track" aria-hidden="true">
      <div
        className="progress-fill"
        style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="empty-panel">{text}</div>;
}

function SettingsRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail?: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button className="settings-row" onClick={onClick} type="button">
        <span>{label}</span>
        <small>{detail ?? ">"}</small>
      </button>
    );
  }

  return (
    <div className="settings-row">
      <span>{label}</span>
      <small>{detail ?? ">"}</small>
    </div>
  );
}

function BottomNav({
  activeTab,
  onChange,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map((tab) => (
        <button
          className={`nav-item ${activeTab === tab.key ? "active" : ""}`}
          key={tab.key}
          onClick={() => onChange(tab.key)}
          type="button"
        >
          <span>{tab.icon}</span>
          <strong>{tab.label}</strong>
        </button>
      ))}
    </nav>
  );
}

export default App;

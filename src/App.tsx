import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
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
  importTrackerData,
  loadTrackerData,
  toggleHabitLog,
} from "./storage";
import {
  clearLocalTrackerData,
  emptyTrackerData,
  hasCompletedImport,
  hasLocalTrackerData,
  loadLocalTrackerData,
  markImportComplete,
} from "./localStorageImport";
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
  { key: "history", label: "History", icon: "o" },
  { key: "settings", label: "Settings", icon: "*" },
];

function App() {
  const auth = useAuth();
  const [data, setData] = useState<HabitTrackerData>(emptyTrackerData);
  const [dataLoading, setDataLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [setupTarget, setSetupTarget] = useState<{ year: number; month: number } | null>(
    null,
  );
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showImportPrompt, setShowImportPrompt] = useState(false);

  const refreshData = useCallback(async () => {
    setDataLoading(true);
    setErrorMessage(null);
    try {
      const nextData = await loadTrackerData();
      setData(nextData);
      return nextData;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return emptyTrackerData;
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.user) {
      setData(emptyTrackerData);
      setSelectedPlanId(null);
      setShowImportPrompt(false);
      return;
    }

    refreshData();

    const localData = loadLocalTrackerData();
    setShowImportPrompt(
      hasLocalTrackerData(localData) && !hasCompletedImport(auth.user.id),
    );
  }, [auth.user, refreshData]);

  const todayDate = getTodayDate();
  const current = getCurrentYearMonth();
  const currentPlan = findMonthPlan(data, current.year, current.month);

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
    (!dataLoading && !currentPlan && activeTab === "today"
      ? { year: current.year, month: current.month }
      : null);

  const runMutation = async (
    operation: () => Promise<HabitTrackerData | { data: HabitTrackerData; plan?: MonthPlan }>,
  ) => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const result = await operation();
      const nextData = "data" in result ? result.data : result;
      setData(nextData);
      return result;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateEmptyMonth = async (year: number, month: number) => {
    const created = await runMutation(() => createMonthPlan(data, year, month));
    if (created && "plan" in created && created.plan) {
      setSelectedPlanId(created.plan.id);
      setSetupTarget(null);
      setActiveTab("today");
    }
  };

  const handleCopyPrevious = async (year: number, month: number) => {
    const copied = await runMutation(() => copyPreviousMonthHabits(data, year, month));
    if (copied && "plan" in copied && copied.plan) {
      setSelectedPlanId(copied.plan.id);
      setSetupTarget(null);
      setActiveTab("today");
    }
  };

  const handleAddHabit = async (name: string) => {
    if (!currentPlan) {
      return;
    }
    const added = await runMutation(() => addHabitToPlan(data, currentPlan.id, name));
    if (added) {
      setShowAddHabit(false);
    }
  };

  const handleToggle = async (habitId: string, date: string) => {
    await runMutation(() => toggleHabitLog(data, habitId, date));
  };

  const openNextMonthSetup = () => {
    const anchor = selectedPlan ?? currentPlan;
    const target = anchor
      ? getNextYearMonth(anchor.year, anchor.month)
      : { year: current.year, month: current.month };
    setSetupTarget(target);
  };

  const handleImportLocalData = async () => {
    if (!auth.user) {
      return;
    }
    const localData = loadLocalTrackerData();
    const imported = await runMutation(() => importTrackerData(localData));
    if (imported) {
      markImportComplete(auth.user.id);
      clearLocalTrackerData();
      setShowImportPrompt(false);
    }
  };

  const handleSkipImport = () => {
    if (auth.user) {
      markImportComplete(auth.user.id);
    }
    setShowImportPrompt(false);
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    try {
      await auth.signOut();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  if (auth.loading) {
    return <LoadingScreen text="checking session" />;
  }

  if (!auth.user) {
    return (
      <LoginScreen
        authError={auth.authError}
        onSignIn={auth.signInWithPassword}
        onSignUp={auth.signUpWithPassword}
        onResetPassword={auth.resetPasswordForEmail}
      />
    );
  }

  if (auth.passwordRecovery) {
    return (
      <ChangePasswordScreen
        authError={auth.authError}
        onSave={auth.updatePassword}
      />
    );
  }

  if (dataLoading) {
    return <LoadingScreen text="loading cloud habits" />;
  }

  if (showImportPrompt) {
    return (
      <ImportPrompt
        busy={actionLoading}
        errorMessage={errorMessage}
        onImport={handleImportLocalData}
        onSkip={handleSkipImport}
      />
    );
  }

  if (targetForSetup) {
    return (
      <NewMonthSetup
        target={targetForSetup}
        data={data}
        busy={actionLoading}
        errorMessage={errorMessage}
        onCopyPrevious={handleCopyPrevious}
        onStartEmpty={handleCreateEmptyMonth}
      />
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {errorMessage && <div className="error-panel">{errorMessage}</div>}

        {activeTab === "today" && currentPlan && (
          <TodayTab
            plan={currentPlan}
            data={data}
            todayDate={todayDate}
            busy={actionLoading}
            onAddHabit={() => setShowAddHabit(true)}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "month" && selectedPlan && (
          <MonthTab
            plan={selectedPlan}
            data={data}
            busy={actionLoading}
            onToggle={handleToggle}
          />
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
            userEmail={auth.user.email ?? "signed in"}
            busy={actionLoading}
            onCopyLastMonth={() => {
              const anchor = selectedPlan ?? currentPlan;
              const target = anchor ?? { year: current.year, month: current.month };
              handleCopyPrevious(target.year, target.month);
            }}
            onStartNewMonth={openNextMonthSetup}
            onExport={() => exportTrackerData(data)}
            onClear={async () => {
              if (window.confirm("Clear all cloud habit data for this account?")) {
                await runMutation(() => clearTrackerData());
                setSelectedPlanId(null);
                setActiveTab("today");
              }
            }}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {showAddHabit && currentPlan && (
        <AddHabitModal
          plan={currentPlan}
          busy={actionLoading}
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

function LoginScreen({
  authError,
  onSignIn,
  onSignUp,
  onResetPassword,
}: {
  authError: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"sign-in" | "create-account">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onSignIn(email.trim(), password);
    } catch (authActionError) {
      setError(getErrorMessage(authActionError));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await onSignUp(email.trim(), password);
      setSuccess("Account created. You are signed in.");
    } catch (authActionError) {
      setError(getErrorMessage(authActionError));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onResetPassword(trimmedEmail);
      setSuccess("Password change link sent. Check your email.");
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  };

  const showSignIn = () => {
    setMode("sign-in");
    setError(null);
    setSuccess(null);
  };

  const showCreateAccount = () => {
    setMode("create-account");
    setError(null);
    setSuccess(null);
  };

  return (
    <main className="app-main setup-main">
      <section className="screen">
        <ScreenHeader
          title="Habit Tracker"
          subtitle={mode === "sign-in" ? "sign in to sync" : "create account"}
        />
        {mode === "sign-in" ? (
          <form className="auth-card" onSubmit={handleSignIn}>
            <h2>Email password login</h2>
            <p>Use a password for MVP testing without magic-link email limits.</p>
            <label htmlFor="login-email">email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <PasswordField
              id="login-password"
              label="password"
              value={password}
              disabled={loading}
              onChange={setPassword}
              placeholder="at least 6 characters"
            />
            {(error || authError) && <div className="error-panel">{error ?? authError}</div>}
            {success && <div className="success-panel">{success}</div>}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "working..." : "sign in"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={loading}
              onClick={showCreateAccount}
            >
              create account
            </button>
            <button
              className="text-button"
              type="button"
              disabled={loading}
              onClick={handleResetPassword}
            >
              change password
            </button>
          </form>
        ) : (
          <form className="auth-card" onSubmit={handleCreateAccount}>
            <h2>Create an account</h2>
            <p>Enter your email, password, and confirm the password.</p>
            <label htmlFor="signup-email">email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              required
              disabled={loading}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <PasswordField
              id="signup-password"
              label="password"
              value={password}
              disabled={loading}
              onChange={setPassword}
              placeholder="at least 6 characters"
            />
            <PasswordField
              id="signup-confirm-password"
              label="confirm password"
              value={confirmPassword}
              disabled={loading}
              onChange={setConfirmPassword}
              placeholder="repeat password"
            />
            {(error || authError) && <div className="error-panel">{error ?? authError}</div>}
            {success && <div className="success-panel">{success}</div>}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "creating..." : "create account"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={loading}
              onClick={showSignIn}
            >
              back to sign in
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function ChangePasswordScreen({
  authError,
  onSave,
}: {
  authError: string | null;
  onSave: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await onSave(password);
      setSuccess("Password updated. You can continue.");
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-main setup-main">
      <section className="screen">
        <ScreenHeader title="Change password" subtitle="set a new password" />
        <form className="auth-card" onSubmit={submit}>
          <h2>New password</h2>
          <p>Enter a new password for this account.</p>
          <PasswordField
            id="new-password"
            label="new password"
            value={password}
            disabled={loading}
            onChange={setPassword}
            placeholder="at least 6 characters"
          />
          <PasswordField
            id="confirm-password"
            label="confirm password"
            value={confirmPassword}
            disabled={loading}
            onChange={setConfirmPassword}
            placeholder="repeat password"
          />
          {(error || authError) && <div className="error-panel">{error ?? authError}</div>}
          {success && <div className="success-panel">{success}</div>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "saving..." : "save password"}
          </button>
        </form>
      </section>
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="app-main setup-main">
      <section className="screen">
        <ScreenHeader title="Habit Tracker" subtitle={text} />
        <div className="intro-card">
          <h2>Loading</h2>
          <p>Cloud data is getting lined up.</p>
        </div>
      </section>
    </main>
  );
}

function ImportPrompt({
  busy,
  errorMessage,
  onImport,
  onSkip,
}: {
  busy: boolean;
  errorMessage: string | null;
  onImport: () => void;
  onSkip: () => void;
}) {
  return (
    <main className="app-main setup-main">
      <section className="screen">
        <ScreenHeader title="Import habits" subtitle="local data found" />
        <div className="intro-card">
          <h2>Move saved habits to Supabase?</h2>
          <p>
            Existing habits in this browser can be imported once into your signed-in
            account.
          </p>
        </div>
        {errorMessage && <div className="error-panel">{errorMessage}</div>}
        <button className="primary-button setup-button" type="button" disabled={busy} onClick={onImport}>
          {busy ? "importing..." : "import local habits"}
        </button>
        <button className="secondary-button setup-button" type="button" disabled={busy} onClick={onSkip}>
          skip import
        </button>
      </section>
    </main>
  );
}

function TodayTab({
  plan,
  data,
  todayDate,
  busy,
  onAddHabit,
  onToggle,
}: PlanProps & {
  todayDate: string;
  busy: boolean;
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
                disabled={busy}
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

      <button className="primary-button" type="button" disabled={busy} onClick={onAddHabit}>
        + add habit
      </button>
    </section>
  );
}

function MonthTab({
  plan,
  data,
  busy,
  onToggle,
}: PlanProps & {
  busy: boolean;
  onToggle: (habitId: string, date: string) => void;
}) {
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
                  busy={busy}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        )}
        <p className="scroll-hint">← horizontally scroll to see all days →</p>
      </div>

      <button className="primary-button" type="button" disabled>
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
  busy,
  onToggle,
}: {
  habit: Habit;
  logs: HabitTrackerData["habitLogs"];
  plan: MonthPlan;
  days: number[];
  busy: boolean;
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
            disabled={busy}
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
  userEmail,
  busy,
  onCopyLastMonth,
  onStartNewMonth,
  onExport,
  onClear,
  onSignOut,
}: {
  selectedPlan?: MonthPlan;
  data: HabitTrackerData;
  userEmail: string;
  busy: boolean;
  onCopyLastMonth: () => void;
  onStartNewMonth: () => void;
  onExport: () => void;
  onClear: () => void;
  onSignOut: () => Promise<void>;
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

      <h2 className="section-title">Account</h2>
      <div className="settings-list">
        <SettingsRow label={userEmail} detail="signed in" />
        <SettingsRow label="Sign out" disabled={busy} onClick={onSignOut} />
      </div>

      <h2 className="section-title">Current month</h2>
      <div className="settings-list">
        <SettingsRow label={label} detail="active" />
        <SettingsRow
          label="Copy previous month"
          detail={previousDetail}
          disabled={busy}
          onClick={onCopyLastMonth}
        />
        <SettingsRow label="Start new month" disabled={busy} onClick={onStartNewMonth} />
      </div>

      <h2 className="section-title">Preferences</h2>
      <div className="settings-list">
        <SettingsRow label="Typewriter font" detail="on" />
        <SettingsRow label="Minimal theme" detail="on" />
        <SettingsRow label="Supabase sync" detail="on" />
      </div>

      <h2 className="section-title">Data</h2>
      <div className="settings-list">
        <SettingsRow label="Export data" disabled={busy} onClick={onExport} />
        <SettingsRow label="Clear cloud data" disabled={busy} onClick={onClear} />
      </div>
    </section>
  );
}

function NewMonthSetup({
  target,
  data,
  busy,
  errorMessage,
  onCopyPrevious,
  onStartEmpty,
}: {
  target: { year: number; month: number };
  data: HabitTrackerData;
  busy: boolean;
  errorMessage: string | null;
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
        {errorMessage && <div className="error-panel">{errorMessage}</div>}

        <button
          className="primary-button setup-button"
          type="button"
          disabled={busy || !previousPlan}
          onClick={() => onCopyPrevious(target.year, target.month)}
        >
          {busy ? "working..." : `copy ${previousLabel} habits`}
        </button>
        <button
          className="secondary-button setup-button"
          type="button"
          disabled={busy}
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
  busy,
  onClose,
  onSave,
}: {
  plan: MonthPlan;
  busy: boolean;
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
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          placeholder="Study English"
        />
        <p>daily checkbox habit</p>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "saving..." : "save habit"}
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

function PasswordField({
  id,
  label,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          required
          minLength={6}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <button
          className="password-toggle"
          type="button"
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <EyeIcon hidden={visible} />
        </button>
      </div>
    </div>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      {hidden && (
        <path
          d="M4 20 20 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}

function SettingsRow({
  label,
  detail,
  disabled,
  onClick,
}: {
  label: string;
  detail?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button className="settings-row" disabled={disabled} onClick={onClick} type="button">
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

export default App;

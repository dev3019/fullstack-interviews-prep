# Interview Guide — Task Tracker Debugging Exercise

> **CONFIDENTIAL** — This document is for the interviewer only. Do not share with candidates.

## Overview

This project is a simple task tracker application with **3 intentional issues**. The candidate should be able to discover, diagnose, and fix them within a ~1 hour interview.

The application "mostly works" — all features function at first glance, but specific scenarios reveal incorrect behavior.

---

## Intentional Issues

### Issue 1: Backend — Incorrect Filter Combination Logic

**Location**: `backend/app/main.py`, `list_tasks` endpoint (around line 85)

**Bug**: When multiple filters are applied simultaneously (e.g., search + status filter), the conditions are combined with `OR` instead of `AND`. This means filtering by status "completed" **and** searching for "search" returns all completed tasks **plus** all tasks matching "search" — rather than only completed tasks that also match "search".

**How to reproduce**:

1. Open the app and note there are 10 pre-loaded tasks
2. Filter by status "Completed" — shows 3 tasks (correct)
3. Type "search" in the search box while still filtering by "Completed"
4. **Expected**: 1 result ("Search indexing optimization" — the only completed task with "search" in its title/description)
5. **Actual**: 5+ results (all completed tasks OR any task matching "search", regardless of status)

**Root cause**: The query uses `or_(*filters)` to combine conditions instead of `and_(*filters)`.

```python
# Current (buggy):
from sqlalchemy import or_
query = query.filter(or_(*filters))

# Fix:
from sqlalchemy import and_
query = query.filter(and_(*filters))
```

**What this tests**:
- Debugging skills (tracing incorrect results back to the query layer)
- Backend / SQL understanding
- Attention to detail when reading existing code

**Signals of a strong candidate**:
- Quickly isolates the issue to the backend by inspecting network responses
- Reads the query-building code and spots the `or_` vs `and_` issue
- Verifies the fix with the same reproduction steps

**Signals of a weak candidate**:
- Assumes the bug is in the frontend
- Doesn't know how to read SQLAlchemy query construction
- Fixes it by adding multiple `.filter()` calls without understanding the root cause

---

### Issue 2: Architecture — Dashboard Statistics Derived from Filtered Data

**Location**: `frontend/src/App.tsx` and `frontend/src/components/Dashboard.tsx`

**Bug**: The Dashboard component receives the **currently displayed** (filtered) task list as its data source. This means dashboard statistics (total, completed, completion rate, etc.) change when filters are applied — which is incorrect for an "overview" dashboard.

**How to reproduce**:

1. Open the app — dashboard shows "Total: 10, Completed: 3, Rate: 30%"
2. Filter by status "Completed"
3. Dashboard now shows "Total: 3, Completed: 3, Rate: 100%"
4. Filter by priority "High"
5. Dashboard shows stats for only high-priority tasks

The dashboard should always reflect overall stats, regardless of active filters.

**Root cause**: In `App.tsx`, the same `tasks` state (which holds filtered results) is passed to both `<Dashboard>` and `<TaskList>`. The Dashboard computes its statistics from whatever tasks are currently visible.

**Fix options** (ranked by quality):

1. **Best fix — Add a backend stats endpoint** (tests design thinking):

   ```python
   # backend/app/main.py
   @app.get("/api/stats")
   def get_stats(db: Session = Depends(get_db)):
       total = db.query(Task).count()
       completed = db.query(Task).filter(Task.status == "completed").count()
       in_progress = db.query(Task).filter(Task.status == "in_progress").count()
       pending = db.query(Task).filter(Task.status == "pending").count()
       rate = round((completed / total) * 100) if total > 0 else 0
       return {
           "total": total,
           "completed": completed,
           "in_progress": in_progress,
           "pending": pending,
           "completion_rate": rate,
       }
   ```

   Then have `Dashboard` fetch from this endpoint independently.

2. **Acceptable fix — Separate frontend fetch**: Have the Dashboard component make its own `fetchTasks({})` call (no filters) to get total counts. Works but duplicates the "all tasks" fetch and computes stats client-side.

3. **Weak fix — Fetch all tasks client-side and filter locally**: Fetch all tasks once, store in state, derive both stats and a filtered view. Doesn't scale and defeats the purpose of server-side filtering.

**What this tests**:
- System design and separation of concerns
- Understanding of where logic belongs (frontend vs backend)
- Ability to articulate trade-offs between different solutions
- Communication skills when justifying architectural decisions

**Signals of a strong candidate**:
- Recognizes the root cause is an architectural issue, not a simple bug
- Proposes the backend stats endpoint as the primary fix
- Explains why: single source of truth, scales with pagination, no redundant data transfer
- Considers edge cases (what happens with thousands of tasks?)

**Signals of a weak candidate**:
- Fixes it by fetching all tasks without filters (doesn't scale)
- Doesn't recognize this as a design issue
- Can't articulate trade-offs between different fix approaches

---

### Issue 3: Backend — Stale `completed_at` Timestamp on Task Reopening

**Location**: `backend/app/main.py`, `update_task` endpoint

**Bug**: When a task is marked as "completed", the backend correctly sets the `completed_at` timestamp. However, when the task is later changed back to "pending" or "in_progress", the `completed_at` field is **not** cleared. This leads to data inconsistency — a pending/in-progress task can have a `completed_at` date.

**How to reproduce**:

1. Click "▶ Start" on a pending task to move it to "in_progress"
2. Click "✓ Complete" to mark it as "completed" — `completed_at` is set
3. Click "↩ Reopen" to move it back to "pending"
4. Inspect the task via `GET /api/tasks/{id}` — `completed_at` still has the old timestamp
5. This stale data could cause issues in reporting, sorting by completion date, etc.

**Root cause**: The update endpoint only sets `completed_at` when status becomes "completed" but never clears it:

```python
# Current (buggy):
if update.status == "completed":
    task.completed_at = datetime.utcnow()
# Missing: clearing completed_at when status changes away from "completed"
```

**Fix**:

```python
if update.status is not None:
    task.status = update.status
    if update.status == "completed":
        task.completed_at = datetime.utcnow()
    else:
        task.completed_at = None
```

**What this tests**:
- Data consistency awareness
- Edge case thinking
- Attention to detail in state transitions

**Signals of a strong candidate**:
- Notices this issue while investigating other bugs, or thinks to check data integrity
- Explains the downstream impact (incorrect reports, confusing API responses)
- Implements the fix with proper handling of all status transitions

**Signals of a weak candidate**:
- Doesn't notice this issue at all (acceptable if they find the first two quickly)
- Notices but dismisses it as unimportant

---

## Grading Rubric

### Scoring (out of 20 points)

| Category | Points | Criteria |
|----------|--------|----------|
| **Issue Discovery** | 6 | Found Issue 1 (2 pts), Found Issue 2 (2 pts), Found Issue 3 (2 pts) |
| **Root Cause Analysis** | 4 | Correctly identified root cause for each issue found |
| **Fix Quality** | 4 | Fix is correct, minimal, and doesn't introduce new issues |
| **Design Reasoning** | 3 | For Issue 2: articulated trade-offs between fix approaches |
| **Communication** | 3 | Clear explanation of debugging process and reasoning |

### Rating Scale

| Score | Rating | Description |
|-------|--------|-------------|
| 17–20 | **Strong Hire** | Found all 3 issues, excellent fixes, strong communication |
| 13–16 | **Hire** | Found 2+ issues, good fixes, explained reasoning well |
| 9–12 | **Lean Hire** | Found 1–2 issues, fixes mostly correct, some explanation |
| 5–8 | **Lean No Hire** | Found 1 issue with guidance, struggled with fixes |
| 0–4 | **No Hire** | Unable to find issues or propose reasonable fixes |

### What to Look For

**Strong candidate behaviors**:
- Starts by exploring the app to understand normal behavior
- Uses browser DevTools to inspect network requests
- Reads backend code systematically, not randomly
- Tests hypotheses with specific reproduction steps
- Proposes the fix before implementing to confirm understanding
- Considers edge cases and downstream effects
- Communicates thought process clearly throughout

**Weak candidate behaviors**:
- Makes random changes hoping to fix things
- Doesn't use available debugging tools (DevTools, API docs at `/docs`)
- Can't explain why a fix works
- Ignores data consistency implications
- Struggles to navigate between frontend and backend code

---

## Interview Flow Suggestion

1. **Setup (5 min)**: Have the candidate run `docker compose up --build` and familiarize themselves with the app
2. **Exploration (5 min)**: Let them click around, understand the features
3. **Debugging (35–40 min)**: Let them discover and fix issues at their own pace
4. **Discussion (10–15 min)**: Discuss trade-offs, alternative approaches, what they'd do differently in production

### Hints (use sparingly, if candidate is stuck)

| Strength | Issue 1 | Issue 2 | Issue 3 |
|----------|---------|---------|---------|
| **Mild** | "Try using the search and status filter at the same time. Do the results look right?" | "Look at the dashboard numbers when you apply different filters. Do they make sense for an *overall* view?" | "What happens to the task data when you complete a task and then reopen it?" |
| **Medium** | "Check how the backend query is built when multiple filters are active." | "Where does the Dashboard component get its data from?" | "Look at the `completed_at` field in the API response after reopening a task." |
| **Strong** | "Look at how `or_` and `and_` work in SQLAlchemy." | "Should the Dashboard depend on the same data as the filtered task list?" | "The update endpoint sets `completed_at` but never clears it." |

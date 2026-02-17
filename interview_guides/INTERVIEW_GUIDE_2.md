# Interview Guide — Expense Report Debugging Exercise

> **CONFIDENTIAL** — This document is for the interviewer only. Do not share with candidates.

## Overview

This project is an expense tracking application with **3 intentional issues**. The candidate should be able to discover, diagnose, and fix them within a ~1 hour interview.

The application "mostly works" — all features function at first glance, but specific scenarios reveal incorrect behavior in filtering, financial reporting, and data sorting.

---

## Intentional Issues

### Issue 1: Backend — Date Range Filter Excludes the End Date

**Location**: `backend/app/main.py`, `list_expenses` endpoint (around line 97)

**Bug**: The date range filter uses strict less-than (`<`) for the end date instead of less-than-or-equal (`<=`). This means expenses dated on the selected end date are excluded from results.

**How to reproduce**:

1. Open the app — note there are 15 pre-loaded expenses spanning the last ~2 weeks
2. Note the dates of the most recent expenses (some are dated today)
3. Set the "From" date to ~2 weeks ago and the "To" date to today
4. **Expected**: All expenses within the range, including today's
5. **Actual**: Expenses from today are missing from the results

Alternatively:

1. Set both "From" and "To" to the same date (e.g., today)
2. **Expected**: All expenses from that date
3. **Actual**: Zero results (because `date >= today AND date < today` is impossible)

**Root cause**: Line uses `Expense.expense_date < end` instead of `Expense.expense_date <= end`.

```python
# Current (buggy):
query = query.filter(Expense.expense_date < end)

# Fix:
query = query.filter(Expense.expense_date <= end)
```

**What this tests**:
- Debugging skills (boundary condition awareness)
- Understanding of date range semantics (inclusive vs exclusive)
- Careful reading of backend filter logic

**Signals of a strong candidate**:
- Tests edge cases with date filters (same day, boundary dates)
- Quickly identifies the `<` vs `<=` issue in the code
- Notes this is a classic off-by-one / fencepost error

**Signals of a weak candidate**:
- Doesn't think to test date range boundaries
- Assumes the issue is in the frontend date picker
- Can't articulate why `<` vs `<=` matters for date ranges

---

### Issue 2: Backend / Architecture — Spending Summary Includes Rejected Expenses

**Location**: `backend/app/main.py`, `get_summary` endpoint (around line 105)

**Bug**: The spending summary endpoint (`GET /api/expenses/summary`) aggregates **all** expenses regardless of status. This means rejected expenses (e.g., "Conference registration — $350.00", "Printer cartridge — $65.00") are included in the total spending and category breakdowns. The summary should only reflect approved and pending expenses, not rejected ones.

**How to reproduce**:

1. Open the app and look at the spending summary at the top
2. Note the total spending amount (includes all 15 expenses)
3. Look at the expense table — there are 2 rejected expenses ($350.00 + $65.00 = $415.00)
4. **Expected**: Total spending should exclude rejected amounts
5. **Actual**: The $415 from rejected expenses inflates the reported total
6. You can verify: reject an additional pending expense → the summary total stays the same (it was already counted)

**Root cause**: The summary endpoint queries `db.query(Expense).all()` without filtering out rejected expenses.

**Fix options** (ranked by quality):

1. **Best fix — Filter in the backend query** (clean, single source of truth):

   ```python
   @app.get("/api/expenses/summary")
   def get_summary(db: Session = Depends(get_db)):
       expenses = db.query(Expense).filter(Expense.status != "rejected").all()
       # ... rest of aggregation unchanged
   ```

2. **Acceptable fix — Parameterize the summary endpoint** to accept a status filter:

   ```python
   @app.get("/api/expenses/summary")
   def get_summary(
       exclude_status: Optional[str] = "rejected",
       db: Session = Depends(get_db),
   ):
       query = db.query(Expense)
       if exclude_status:
           query = query.filter(Expense.status != exclude_status)
       expenses = query.all()
       # ...
   ```

3. **Weak fix — Filter on the frontend**: Fetch all expenses and compute the summary client-side, skipping rejected ones. This duplicates logic, doesn't scale, and defeats the purpose of a summary endpoint.

**What this tests**:
- Business logic awareness (what does "total spending" mean?)
- Understanding of data integrity in financial reporting
- Design thinking about where filtering logic belongs
- Ability to articulate why including rejected expenses is wrong

**Signals of a strong candidate**:
- Notices the total seems high and cross-references with individual line items
- Identifies this as a business logic error, not just a code bug
- Proposes the backend filter and explains why frontend filtering is insufficient
- May discuss whether "pending" should also be excluded (shows nuanced thinking)

**Signals of a weak candidate**:
- Doesn't notice the inflated totals
- Fixes it on the frontend by filtering the display
- Can't explain the business impact of incorrect financial summaries

---

### Issue 3: Frontend — Sorting by Amount Uses String Comparison

**Location**: `frontend/src/components/ExpenseTable.tsx` (around line 30)

**Bug**: The table's sort function converts all values to strings before comparing. This works correctly for text columns (title, category, status) and dates (ISO format strings sort correctly), but produces **wrong results for the Amount column**. String comparison sorts `"120"` before `"24.5"` because `"1" < "2"` lexicographically, even though 24.5 < 120 numerically.

**How to reproduce**:

1. Open the app and look at the expense table
2. Click the "Amount" column header to sort ascending
3. **Expected**: $24.50, $35.00, $42.99, $48.75, $65.00, $85.50, $89.99, $120.00, ...
4. **Actual**: $120.00, $156.00, $199.00, $24.50, $275.00, $35.00, $350.00, ... (lexicographic order)

**Root cause**: The sort function casts all values to `String()` before comparison:

```typescript
// Current (buggy):
const sorted = useMemo(() => {
  return [...expenses].sort((a, b) => {
    const aVal = String(a[sortBy] ?? '');
    const bVal = String(b[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  });
}, [expenses, sortBy, sortDir]);
```

**Fix**:

```typescript
const sorted = useMemo(() => {
  return [...expenses].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    let cmp: number;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''));
    }

    return sortDir === 'asc' ? cmp : -cmp;
  });
}, [expenses, sortBy, sortDir]);
```

**What this tests**:
- Frontend debugging skills
- Understanding of JavaScript type coercion pitfalls
- Attention to detail when testing UI features
- Knowledge of sorting algorithms and comparator functions

**Signals of a strong candidate**:
- Notices incorrect sort order immediately when clicking the Amount column
- Identifies the `String()` conversion as the root cause
- Explains why it works for other columns (text naturally sorts as strings, ISO dates sort correctly)
- Implements a type-aware comparator

**Signals of a weak candidate**:
- Doesn't click column headers to test sorting
- Assumes sorting must be handled by the backend
- Can't explain why string comparison fails for numbers
- Fixes only the amount column with a hardcoded check instead of a generic solution

---

## Grading Rubric

### Scoring (out of 20 points)

| Category | Points | Criteria |
|----------|--------|----------|
| **Issue Discovery** | 6 | Found Issue 1 (2 pts), Found Issue 2 (2 pts), Found Issue 3 (2 pts) |
| **Root Cause Analysis** | 4 | Correctly identified root cause for each issue found |
| **Fix Quality** | 4 | Fix is correct, minimal, and doesn't introduce new issues |
| **Design Reasoning** | 3 | For Issue 2: discussed business logic, filtering ownership, trade-offs |
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
- Explores the app thoroughly — tries filters, date ranges, column sorting
- Uses browser DevTools to inspect API responses
- Cross-references displayed data with raw API data
- Reads code systematically, starting from the area closest to the symptom
- Tests fixes with edge cases (same-day range, boundary dates)
- Discusses business implications (especially for financial data)

**Weak candidate behaviors**:
- Only tests the "happy path" without exercising edge cases
- Makes assumptions about where bugs are without verifying
- Doesn't use Swagger docs (`/docs`) to test the API independently
- Can't distinguish between frontend and backend bugs
- Proposes fixes without understanding root cause

---

## Interview Flow Suggestion

1. **Setup (5 min)**: Have the candidate run `docker compose up --build` and familiarize themselves with the app
2. **Exploration (5 min)**: Let them click around, submit an expense, try filters and sorting
3. **Debugging (35–40 min)**: Let them discover and fix issues at their own pace
4. **Discussion (10–15 min)**: Discuss trade-offs, how they'd handle financial data in production, testing strategies

### Hints (use sparingly, if candidate is stuck)

| Strength | Issue 1 | Issue 2 | Issue 3 |
|----------|---------|---------|---------|
| **Mild** | "Try setting a date range. Do the boundary dates behave as you'd expect?" | "Look at the spending summary. Does the total seem accurate when you compare it to the individual expenses?" | "Try sorting the table by different columns. Does every column sort correctly?" |
| **Medium** | "Set both From and To to the same date. How many results do you get?" | "What expenses are included in the summary total? Should rejected expenses count?" | "Click the Amount header. Compare the sort order to what you'd expect numerically." |
| **Strong** | "Look at the comparison operator used for `date_end` in the backend filter." | "The summary endpoint queries all expenses with no status filter." | "The sort function converts all values to strings before comparing — what does that mean for numbers?" |

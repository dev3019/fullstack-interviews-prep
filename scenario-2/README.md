# Expense Report

A team expense tracking application for submitting, reviewing, and analyzing expenses.

## Features

- Submit expenses with title, amount, category, and date
- Filter expenses by category, status, and date range
- Sortable expense table (click column headers)
- Spending summary with category breakdown
- Approve or reject pending expenses
- Delete expenses

## Tech Stack

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy (SQLite)
- **Frontend**: React 18 + TypeScript + Vite

## Getting Started

### Prerequisites

- Docker and Docker Compose installed

### Running the Application

1. Clone the repository and navigate to the scenario folder:

   ```bash
   cd scenario-2
   ```

2. Build and start the services:

   ```bash
   docker compose up --build
   ```

3. Open the application:

   - **Frontend**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:8000](http://localhost:8000)
   - **API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

The application comes pre-loaded with sample expense data so you can start exploring right away.

### Stopping the Application

```bash
docker compose down
```

To also remove the database volume:

```bash
docker compose down -v
```

## Project Structure

```
scenario-2/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py          # API endpoints
│       ├── models.py         # SQLAlchemy models
│       ├── database.py       # Database configuration
│       └── seed.py           # Sample data seeding
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx              # Main application component
        ├── App.css              # Application styles
        ├── api.ts               # API client functions
        ├── types.ts             # TypeScript type definitions
        └── components/
            ├── SpendingSummary.tsx  # Spending breakdown
            ├── FilterBar.tsx       # Filter controls
            ├── ExpenseForm.tsx     # Expense submission form
            └── ExpenseTable.tsx    # Sortable expense table
```

## Expected Behavior

- The spending summary displays total spending and a breakdown by category
- Users can filter expenses by category, status, and date range (inclusive on both ends)
- Clicking a column header in the table sorts expenses by that column
- Users can submit new expenses with a title, amount, category, and date
- Pending expenses can be approved or rejected
- Expenses can be deleted
- The spending summary reflects only legitimate (non-rejected) expenses

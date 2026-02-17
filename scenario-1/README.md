# Task Tracker

A simple task management application for tracking team tasks with priorities and statuses.

## Features

- Create, update, and delete tasks
- Filter tasks by status and priority
- Search tasks by title and description
- Dashboard with task statistics
- Responsive, modern UI

## Tech Stack

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy (SQLite)
- **Frontend**: React 18 + TypeScript + Vite

## Getting Started

### Prerequisites

- Docker and Docker Compose installed

### Running the Application

1. Clone the repository and navigate to the scenario folder:

   ```bash
   cd scenario-1
   ```

2. Build and start the services:

   ```bash
   docker compose up --build
   ```

3. Open the application:

   - **Frontend**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:8000](http://localhost:8000)
   - **API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

The application comes pre-loaded with sample tasks so you can start exploring right away.

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
scenario-1/
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
        ├── App.tsx           # Main application component
        ├── App.css           # Application styles
        ├── api.ts            # API client functions
        ├── types.ts          # TypeScript type definitions
        └── components/
            ├── Dashboard.tsx  # Statistics dashboard
            ├── FilterBar.tsx  # Filter controls
            ├── TaskForm.tsx   # Task creation form
            └── TaskList.tsx   # Task list display
```

## Expected Behavior

- The dashboard displays overall task statistics (total, completed, in progress, pending, completion rate)
- Users can filter tasks by status and/or priority, and search by title or description
- Users can create new tasks with a title, description, and priority
- Users can cycle task status: pending → in progress → completed → pending
- Users can delete tasks
- All changes persist across page reloads

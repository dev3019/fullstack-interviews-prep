You are an experienced Engineering Manager / Tech Lead designing an interview-style debugging exercise for a senior-level software engineer.

Goal:
Create a small but realistic project that intentionally contains 2–3 non-trivial issues. The purpose of this project is to evaluate:
1. Problem-solving ability
2. Debugging skills
3. System understanding
4. Communication and reasoning during a live technical interview (~1 hour)

Tech Stack (must use exactly this):
- Backend: Python + FastAPI
- Frontend: React + TypeScript
- Local execution using Docker (preferably a single docker-compose or a single Docker image if possible)

Project Structure Constraints:
- The project must live inside a single subfolder (e.g. `/scenario-1`) inside the repository root.
- Do NOT modify anything outside this folder.
- The project must be runnable locally with clear instructions.

Issue Constraints:
- Introduce 2–3 intentional issues total (not more).
- The issues should be realistic and subtle, not obvious syntax errors.
- The issues may include a mix of:
  - Backend issue
  - Frontend issue
  - An issue that could be solved on either frontend or backend (but clearly better solved on one side)
  - A design-pattern or architectural issue
  - A cross-layer issue that requires understanding both frontend and backend to diagnose (the bug emerges from the interaction between layers, not from either layer in isolation)
- Do NOT include all categories—only a few.
- Each issue should require reasoning, not guesswork.
- Design at least one issue where multiple fixes are possible, but one is clearly more appropriate. The candidate should be able to explain why.
- Issues should be moderate-to-hard difficulty—not discoverable by casual clicking alone. They should require deliberate exploration (e.g., testing filters with edge cases, comparing API responses with UI display, checking data consistency).
- Every bug MUST produce a **visible symptom during normal usage patterns**. If the only way to discover a bug is to memorize page contents, cross-reference data across multiple views manually, or perform QA-level exhaustive verification, it is too hard for a 1-hour live interview. Good bugs surface when a candidate naturally tries a feature and notices something is off (e.g., wrong numbers, empty results, stale data, mismatched counts). The discovery path should be: use the app normally → notice something looks wrong → investigate → find root cause.
- Avoid bugs that depend on non-deterministic behavior (e.g., database row ordering) unless they produce a clearly visible, consistently reproducible symptom. A bug that "might" manifest depending on internal engine behavior is unreliable for evaluation.

Code Quality Constraints:
- The codebase MUST include basic error handling (try/except on backend, try/catch on frontend) and input validation (required fields, type checks, meaningful error messages).
- The goal is to prevent candidates from spending time flagging missing fundamentals (no validation, no error handling) instead of finding the planted bugs.
- Non-planted quality issues should be minimal and subtle—only candidates with strong attention to detail should notice them.
- Unused endpoints or dead code should be removed unless they serve a specific interview purpose.

Interview Realism:
- The project should appear to "mostly work" at first glance.
- Bugs should surface via:
  - Incorrect behavior
  - Edge cases
  - Performance or data consistency issues
  - Poor separation of concerns
  - Cross-layer mismatches (e.g., pagination metadata, data serialization)
- The candidate should be able to:
  - Reproduce the issue locally
  - Explain root cause
  - Propose and/or implement a fix
  - Justify trade-offs verbally

Deliverables:
1. Project folder with backend, frontend, and Docker setup
2. README.md (CANDIDATE-FACING — share this with the candidate) that explains:
   - How to run the project
   - Expected behavior stated clearly enough that candidates can distinguish intentional behavior from bugs (this is the product spec)
   - Project structure overview
   - The README must NOT reveal the bugs, but its "Expected Behavior" section should make it unambiguous when something is not working as intended (e.g., "The dashboard displays overall statistics regardless of active filters" or "Date ranges are inclusive on both ends")
3. INTERVIEW_GUIDE_{i}.md (CONFIDENTIAL — interviewer only, i - scenario number) containing:
   - The intentional issues with exact file locations
   - Step-by-step reproduction instructions
   - Expected fixes (ranked by quality where multiple fixes exist)
   - What signals each issue is testing (debugging, design, communication, etc.)
   - Strong vs. weak candidate behaviors for each issue
4. A grading rubric inside the interview guide (what a strong vs weak candidate does), with point-based scoring

Interview Flow:
- The candidate is given: the Docker commands to run the project, the localhost URLs, and the README.md
- The INTERVIEW_GUIDE.md is NOT shared with the candidate
- The candidate is asked to explore the app, find bugs, fix them, and communicate their reasoning
- Target time: ~1 hour (candidates should not finish all bugs comfortably in under 40 minutes)

Important Rules:
- Do NOT over-engineer.
- Do NOT add unnecessary features.
- Follow production-quality conventions even though this is a PoC.
- Keep the scope small enough to fit in a 1-hour interview.
- The issues must be fixable within the timebox.

Do not ask follow-up questions. Make reasonable assumptions and proceed.

# AI Tutor Project

This project implements an AI-powered tutoring system with a web-based chat interface. Students can ask questions and receive answers from an AI tutor, with features enhanced by Google Classroom integration.

## Project Structure

*   `/frontend`: Contains the React-based user interface.
*   `/backend`: Contains the Python FastAPI backend that handles business logic, AI model communication, and Google Classroom API interactions.

## Setup Instructions

### Prerequisites

*   Node.js and npm (for frontend)
*   Python 3.9+ and pip (for backend)
*   Access to Google Cloud, a configured OAuth 2.0 client ID and secret, and a Gemini API key.
*   A configured PostgreSQL database.

### Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create and activate a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    (Ensure `google-api-python-client` is included for Google Classroom integration, in addition to other dependencies like `fastapi`, `sqlalchemy`, `google-auth-oauthlib`, `google-generativeai`).

4.  **Configure environment variables:**
    *   Copy the example environment file: `cp .env.example .env`
    *   Edit the `.env` file with your specific configurations. Key variables include:
        *   `DATABASE_URL`: Your PostgreSQL connection string.
        *   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client ID and Secret.
        *   `GOOGLE_REDIRECT_URI`: Your Google OAuth redirect URI (e.g., `http://localhost:8000/auth/google/callback`).
        *   `JWT_SECRET_KEY`: A strong secret key for internal JWTs.
        *   `FRONTEND_URL`: The URL where your frontend is running (e.g., `http://localhost:3000`).
        *   `GEMINI_API_KEY`: Your API key for the Gemini AI model.
    *   **User Data:** The `User` model in the database now includes fields to store curriculum preferences (`selected_grade_level`, `curriculum_framework`) and Google API OAuth tokens (`google_access_token`, `google_refresh_token`, `google_token_expiry`, `google_granted_scopes`).

5.  **Curriculum Data:**
    *   The backend uses `backend/curriculum_data.json` to store curriculum structures. This is loaded by `curriculum_utils.py` for features like keyword-based standard identification (`find_relevant_standards`).

6.  **Database Initialization:**
    *   The application creates database tables based on SQLAlchemy models in `main.py` if they don't exist (via `Base.metadata.create_all(bind=engine)`). This includes the `users` table (with new Google token fields) and `user_curriculum_progress`.

7.  **Start the backend server:**
    ```bash
    uvicorn main:app --reload --port 8000
    ```

### Frontend Setup
(Instructions remain largely the same: `cd frontend`, `npm install`, `npm start`)

## Authentication and Permissions

### Google OAuth2 Flow
The application uses Google OAuth2 for user authentication. Upon login, it requests permissions (scopes) to access user profile information and, optionally, Google Workspace for Education data.

### Google Permissions (OAuth Scopes)
To enable integration with Google Workspace for Education, the application requests the following permissions:
*   **Basic Login:** `openid`, `userinfo.email`, `userinfo.profile`.
*   **Google Classroom (Read-only):**
    *   `https://www.googleapis.com/auth/classroom.courses.readonly`: To view your courses.
    *   `https://www.googleapis.com/auth/classroom.coursework.me.readonly`: To view your assignments in those courses.
*   *(Future integrations like Calendar, Drive, Meet will add their specific scopes here.)*
These permissions allow the AI Tutor to access educational data to provide a more personalized and context-aware experience. You can manage these permissions via your Google Account settings.

## API Overview

### User and Profile API
*   `GET /api/users/me`: Returns current authenticated user's details, including `selected_grade_level` and `curriculum_framework`.
*   `PUT /api/users/me/profile`: Updates curriculum preferences.

### Curriculum API
*   `GET /api/curriculum`: Fetches the curriculum structure from `backend/curriculum_data.json`, used by the frontend's Curriculum Browser.

### Google Classroom API Endpoints
*   `GET /api/classroom/courses`: Retrieves a list of the authenticated user's active Google Classroom courses. Requires `classroom.courses.readonly` scope.
*   `GET /api/classroom/courses/{course_id}/assignments`: Retrieves published assignments for the specified `course_id`. Requires `classroom.coursework.me.readonly` scope.

### AI Tutor API
*   `POST /api/askTutor`: Core AI interaction endpoint.
    *   Prioritizes `selected_standard_id` from the request (e.g., if user selected a standard in the UI).
    *   If no explicit standard is selected, uses `curriculum_utils.find_relevant_standards()` for keyword-based identification from the query.
    *   Uses user's profile (`selected_grade_level`, `curriculum_framework`) to tailor AI persona and scope search.
    *   Logs progress against identified/selected standards in `user_curriculum_progress` table.

## Key Features

### User Interface
*   **Authentication:** Google OAuth for login, including requesting Classroom permissions.
*   **Chat Interface:** Main interaction point with the AI.
    *   Can receive a curriculum focus (standard/topic) from the Curriculum Browser.
    *   Displays the active focus and allows clearing it.
    *   Sends `selected_standard_id` to the backend if a focus is active.
*   **Profile Settings:** Allows users to set `selected_grade_level` and `curriculum_framework`.
*   **Curriculum Browser (`/curriculum` route):**
    *   Enables navigation of curriculum data (subjects, grades, topics, standards).
    *   Allows selection of a standard/topic to focus on, then navigates to the chat interface with this context.
*   **Google Classroom Integration (`/classroom` route):**
    *   Displays a list of the user's Google Classroom courses.
    *   Allows viewing assignments for a selected course.

### AI Tutor Functionality
Powered by Google Gemini API, with enhanced curriculum and Classroom awareness.
*   **Curriculum Alignment:**
    *   **Contextual Prompts:** Uses user profile settings and identified/selected standards for tailored AI interaction.
    *   **Content Relevance:** AI is guided to stay on-topic.
    *   **Standard Identification:** Combines explicit user selection with keyword-based matching (`find_relevant_standards`).
*   **Progress Tagging:** Logs "practiced" standards.
*   **Google Classroom Context (Initial):** Can list user's courses and assignments, laying groundwork for deeper integration (e.g., tutor using assignment details in prompts).
*   **General Capabilities:** Query understanding, age-appropriate explanations, conversation context, safety filters.
```

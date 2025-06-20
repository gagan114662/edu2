# AI Tutor Project

This project implements an AI-powered tutoring system with a web-based chat interface. Students can ask questions and receive answers from an AI tutor.

## Project Structure

*   `/frontend`: Contains the React-based user interface.
*   `/backend`: Contains the Python FastAPI backend that handles business logic and communication with the AI model.

## Setup Instructions

### Prerequisites

*   Node.js and npm (for frontend)
*   Python 3.9+ and pip (for backend)
*   Access to Google Cloud and a Gemini API key.
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

4.  **Configure environment variables:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file with your specific configurations:
        *   `DATABASE_URL`: Your PostgreSQL connection string.
        *   `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
        *   `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret.
        *   `GOOGLE_REDIRECT_URI`: Your Google OAuth redirect URI (e.g., `http://localhost:8000/auth/google/callback`).
        *   `JWT_SECRET_KEY`: A strong secret key for JWTs.
        *   `FRONTEND_URL`: The URL where your frontend is running (e.g., `http://localhost:3000`).
        *   **`GEMINI_API_KEY`**: Your API key for the Gemini AI model. This is required for the AI tutor functionality.
    *   Note: The User profile in the database now also stores `selected_grade_level` and `curriculum_framework` for curriculum alignment features.

5.  **Curriculum Data:**
    *   The backend uses a `backend/curriculum_data.json` file to store curriculum structures (subjects, grades, frameworks, topics, standards). This file is loaded at runtime to provide context to the AI tutor. The basic structure is: `Subject -> Grade -> Framework -> Topic -> StandardID: {description, keywords}`.

6.  **Run database migrations (if applicable):**
    *   The current application creates tables on startup if they don't exist (`Base.metadata.create_all(bind=engine)` in `main.py`). This includes the `users` table (with new profile fields) and the `user_curriculum_progress` table. Ensure your database is running and accessible.

7.  **Start the backend server:**
    ```bash
    uvicorn main:app --reload --port 8000
    ```
    The backend should now be running on `http://localhost:8000`.

### Frontend Setup

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the frontend development server:**
    ```bash
    npm start
    ```
    The frontend should now be running on `http://localhost:3000` and will connect to the backend server.

## API Overview

### User Profile API
*   `GET /api/users/me`: Returns current user's details, now including `selected_grade_level` and `curriculum_framework`.
*   `PUT /api/users/me/profile`: Updates the current user's profile. Request body can include:
    *   `selected_grade_level` (string, optional)
    *   `curriculum_framework` (string, optional)

### AI Tutor API
*   `POST /api/askTutor`: This endpoint now leverages the `selected_grade_level` and `curriculum_framework` from the user's profile to provide curriculum-aligned responses. It also includes basic progress tagging for practiced curriculum standards (stored in `user_curriculum_progress` table).

## AI Tutor Feature

The AI tutor uses the Google Gemini API to generate responses. Ensure your `GEMINI_API_KEY` is correctly set in the backend's `.env` file for this feature to work.

The AI tutor now aligns its responses with K-12 curriculum standards based on the student's profile settings.
Key enhancements include:
*   **Curriculum-Aware Prompts:** The system uses the `selected_grade_level` and `curriculum_framework` (e.g., "Grade 5", "Common Core Math") from the user's profile to tailor the AI's persona and instructions.
*   **Content Relevance:** The AI is instructed to stay within the scope of the specified curriculum, gently redirecting off-topic queries.
*   **Curriculum Data:** A `curriculum_data.json` file provides the structural information for subjects, grades, topics, and standards used for context.
*   **Progress Tagging (Basic):** The system includes a mechanism to log curriculum standards that have been "practiced" during tutoring sessions. This is stored in the `user_curriculum_progress` table in the database. (Note: Specific standard identification from queries is currently basic and will be enhanced in future iterations).

The tutor is also designed to:
*   Understand student queries.
*   Provide age-appropriate explanations.
*   Maintain conversation context.
*   Adhere to content safety guidelines via Gemini API's built-in filters.
```

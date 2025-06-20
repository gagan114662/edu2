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
    *   Edit the `.env` file with your specific configurations (see `.env.example` for all options). Key variables include `DATABASE_URL`, Google OAuth credentials, `JWT_SECRET_KEY`, `FRONTEND_URL`, and `GEMINI_API_KEY`.
    *   Note: The User profile in the database now also stores `selected_grade_level` and `curriculum_framework` for curriculum alignment features.

5.  **Curriculum Data:**
    *   The backend uses a `backend/curriculum_data.json` file to store curriculum structures (subjects, grades, frameworks, topics, standards). This file is loaded by `curriculum_utils.py` at runtime to provide context to the AI tutor, primarily via the `find_relevant_standards` function which performs keyword-based matching. The basic structure is: `Subject -> Grade -> Framework -> Topic -> StandardID: {description, keywords}`.

6.  **Run database migrations (if applicable):**
    *   The application uses SQLAlchemy and creates tables based on model definitions in `main.py` if they don't exist (`Base.metadata.create_all(bind=engine)`). This includes the `users` table (with curriculum profile fields) and the `user_curriculum_progress` table. Ensure your database is running and accessible.

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
    The frontend should now be running on `http://localhost:3000` and will connect to the backend API.

## API Overview

### User and Profile API
*   `GET /api/users/me`: Returns current authenticated user's details, including `selected_grade_level` and `curriculum_framework`.
*   `PUT /api/users/me/profile`: Updates the current user's profile. Request body can include:
    *   `selected_grade_level` (string, optional)
    *   `curriculum_framework` (string, optional)

### Curriculum API
*   `GET /api/curriculum`: Fetches the entire curriculum structure from `backend/curriculum_data.json`. This is used by the frontend to power the Curriculum Browser. The response is currently the raw JSON data.

### AI Tutor API
*   `POST /api/askTutor`: This endpoint is the core of the AI tutor.
    *   It attempts to identify a specific curriculum standard relevant to the user's query. If a `selected_standard_id` is provided in the request (e.g., from the Curriculum Browser), that standard is prioritized. Otherwise, it performs a keyword-based search using `curriculum_utils.find_relevant_standards()` based on the query text.
    *   The user's profile settings for `selected_grade_level` and `curriculum_framework` are used to scope the standard search and tailor the AI's persona.
    *   Progress on identified or selected standards is tagged in the `user_curriculum_progress` table.

## Key Features

### User Interface
*   **Authentication:** Google OAuth for user login.
*   **Chat Interface:** Main interface for interacting with the AI tutor. It can now:
    *   Receive a curriculum focus (a specific standard or topic) selected from the Curriculum Browser.
    *   Display the active curriculum focus to the user (e.g., "Current Focus: Adding Fractions").
    *   Provide a "Clear Focus" button to return to general Q&A.
    *   Transmit the `selected_standard_id` to the backend when a focus is active.
*   **Profile Settings:** Users can set their preferred `selected_grade_level` and `curriculum_framework`.
*   **Curriculum Browser:** Accessible via the `/curriculum` route, this feature allows users to:
    *   Navigate the available curriculum structure (subjects, grades, topics, down to specific standards).
    *   Select a standard or topic they wish to focus on.
    *   Initiate a tutoring session focused on the selected item by clicking "Practice This" (or similar), which directs them to the main chat interface with the chosen item as the active context.

### AI Tutor Functionality
The AI tutor uses the Google Gemini API to generate responses. Ensure your `GEMINI_API_KEY` is correctly set in the backend's `.env` file.
*   **Curriculum Alignment:** The tutor now aligns its responses with K-12 curriculum standards.
    *   **Contextual Prompts:** The system uses `selected_grade_level`, `curriculum_framework` (from user profile), and any identified/selected specific standard to tailor the AI's persona and instructions.
    *   **Content Relevance:** The AI is instructed to stay within the scope of the specified curriculum, gently redirecting off-topic queries.
    *   **Standard Identification:** Uses `curriculum_data.json` and the `find_relevant_standards` utility for keyword-based matching of queries to standards, or prioritizes user's explicit selection from the browser.
*   **Progress Tagging (Basic):** The system logs curriculum standards that have been "practiced" during tutoring sessions in the `user_curriculum_progress` database table.
*   **General Capabilities:**
    *   Understands student queries.
    *   Provides age-appropriate explanations.
    *   Maintains conversation context.
    *   Adheres to content safety guidelines via Gemini API's built-in filters.
```

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

5.  **Run database migrations (if applicable):**
    *   The current application creates tables on startup if they don't exist (`Base.metadata.create_all(bind=engine)` in `main.py`). Ensure your database is running and accessible.

6.  **Start the backend server:**
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

## AI Tutor Feature

The AI tutor uses the Google Gemini API to generate responses. Ensure your `GEMINI_API_KEY` is correctly set in the backend's `.env` file for this feature to work.

The tutor is designed to:
*   Understand student queries.
*   Provide age-appropriate explanations (currently defaults to "middle school" level, configurable in future).
*   Maintain conversation context.
*   Adhere to content safety guidelines via Gemini API's built-in filters.

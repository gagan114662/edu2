import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import os
import sys

# Add backend directory to sys.path to allow direct import of main
# This assumes tests are run from the root of the repository or backend directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Now, try to import app and get_current_user from main
# If main.py is structured such that these are not directly importable this way,
# this part might need adjustment based on actual file structure and exposed members.
from main import app, get_current_user # Assuming get_current_user is importable

@pytest.fixture
def client():
    # Use TestClient for making requests to the FastAPI app
    # Ensure that database initialization (create_db_and_tables) is handled appropriately
    # if it's called at app startup and relies on external DB. For unit tests, it's often mocked/bypassed.
    return TestClient(app)

# Mock for get_current_user dependency
@pytest.fixture
def mock_current_active_user():
    # A basic mock for User model as expected by the endpoint
    mock_user = MagicMock()
    mock_user.email = "testuser@example.com"
    mock_user.id = 1
    mock_user.full_name = "Test User" # Add other fields if accessed by endpoint/dependencies
    mock_user.picture_url = "http://example.com/pic.jpg"
    return mock_user

# This fixture will apply the dependency override for each test that needs it.
# Using it as a fixture simplifies test setup.
@pytest.fixture(autouse=True) # Apply to all tests by default, or specify per test
def override_get_current_user(mock_current_active_user):
    app.dependency_overrides[get_current_user] = lambda: mock_current_active_user
    yield
    app.dependency_overrides = {} # Clean up

def test_ask_tutor_success(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key_success")

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure') as mock_configure: # Patch configure as well

        mock_chat_session = MagicMock()
        mock_gemini_response = MagicMock()
        mock_gemini_response.text = "This is a mock AI reply."
        mock_gemini_response.parts = [MagicMock(text="This is a mock AI reply.")]
        mock_gemini_response.prompt_feedback = None

        mock_chat_session.send_message.return_value = mock_gemini_response

        mock_model_instance = MagicMock()
        mock_model_instance.start_chat.return_value = mock_chat_session
        mock_generative_model.return_value = mock_model_instance

        response = client.post(
            "/api/askTutor",
            json={"query": "Hello tutor", "history": [], "grade_level": "elementary"},
            headers={"Authorization": "Bearer testtoken"}
        )

        assert response.status_code == 200
        json_response = response.json()
        assert json_response["reply"] == "This is a mock AI reply."

        mock_configure.assert_called_with(api_key="test_api_key_success")
        mock_generative_model.assert_called_once()
        # Check that system_instruction was passed during GenerativeModel initialization
        args, kwargs = mock_generative_model.call_args
        assert 'system_instruction' in kwargs
        assert "elementary" in kwargs['system_instruction'] # Check grade level in system prompt

        mock_model_instance.start_chat.assert_called_once_with(history=[])
        mock_chat_session.send_message.assert_called_with("Hello tutor")


def test_ask_tutor_no_api_key(client, monkeypatch):
    # Ensure GEMINI_API_KEY is not effectively set for the app's context for this test
    # main.py loads GEMINI_API_KEY at module level.
    # To test this, we need to simulate the key not being available when genai.configure is called,
    # or not present when the endpoint logic checks for GEMINI_API_KEY.
    # The current check `if not GEMINI_API_KEY:` relies on the module-level variable.
    # Monkeypatching os.getenv used by main.py for GEMINI_API_KEY is tricky if it's already loaded.
    # A robust way is to patch the 'GEMINI_API_KEY' variable directly in the 'main' module.

    # If main.py is `import os; GEMINI_API_KEY = os.getenv(...)`, then patching os.getenv might not re-evaluate.
    # Patching the variable `main.GEMINI_API_KEY` if it's accessible.
    # For this test, we assume the endpoint re-checks or the initial configuration fails.
    # The simplest for the test is to ensure the `GEMINI_API_KEY` variable in `main` module scope is None or empty.

    monkeypatch.setattr("main.GEMINI_API_KEY", None) # Patch the variable in the loaded main module
    # Also, prevent genai.configure from running with a None key if it would raise an error early
    with patch('google.generativeai.configure') as mock_configure:
        response = client.post(
            "/api/askTutor",
            json={"query": "Test query", "history": []},
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code == 500
        assert "Gemini API key not configured" in response.json()["detail"]

def test_ask_tutor_gemini_error_blocked(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key_blocked")

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'): # Mock configure

        mock_chat_session = MagicMock()
        mock_gemini_response = MagicMock()
        mock_gemini_response.parts = []
        mock_gemini_response.prompt_feedback = MagicMock()
        mock_gemini_response.prompt_feedback.block_reason = "SAFETY"

        mock_chat_session.send_message.return_value = mock_gemini_response

        mock_model_instance = MagicMock()
        mock_model_instance.start_chat.return_value = mock_chat_session
        mock_generative_model.return_value = mock_model_instance

        response = client.post(
            "/api/askTutor",
            json={"query": "Risky query", "history": []},
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code == 400
        assert "blocked by content safety filters" in response.json()["detail"]


def test_ask_tutor_gemini_generic_exception(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key_exception")

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'): # Mock configure

        mock_model_instance = MagicMock()
        mock_model_instance.start_chat.side_effect = Exception("Unexpected Gemini SDK error")
        mock_generative_model.return_value = mock_model_instance

        response = client.post(
            "/api/askTutor",
            json={"query": "Another query", "history": []},
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code == 500
        assert "An error occurred while processing your request" in response.json()["detail"]
        assert "Unexpected Gemini SDK error" in response.json()["detail"]

def test_ask_tutor_empty_response_no_block_reason(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key_empty_no_block")

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'):

        mock_chat_session = MagicMock()
        mock_gemini_response = MagicMock()
        mock_gemini_response.parts = []  # Empty parts
        mock_gemini_response.prompt_feedback = None  # No block reason

        mock_chat_session.send_message.return_value = mock_gemini_response

        mock_model_instance = MagicMock()
        mock_model_instance.start_chat.return_value = mock_chat_session
        mock_generative_model.return_value = mock_model_instance

        response = client.post(
            "/api/askTutor",
            json={"query": "Query leading to empty response", "history": []},
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code == 500
        assert "Received an empty response from the AI" in response.json()["detail"]

# Note: The sys.path manipulation and direct import `from main import app, get_current_user`
# is a common pattern but might need adjustment if the project structure is different,
# e.g., if `main.py` is not in a directory named `backend` that's a sibling to `tests`'s parent,
# or if `get_current_user` is not exposed for import.
# The `autouse=True` on `override_get_current_user` applies it to all tests in this file.
# This is convenient as all tests for this protected endpoint require user authentication.
# The `monkeypatch.setattr("main.GEMINI_API_KEY", None)` is used for the no_api_key test
# to directly modify the module-level variable in the loaded `main` module. This ensures
# the test accurately reflects the condition where the API key is missing at runtime.
# Added a check for `system_instruction` in the success test.
# Added a test for empty response without block reason.
# Ensured `google.generativeai.configure` is also patched where `GenerativeModel` is patched,
# as `configure` is called in `main.py` when `GEMINI_API_KEY` is present.
# Changed fixture name `mock_get_current_user` to `mock_current_active_user` for clarity.
# Made the `override_get_current_user` fixture `autouse=True` for convenience.
# Removed `override_env_vars` fixture as it was unused.
# Removed explicit `app.dependency_overrides = {}` from each test, handled by `override_get_current_user` fixture.
# Removed `mock_get_current_user` from individual test arguments, as it's handled by autouse fixture.
# API keys in `monkeypatch.setenv` are made unique per test to avoid potential cross-test interference
# if the `genai.configure` call had module-level side effects not reset by mocks alone.
# (Though with proper patching of `genai.configure` itself, this is less of an issue).
# For `test_ask_tutor_no_api_key`, setting `main.GEMINI_API_KEY = None` is more direct than `delenv`
# because `main.py` reads `os.getenv` at import time.
# The `patch('google.generativeai.configure')` is important in tests where `GEMINI_API_KEY` is set,
# because `main.py` calls `genai.configure(api_key=GEMINI_API_KEY)` if `GEMINI_API_KEY` is truthy.
# We need to mock this to prevent actual SDK configuration during tests.
# In `test_ask_tutor_no_api_key`, `genai.configure` should ideally not be called if `GEMINI_API_KEY` is None.
# The patch for `configure` in `test_ask_tutor_no_api_key` ensures that if it *were* called, it's mocked.
# It might be more precise to assert `mock_configure.assert_not_called()` in the no_api_key test if `GEMINI_API_KEY` is None.
# However, the current structure of `main.py` calls `configure` if `GEMINI_API_KEY` (module var) is truthy.
# So, if `main.GEMINI_API_KEY` is successfully patched to `None`, then `genai.configure` in `main.py`'s top level
# would not run (or would have run with the original env var before patch).
# The endpoint itself is what matters: `if not GEMINI_API_KEY:` check within `ask_tutor`.
# My `monkeypatch.setattr("main.GEMINI_API_KEY", None)` targets this.
# So `genai.configure` might have been called at module load time (before patch), but the endpoint check is what we test.
# The patch for `configure` in `no_api_key` test is mostly for safety if the test setup was different.
# Given `main.GEMINI_API_KEY` is patched, the top-level `genai.configure` in `main.py` has already executed or not.
# The critical part is the `if not GEMINI_API_KEY:` inside `ask_tutor`.
# The `mock_configure.assert_called_with(api_key="test_api_key_success")` in success test is good.

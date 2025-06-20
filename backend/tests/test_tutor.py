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
from main import app, get_current_user, get_db # Assuming these are importable
from google.oauth2.credentials import Credentials # For type hinting mock

# Import UserCurriculumProgress for type checking if needed, or rely on MagicMock structure
# from main import UserCurriculumProgress

@pytest.fixture
def client():
    return TestClient(app)

# Mock for get_current_user dependency
@pytest.fixture
def mock_current_active_user():
    # A basic mock for User model as expected by the endpoint
    mock_user = MagicMock()
    mock_user.email = "testuser@example.com"
    mock_user.id = 1
    mock_user.full_name = "Test User"
    mock_user.picture_url = "http://example.com/pic.jpg"
    # Initialize curriculum fields, can be overridden in specific tests
    mock_user.selected_grade_level = None
    mock_user.curriculum_framework = None
    return mock_user

# This fixture will apply the get_current_user dependency override for each test.
# Using it as a fixture simplifies test setup.
@pytest.fixture(autouse=True) # Apply to all tests by default, or specify per test
def override_get_current_user(mock_current_active_user):
    app.dependency_overrides[get_current_user] = lambda: mock_current_active_user
    yield
    app.dependency_overrides = {} # Clean up

def test_ask_tutor_success(client, mock_current_active_user, monkeypatch): # Added mock_current_active_user to args
    # Configure user profile for this test
    mock_current_active_user.selected_grade_level = "Grade 5"
    mock_current_active_user.curriculum_framework = "Common Core"

    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_ask_success")
    # This test will now also involve find_relevant_standards, mock it to return empty
    monkeypatch.setattr("main.curriculum_utils.find_relevant_standards", MagicMock(return_value=[]))


    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure') as mock_configure_sdk:

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
        # Assert that user's profile settings are in the system prompt
        assert "student is in Grade 5" in kwargs['system_instruction']
        assert "following the Common Core curriculum" in kwargs['system_instruction']
        # Ensure find_relevant_standards is not the source of standard info here, if applicable
        # (This test does not involve explicit selected_standard_id, so find_relevant_standards would run)

        mock_model_instance.start_chat.assert_called_once_with(history=[])
        mock_chat_session.send_message.assert_called_with("Hello tutor")


def test_ask_tutor_with_explicit_selected_standard(client, mock_current_active_user, monkeypatch):
    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_explicit_std")

    mock_standard_details = {
        "description": "Explicit standard description for testing.",
        "keywords": ["explicit", "test"]
    }
    # Patch get_standard_details in the 'main' module where it's imported as 'curriculum_utils'
    monkeypatch.setattr("main.curriculum_utils.get_standard_details", MagicMock(return_value=mock_standard_details))
    # find_relevant_standards should not be called if an explicit standard is found
    monkeypatch.setattr("main.curriculum_utils.find_relevant_standards", MagicMock(return_value=[]))

    # Mock database interactions for progress tagging
    # This requires 'get_db' to be importable: from main import get_db
    # And UserCurriculumProgress: from main import UserCurriculumProgress
    # For simplicity of this subtask, we'll mock the commit on the session.
    # A more robust way involves a mock session that mimics SQLAlchemy behavior.
    mock_db_session_instance = MagicMock()
    from main import get_db # Ensure get_db is available for override
    app.dependency_overrides[get_db] = lambda: mock_db_session_instance

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'): # Mock configure
        mock_model_instance = MagicMock()
        mock_chat_session = MagicMock()
        mock_gemini_response = MagicMock(text="AI reply for explicit standard.", parts=[MagicMock()])
        mock_chat_session.send_message.return_value = mock_gemini_response
        mock_model_instance.start_chat.return_value = mock_chat_session
        mock_generative_model.return_value = mock_model_instance

        test_standard_id = "EXPLICIT.ID.1"
        response = client.post(
            "/api/askTutor",
            json={
                "query": "Tell me about this.",
                "selected_standard_id": test_standard_id, # Explicit standard ID
                "history": []
            },
        )
        assert response.status_code == 200
        assert response.json()["reply"] == "AI reply for explicit standard."

        main.curriculum_utils.get_standard_details.assert_called_with(test_standard_id)
        main.curriculum_utils.find_relevant_standards.assert_not_called()

        args, kwargs_model = mock_generative_model.call_args
        system_instruction = kwargs_model.get("system_instruction", "")
        assert "Explicit standard description for testing." in system_instruction

        # Check progress tagging: commit on the db session mock should be called
        mock_db_session_instance.commit.assert_called_once()

    app.dependency_overrides.pop(get_db, None) # Clean up specific override


def test_ask_tutor_with_keyword_identified_standard(client, mock_current_active_user, monkeypatch):
    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_keyword_std")
    mock_found_standard = {
        "standard_id": "KEYWORD.ID.1",
        "description": "Keyword-based standard description.",
        "keywords": ["keyword", "test"],
        "score": 3
    }
    monkeypatch.setattr("main.curriculum_utils.find_relevant_standards", MagicMock(return_value=[mock_found_standard]))
    # get_standard_details should not be called if request.selected_standard_id is None
    monkeypatch.setattr("main.curriculum_utils.get_standard_details", MagicMock(return_value=None))

    mock_db_session_instance = MagicMock()
    from main import get_db
    app.dependency_overrides[get_db] = lambda: mock_db_session_instance

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'):
        mock_model_instance = MagicMock()
        mock_chat_session = MagicMock()
        mock_gemini_response = MagicMock(text="AI reply for keyword standard.", parts=[MagicMock()])
        mock_chat_session.send_message.return_value = mock_gemini_response
        mock_model_instance.start_chat.return_value = mock_chat_session
        mock_generative_model.return_value = mock_model_instance

        response = client.post(
            "/api/askTutor",
            json={"query": "Tell me about keywords.", "history": []} # No selected_standard_id
        )
        assert response.status_code == 200
        assert response.json()["reply"] == "AI reply for keyword standard."

        main.curriculum_utils.find_relevant_standards.assert_called_once()
        main.curriculum_utils.get_standard_details.assert_not_called() # Because no explicit ID was passed

        args, kwargs_model = mock_generative_model.call_args
        system_instruction = kwargs_model.get("system_instruction", "")
        assert "Keyword-based standard description." in system_instruction

        mock_db_session_instance.commit.assert_called_once()

    app.dependency_overrides.pop(get_db, None)


def test_ask_tutor_no_standard_identified(client, mock_current_active_user, monkeypatch):
    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_no_std")
    monkeypatch.setattr("main.curriculum_utils.find_relevant_standards", MagicMock(return_value=[])) # No keyword match
    monkeypatch.setattr("main.curriculum_utils.get_standard_details", MagicMock(return_value=None)) # No explicit match

    mock_current_active_user.selected_grade_level = "Grade K" # Example fallback

    mock_db_session_instance = MagicMock()
    from main import get_db
    app.dependency_overrides[get_db] = lambda: mock_db_session_instance

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'):
        # ... (Gemini mocking) ...
        mock_model_instance = MagicMock() # ...
        mock_chat_session = MagicMock() # ...
        mock_gemini_response = MagicMock(text="General AI reply.", parts=[MagicMock()]) # ...
        mock_chat_session.send_message.return_value = mock_gemini_response # ...
        mock_model_instance.start_chat.return_value = mock_chat_session # ...
        mock_generative_model.return_value = mock_model_instance # ...

        response = client.post(
            "/api/askTutor",
            json={"query": "A very general question.", "history": []}
        )
        assert response.status_code == 200
        args, kwargs_model = mock_generative_model.call_args
        system_instruction = kwargs_model.get("system_instruction", "")
        assert "student is in Grade K" in system_instruction # Uses profile/request grade
        assert "learning focus" not in system_instruction # No specific standard description

        # Progress tagging should not commit if no standard_id
        mock_db_session_instance.commit.assert_not_called()

    app.dependency_overrides.pop(get_db, None)


def test_ask_tutor_no_user_profile_uses_request_grade(client, mock_current_active_user, monkeypatch):
    mock_current_active_user.selected_grade_level = None
    mock_current_active_user.curriculum_framework = None

    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_ask_no_profile")
    # Ensure find_relevant_standards is mocked if it's called in this path
    monkeypatch.setattr("main.curriculum_utils.find_relevant_standards", MagicMock(return_value=[]))

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'):

        mock_chat_session = MagicMock()
        mock_gemini_response = MagicMock()
        mock_gemini_response.text = "Reply for elementary."
        mock_gemini_response.parts = [MagicMock(text="Reply for elementary.")]
        mock_gemini_response.prompt_feedback = None
        mock_chat_session.send_message.return_value = mock_gemini_response
        mock_model_instance = MagicMock()
        mock_model_instance.start_chat.return_value = mock_chat_session
        mock_generative_model.return_value = mock_model_instance

        response = client.post(
            "/api/askTutor",
            json={"query": "Hello", "history": [], "grade_level": "elementary school"}, # Fallback grade in request
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code == 200
        json_response = response.json()
        assert json_response["reply"] == "Reply for elementary."

        args, kwargs = mock_generative_model.call_args
        assert 'system_instruction' in kwargs
        assert "student is in elementary school" in kwargs['system_instruction']
        assert "curriculum" not in kwargs['system_instruction'].lower()
        assert "learning focus" not in kwargs['system_instruction']


def test_ask_tutor_no_api_key(client, monkeypatch):
    monkeypatch.setattr("main.GEMINI_API_KEY", None)
    with patch('google.generativeai.configure'): # Ensure configure is mocked if it's called at module level
        response = client.post(
            "/api/askTutor",
            json={"query": "Test query", "history": []}, # grade_level is optional
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code == 500
        assert "Gemini API key not configured" in response.json()["detail"]

def test_ask_tutor_gemini_error_blocked(client, monkeypatch):
    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_blocked")

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'):

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
    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_exception")

    with patch('google.generativeai.GenerativeModel') as mock_generative_model, \
         patch('google.generativeai.configure'):

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
    monkeypatch.setattr("main.GEMINI_API_KEY", "test_api_key_empty_no_block")

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

# Tests for /api/users/me/profile PUT endpoint
def test_update_user_profile_success(client, mock_current_active_user, monkeypatch):
    # Ensure the mock user allows attribute assignment for the fields being updated
    mock_current_active_user.selected_grade_level = "Initial Grade"
    mock_current_active_user.curriculum_framework = "Initial Framework"

    update_data = {
        "selected_grade_level": "Updated Grade 5",
        "curriculum_framework": "Updated Common Core"
    }

    # Mock db session if needed for commit/refresh, though TestClient often handles this for simple cases.
    # For this test, we assume the endpoint's db operations on current_user (mocked) are sufficient.

    response = client.put(
        "/api/users/me/profile",
        json=update_data,
        headers={"Authorization": "Bearer testtoken"}
    )

    assert response.status_code == 200
    json_response = response.json()

    assert json_response["selected_grade_level"] == "Updated Grade 5"
    assert json_response["curriculum_framework"] == "Updated Common Core"

    # Verify that the mock_current_active_user object was actually updated
    assert mock_current_active_user.selected_grade_level == "Updated Grade 5"
    assert mock_current_active_user.curriculum_framework == "Updated Common Core"

def test_update_user_profile_partial_update(client, mock_current_active_user, monkeypatch):
    mock_current_active_user.selected_grade_level = "Grade 8"
    mock_current_active_user.curriculum_framework = "Old Framework" # This should persist

    update_data = {
        "selected_grade_level": "Grade 9"
        # curriculum_framework is not provided, so it should not change
    }

    response = client.put(
        "/api/users/me/profile",
        json=update_data,
        headers={"Authorization": "Bearer testtoken"}
    )
    assert response.status_code == 200
    json_response = response.json()

    assert json_response["selected_grade_level"] == "Grade 9"
    assert json_response["curriculum_framework"] == "Old Framework" # Assert it remained unchanged

    assert mock_current_active_user.selected_grade_level == "Grade 9"
    assert mock_current_active_user.curriculum_framework == "Old Framework"


def test_update_user_profile_unauthenticated(client, monkeypatch):
    # Temporarily remove the global dependency override for this test
    app.dependency_overrides = {}

    response = client.put(
        "/api/users/me/profile",
        json={"selected_grade_level": "Unauth Grade"}
        # No Authorization header
    )
    assert response.status_code == 401 # Expecting 401 due to missing token / failed auth

    # Restore the override for other tests if not using autouse=True on a specific fixture for cleanup
    # Note: The autouse=True fixture `override_get_current_user` will re-apply itself for the next test.


# Note: The sys.path manipulation and direct import `from main import app, get_current_user`
# is a common pattern but might need adjustment if the project structure is different.
# Autouse fixture for get_current_user is convenient.
# Patching main.GEMINI_API_KEY directly via monkeypatch.setattr is used for API key tests.
# Patching main.curriculum_utils.* functions via monkeypatch.setattr is used for curriculum logic tests.

# Tests for Google Classroom API endpoints
@patch('backend.main.google_api_utils.get_google_api_credentials')
@patch('backend.main.classroom_service.get_courses')
def test_get_classroom_courses_success(mock_service_get_courses, mock_get_creds, client, mock_current_active_user):
    mock_creds_object = MagicMock(spec=Credentials) # Create a mock that matches Credentials spec
    mock_creds_object.scopes = ["https://www.googleapis.com/auth/classroom.courses.readonly"] # Example scope
    mock_get_creds.return_value = mock_creds_object

    mock_service_get_courses.return_value = [
        {"id": "1", "name": "Course A", "descriptionHeading": "Desc A", "courseState": "ACTIVE", "alternateLink": "linkA"},
    ]

    response = client.get("/api/classroom/courses")

    assert response.status_code == 200
    json_data = response.json()
    assert len(json_data) == 1
    assert json_data[0]["name"] == "Course A"
    # Assert that get_google_api_credentials was called with the user and a db session
    mock_get_creds.assert_called_once()
    # Check first arg of first call (current_user) and type of second arg (db_session)
    assert mock_get_creds.call_args[0][0] == mock_current_active_user
    assert hasattr(mock_get_creds.call_args[0][1], 'commit') # Check if it looks like a session

    mock_service_get_courses.assert_called_once_with(mock_creds_object)


@patch('backend.main.google_api_utils.get_google_api_credentials')
def test_get_classroom_courses_no_creds(mock_get_creds, client, mock_current_active_user):
    mock_get_creds.return_value = None

    response = client.get("/api/classroom/courses")
    assert response.status_code == 401
    assert "credentials are not available" in response.json()["detail"].lower()


@patch('backend.main.google_api_utils.get_google_api_credentials')
@patch('backend.main.classroom_service.get_assignments')
def test_get_classroom_assignments_success(mock_service_get_assignments, mock_get_creds, client, mock_current_active_user):
    mock_creds_object = MagicMock(spec=Credentials)
    mock_creds_object.scopes = ["https://www.googleapis.com/auth/classroom.coursework.me.readonly"]
    mock_get_creds.return_value = mock_creds_object

    mock_service_get_assignments.return_value = [
        {"id": "as1", "title": "Assignment 1", "dueDate": "2023-12-01"},
    ]

    test_course_id = "test_course_123"
    response = client.get(f"/api/classroom/courses/{test_course_id}/assignments")

    assert response.status_code == 200
    json_data = response.json()
    assert len(json_data) == 1
    assert json_data[0]["title"] == "Assignment 1"

    mock_get_creds.assert_called_once()
    assert mock_get_creds.call_args[0][0] == mock_current_active_user

    mock_service_get_assignments.assert_called_with(mock_creds_object, test_course_id)

@patch('backend.main.google_api_utils.get_google_api_credentials')
def test_get_classroom_assignments_no_creds(mock_get_creds, client, mock_current_active_user):
    mock_get_creds.return_value = None

    response = client.get("/api/classroom/courses/any_course_id/assignments")
    assert response.status_code == 401
    assert "credentials are not available" in response.json()["detail"].lower()

@patch('backend.main.google_api_utils.get_google_api_credentials')
@patch('backend.main.classroom_service.get_assignments', side_effect=Exception("Service Error"))
def test_get_classroom_assignments_service_error(mock_service_get_assignments, mock_get_creds, client, mock_current_active_user):
    mock_creds_object = MagicMock(spec=Credentials)
    mock_get_creds.return_value = mock_creds_object

    response = client.get("/api/classroom/courses/course_error_id/assignments")
    assert response.status_code == 502 # Bad Gateway as per endpoint's error handling
    assert "error occurred while fetching assignments" in response.json()["detail"].lower()
    assert "Service Error" in response.json()["detail"]

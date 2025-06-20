import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.main import app, UserResponse # UserResponse for /api/users/me typing
from jose import jwt # For creating test tokens
from datetime import timedelta, datetime, timezone

# Helper to create a token for testing protected endpoints
def create_test_access_token(email: str, secret_key: str, algorithm: str, expires_delta_minutes: int = 15):
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_delta_minutes)
    to_encode = {"sub": email, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    return encoded_jwt

# Test for /auth/google/login
@patch('backend.main.GoogleFlow') # Mock the GoogleFlow class itself
def test_google_login_redirect(MockGoogleFlowClass, test_client: TestClient):
    # This is the mock instance that will be returned when GoogleFlow(...) is called in main.py
    mock_flow_instance = MockGoogleFlowClass.return_value
    mock_flow_instance.authorization_url.return_value = ("https://accounts.google.com/o/oauth2/auth?testparams", "test_state")

    response = test_client.get("/auth/google/login")

    assert response.status_code == 307
    assert "https://accounts.google.com/o/oauth2/auth?testparams" in response.headers["location"]
    # Check that the GoogleFlow class was instantiated
    MockGoogleFlowClass.assert_called_once()
    # Check that authorization_url was called on the instance
    mock_flow_instance.authorization_url.assert_called_once()

def test_root_path(test_client: TestClient):
    response = test_client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "AI Tutor Backend - Enhanced"}

# Test for /auth/google/callback
@patch('backend.main.GoogleFlow') # Mock the GoogleFlow class
@patch('backend.main.requests.get')
def test_google_callback(mock_requests_get, MockGoogleFlowClass, test_client: TestClient, db_session):
    # This is the mock instance that will be returned when GoogleFlow(...) is called in main.py
    mock_flow_instance = MockGoogleFlowClass.return_value

    mock_credentials_obj = MagicMock() # This object will represent flow.credentials
    mock_credentials_obj.token = "mock_google_api_token"

    # Configure fetch_token: when called, it should result in flow.credentials being set.
    # We can achieve this by having fetch_token's side_effect modify the mock_flow_instance.
    def fetch_token_side_effect(code):
        mock_flow_instance.credentials = mock_credentials_obj # Simulate fetch_token setting credentials
        return None # fetch_token itself returns None

    mock_flow_instance.fetch_token.side_effect = fetch_token_side_effect

    # Configure requests.get mock for Google user info
    mock_user_info = {
        "email": "testuser@example.com",
        "name": "Test User",
        "picture": "http://example.com/picture.jpg"
    }
    mock_requests_get.return_value.json.return_value = mock_user_info
    mock_requests_get.return_value.raise_for_status = MagicMock()

    # Make the call to the callback endpoint
    test_code = "test_auth_code"
    response = test_client.get(f"/auth/google/callback?code={test_code}")

    assert response.status_code == 307 # Redirect to frontend

    # Check if user was created/updated in DB (using db_session from conftest)
    from backend.main import User # Import User model
    user_in_db = db_session.query(User).filter(User.email == "testuser@example.com").first()
    assert user_in_db is not None
    assert user_in_db.full_name == "Test User"
    assert user_in_db.picture_url == "http://example.com/picture.jpg"

    # Assert redirect URL structure (to frontend)
    redirect_url = response.headers["location"]
    assert "http://localhost:3000/auth/callback" in redirect_url # Assuming FRONTEND_URL is "http://localhost:3000"
    assert "token=" in redirect_url
    assert "token_type=bearer" in redirect_url

    # Verify mocks were called
    mock_flow_instance.fetch_token.assert_called_with(code=test_code)
    mock_requests_get.assert_called_once_with(
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
        headers={"Authorization": f"Bearer {mock_credentials.token}"}
    )

# Test for /api/auth/logout
def test_logout_unauthenticated(test_client: TestClient):
    response = test_client.post("/api/auth/logout")
    # Expect 401 or 403 if not authenticated. FastAPI's Depends(oauth2_scheme) returns 401.
    assert response.status_code == 401

def test_logout_authenticated(test_client: TestClient, db_session):
    # Create a dummy user for get_current_user to find
    from backend.main import User, JWT_SECRET_KEY, ALGORITHM
    test_email = "logouttest@example.com"
    user = User(email=test_email, full_name="Logout Test")
    db_session.add(user)
    db_session.commit()

    token = create_test_access_token(test_email, JWT_SECRET_KEY, ALGORITHM)

    response = test_client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Logout acknowledged successfully"}

# Test for /api/users/me
def test_get_me_unauthenticated(test_client: TestClient):
    response = test_client.get("/api/users/me")
    assert response.status_code == 401

def test_get_me_authenticated(test_client: TestClient, db_session):
    from backend.main import User, JWT_SECRET_KEY, ALGORITHM
    test_email = "metest@example.com"
    user_data = {"email": test_email, "full_name": "Me Test User", "picture_url": "http://metest.com/pic.jpg"}

    user = User(**user_data)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user) # To get the ID

    token = create_test_access_token(test_email, JWT_SECRET_KEY, ALGORITHM)

    response = test_client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    response_data = response.json()
    assert response_data["email"] == user_data["email"]
    assert response_data["full_name"] == user_data["full_name"]
    assert response_data["picture_url"] == user_data["picture_url"]
    assert "id" in response_data # ID is assigned by DB
    assert response_data["id"] == user.id

    # Clean up user
    db_session.delete(user)
    db_session.commit()

# (Optional) test_utils.py would test create_access_token and parts of get_current_user logic directly
# For now, these are implicitly tested via the endpoint tests.
# If get_current_user had more complex logic, direct unit tests would be more critical.
# For example, testing token expiration or malformed token for get_current_user.
pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning") # Ignore Pydantic V1/V2 deprecation warnings for now if any

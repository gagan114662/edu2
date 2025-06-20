import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Now import the modules to be tested/mocked
import google_api_utils
from main import User # Assuming User can be imported for type creation. Adjust if models are separate.
from google.oauth2.credentials import Credentials
from google.auth.exceptions import RefreshError

@pytest.fixture
def mock_db_session(mocker): # mocker is a pytest fixture
    session = MagicMock()
    # Configure mocks for SQLAlchemy session methods if they are called
    session.commit = mocker.MagicMock()
    session.add = mocker.MagicMock()
    session.refresh = mocker.MagicMock()
    session.rollback = mocker.MagicMock()
    return session

@pytest.fixture
def mock_user_with_tokens():
    user = User() # Create an instance of your User model
    user.email = "test@example.com"
    user.google_access_token = "valid_access_token"
    user.google_refresh_token = "valid_refresh_token"
    user.google_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    user.google_granted_scopes = ["scope1", "https://www.googleapis.com/auth/classroom.courses.readonly"]
    return user

@pytest.fixture(autouse=True)
def set_env_vars(monkeypatch):
    # Mock environment variables for client ID/secret for all tests in this module
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test_client_secret")
    # Ensure the google_api_utils module re-reads these if it loads them at module level.
    # This might require reloading the module or ensuring it reads env vars on each call if they can change.
    # For now, assume google_api_utils.GOOGLE_CLIENT_ID etc. are loaded when function is called or module is imported in test.
    # If they are module-level constants in google_api_utils, patch them directly:
    monkeypatch.setattr(google_api_utils, 'GOOGLE_CLIENT_ID', "test_client_id")
    monkeypatch.setattr(google_api_utils, 'GOOGLE_CLIENT_SECRET', "test_client_secret")


def test_get_google_api_credentials_valid_token(mock_user_with_tokens, mock_db_session):
    creds = google_api_utils.get_google_api_credentials(mock_user_with_tokens, mock_db_session)

    assert creds is not None
    assert creds.token == "valid_access_token"
    assert creds.valid # Should be valid as expiry is in future
    mock_db_session.commit.assert_not_called() # No refresh, so no commit

def test_get_google_api_credentials_expired_token_refresh_success(mock_user_with_tokens, mock_db_session):
    mock_user_with_tokens.google_token_expiry = datetime.now(timezone.utc) - timedelta(hours=1) # Expired

    refreshed_token_val = "new_refreshed_access_token"
    new_expiry_val = datetime.now(timezone.utc) + timedelta(hours=1)

    # Mock the Credentials object that will be instantiated inside the function
    # The key is to control the instance of Credentials created within get_google_api_credentials

    # Store the original __init__
    original_creds_init = Credentials.__init__

    # This list will capture the instance of Credentials created
    created_creds_instance_capture = []

    def mock_new_creds_init(self_creds, token, refresh_token, token_uri, client_id, client_secret, scopes):
        # Call original init to set up the object properly
        original_creds_init(self_creds, token, refresh_token, token_uri, client_id, client_secret, scopes)
        # Store the instance for later use or assertions if needed
        created_creds_instance_capture.append(self_creds)

        # Now, set up the mock for the refresh method on this specific instance
        self_creds.refresh = MagicMock() # Create a mock for the refresh method
        def _do_refresh(request): # This is the side effect for the mock
            self_creds.token = refreshed_token_val
            self_creds.expiry = new_expiry_val
            # If Google issues a new refresh token, it would also be updated here on self_creds.refresh_token
        self_creds.refresh.side_effect = _do_refresh

    # Patch Credentials in the google_api_utils module's scope
    with patch('backend.google_api_utils.Credentials', side_effect=mock_new_creds_init, wraps=Credentials) as MockedCredentialsClass:
        creds_result = google_api_utils.get_google_api_credentials(mock_user_with_tokens, mock_db_session)

    assert creds_result is not None
    assert creds_result.token == refreshed_token_val

    # Check that the refresh method on our captured instance was called
    assert len(created_creds_instance_capture) == 1 # Ensure one Credentials object was made
    created_creds_instance = created_creds_instance_capture[0]
    created_creds_instance.refresh.assert_called_once()

    mock_db_session.add.assert_called_with(mock_user_with_tokens)
    mock_db_session.commit.assert_called_once()
    mock_db_session.refresh.assert_called_with(mock_user_with_tokens)

    assert mock_user_with_tokens.google_access_token == refreshed_token_val
    assert mock_user_with_tokens.google_token_expiry == new_expiry_val


def test_get_google_api_credentials_expired_token_refresh_failure(mock_user_with_tokens, mock_db_session):
    mock_user_with_tokens.google_token_expiry = datetime.now(timezone.utc) - timedelta(hours=1) # Expired

    original_creds_init = Credentials.__init__
    created_creds_instance_capture = []

    def mock_new_creds_init_for_failure(self_creds, token, refresh_token, token_uri, client_id, client_secret, scopes):
        original_creds_init(self_creds, token, refresh_token, token_uri, client_id, client_secret, scopes)
        created_creds_instance_capture.append(self_creds)
        self_creds.refresh = MagicMock(side_effect=RefreshError("Simulated Refresh failed"))

    with patch('backend.google_api_utils.Credentials', side_effect=mock_new_creds_init_for_failure, wraps=Credentials):
        creds_result = google_api_utils.get_google_api_credentials(mock_user_with_tokens, mock_db_session)

    assert creds_result is None
    assert len(created_creds_instance_capture) == 1
    created_creds_instance_capture[0].refresh.assert_called_once()

    assert mock_user_with_tokens.google_access_token is None
    assert mock_user_with_tokens.google_refresh_token is None
    assert mock_user_with_tokens.google_token_expiry is None
    mock_db_session.add.assert_called_with(mock_user_with_tokens)
    mock_db_session.commit.assert_called_once()
    mock_db_session.refresh.assert_called_with(mock_user_with_tokens)


def test_get_google_api_credentials_no_refresh_token_and_expired(mock_user_with_tokens, mock_db_session):
    mock_user_with_tokens.google_refresh_token = None
    mock_user_with_tokens.google_token_expiry = datetime.now(timezone.utc) - timedelta(hours=1) # Expired

    # No need to mock Credentials.refresh if no refresh token means it won't be called.
    # The logic should return None before attempting refresh.
    creds = google_api_utils.get_google_api_credentials(mock_user_with_tokens, mock_db_session)
    assert creds is None
    # Depending on implementation, commit might be called to save cleared expired token
    # Current google_api_utils.py does not clear token if no refresh token, just returns None.
    mock_db_session.commit.assert_not_called()

def test_get_google_api_credentials_no_initial_access_token(mock_user_with_tokens, mock_db_session):
    mock_user_with_tokens.google_access_token = None
    creds = google_api_utils.get_google_api_credentials(mock_user_with_tokens, mock_db_session)
    assert creds is None
    mock_db_session.commit.assert_not_called()

def test_get_google_api_credentials_missing_env_vars(mock_user_with_tokens, mock_db_session, monkeypatch):
    monkeypatch.setattr(google_api_utils, 'GOOGLE_CLIENT_ID', None)
    # Or monkeypatch.delenv("GOOGLE_CLIENT_ID") if utils re-loads it always

    creds = google_api_utils.get_google_api_credentials(mock_user_with_tokens, mock_db_session)
    assert creds is None
    # Check logs or specific error if possible, for now, None is the contract.
```

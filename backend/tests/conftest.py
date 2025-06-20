import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os

# Set environment variables for testing BEFORE app import
os.environ["GOOGLE_CLIENT_ID"] = "test_google_client_id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test_google_client_secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://localhost:8000/auth/google/callback"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["JWT_SECRET_KEY"] = "test_jwt_secret_key_for_pytest"
os.environ["DATABASE_URL"] = "sqlite:///:memory:" # Test specific DB URL

from backend.main import app, Base, get_db # User model also available from main

# Use the DATABASE_URL from environment for the test engine
engine = create_engine(
    os.environ["DATABASE_URL"],
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables in the in-memory database
Base.metadata.create_all(bind=engine)

# Dependency override for get_db
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Apply the DB override globally for the test session for the imported app
app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def db_session():
    # Ensure a clean slate before creating tables for the current test
    Base.metadata.drop_all(bind=engine) # Explicitly drop first
    Base.metadata.create_all(bind=engine) # Then create

    db = TestingSessionLocal()
    try:
        yield db
        db.commit()
    except Exception: # Catch any exception during the test
        db.rollback()
        raise
    finally:
        # No need to drop again here if we drop at the start of the next session.
        # However, for absolute certainty between tests if a test fails mid-way before yield returns,
        # dropping here too can be useful. But drop_all/create_all at start should be enough.
        # For simplicity, let's keep it to drop/create at start.
        db.close()


@pytest.fixture(scope="function") # Changed scope to "function"
def test_client():
    # The app instance imported from backend.main already has env vars set
    # and the get_db dependency overridden globally for this test session.
    # Re-applying override in function scope for clarity, though it's already global.
    # This ensures that if app was somehow reloaded or changed, this test client gets the override.
    app.dependency_overrides[get_db] = override_get_db

    print("\nDEBUG: conftest.py - test_client fixture - App routes:")
    for route in app.routes:
        if hasattr(route, "path"):
            print(f"  Route Path: {route.path}, Name: {getattr(route, 'name', 'N/A')}, Methods: {getattr(route, 'methods', '')}")
        else:
            print(f"  Non-path route (e.g. sub-app): {type(route)}")
    print("DEBUG: End of route list.\n")

    client = TestClient(app)
    yield client

    # Optional: Clean up global override if necessary, though for test sessions it's often fine.
    # app.dependency_overrides.pop(get_db, None)


# Mocking Firebase Admin SDK
from unittest.mock import patch, MagicMock

@pytest.fixture(autouse=True)
def mock_firebase_auth_sdk_fixture(): # Renamed to avoid conflict if a test needs it as arg
    # Default behavior for verify_id_token
    mock_decoded_token_payload = {
        "uid": "test_firebase_uid_default",
        "email": "default_user@example.com",
        "name": "Default Test User",
        "picture": "http://example.com/default.jpg",
        "email_verified": True
    }

    # Using a list to pass the mock by reference so set_mock_firebase_token can change it
    mock_verify_id_token_ref = [MagicMock(return_value=mock_decoded_token_payload)]

    # Patch where they are imported/used in backend.main
    # Note: main.py uses 'from firebase_admin import auth as firebase_auth' and 'import firebase_admin'

    # Mock _apps to simulate SDK being initialized
    mock_apps_list_patch = patch('backend.main.firebase_admin._apps', new={"[DEFAULT]": object()}) # Simulate an initialized app

    patches = [
        patch('backend.main.firebase_auth.verify_id_token', new=mock_verify_id_token_ref[0]),
        patch('backend.main.firebase_admin.initialize_app', return_value=None), # Mock initialize_app
        mock_apps_list_patch # Add this to the list of patches
    ]

    # Enter all patches
    for p in patches:
        p.start()

    yield mock_verify_id_token_ref # Yield the list containing the mock verify_id_token

    # Exit all patches
    for p in patches:
        p.stop()

# Helper to change mock return value or raise exception within a test
def set_mock_firebase_token(mock_verify_id_token_ref_list, decoded_token_data=None, exception_to_raise=None):
    """
    Helper to configure the mock for firebase_auth.verify_id_token.
    :param mock_verify_id_token_ref_list: The list containing the MagicMock for verify_id_token (from fixture).
    :param decoded_token_data: Data to be returned by verify_id_token.
    :param exception_to_raise: Exception class or instance to be raised by verify_id_token.
    """
    mock_verify_id_token_fn = mock_verify_id_token_ref_list[0] # Get the mock from the list
    if exception_to_raise:
        mock_verify_id_token_fn.side_effect = exception_to_raise
        mock_verify_id_token_fn.return_value = None # Clear any previous return value
    else:
        mock_verify_id_token_fn.return_value = decoded_token_data
        mock_verify_id_token_fn.side_effect = None # Clear any previous side effect

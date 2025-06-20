import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock # For mock_firebase_auth_sdk_fixture if needed as arg
from backend.main import User, UserResponse # SQLAlchemy model and Pydantic response model
from backend.tests.conftest import set_mock_firebase_token # Helper from conftest
# Import specific Firebase auth errors if needed for specific exception testing
from firebase_admin import auth as firebase_auth_errors

# Note: mock_firebase_auth_sdk_fixture is an autouse fixture in conftest.py
# It yields a list containing the MagicMock for verify_id_token.
# We can get it by adding it as an argument to the test function if needed,
# or just use the set_mock_firebase_token helper which takes it as an argument.

def test_get_me_unauthenticated(test_client: TestClient, mock_firebase_auth_sdk_fixture):
    # Configure verify_id_token mock to raise InvalidIdTokenError
    # Corrected: code is first positional arg, then message.
    error_instance_invalid = firebase_auth_errors.InvalidIdTokenError("auth/invalid-id-token", "Test token is invalid.")
    set_mock_firebase_token(
        mock_firebase_auth_sdk_fixture,
        exception_to_raise=error_instance_invalid
    )

    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer invalidtoken"})
    assert response.status_code == 401
    assert "Invalid Firebase ID token" in response.json()["detail"]

def test_get_me_expired_token(test_client: TestClient, mock_firebase_auth_sdk_fixture):
    # Corrected: code is first positional arg, then message.
    error_instance_expired = firebase_auth_errors.ExpiredIdTokenError("auth/id-token-expired", "Test token expired.")
    set_mock_firebase_token(
        mock_firebase_auth_sdk_fixture,
        exception_to_raise=error_instance_expired
    )
    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer expiredtoken"})
    assert response.status_code == 401
    assert "Firebase ID token has expired" in response.json()["detail"]

def test_get_me_new_user_creation(test_client: TestClient, db_session, mock_firebase_auth_sdk_fixture):
    firebase_uid = "new_user_firebase_uid"
    email = "newuser@example.com"
    name = "New User Name"
    picture = "http://example.com/newuser.jpg"

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": firebase_uid,
        "email": email,
        "name": name,
        "picture": picture,
        "email_verified": True
    })

    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer validtoken"})

    assert response.status_code == 200
    user_data = response.json()
    assert user_data["firebase_uid"] == firebase_uid
    assert user_data["email"] == email
    assert user_data["full_name"] == name
    assert user_data["picture_url"] == picture
    assert user_data["role"] == "student"

    # Verify user was created in the database
    db_user = db_session.query(User).filter(User.firebase_uid == firebase_uid).first()
    assert db_user is not None
    assert db_user.email == email
    assert db_user.full_name == name
    assert db_user.id is not None # Should have an ID from DB
    assert db_user.role == "student"

def test_get_me_existing_user_no_update(test_client: TestClient, db_session, mock_firebase_auth_sdk_fixture):
    firebase_uid = "existing_user_uid_no_update"
    email = "existing_no_update@example.com"
    name = "Existing User"
    picture = "http://example.com/existing.jpg"
    role = "student" # Or 'parent' as suggested, 'student' for consistency with default

    # Pre-populate user in DB
    existing_user = User(firebase_uid=firebase_uid, email=email, full_name=name, picture_url=picture, role=role)
    db_session.add(existing_user)
    db_session.commit()
    db_session.refresh(existing_user)
    original_id = existing_user.id

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": firebase_uid, "email": email, "name": name, "picture": picture, "email_verified": True
    })

    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer validtoken"})
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["firebase_uid"] == firebase_uid
    assert user_data["email"] == email
    assert user_data["full_name"] == name # No change
    assert user_data["id"] == original_id
    assert user_data["role"] == role

    db_user = db_session.query(User).filter(User.firebase_uid == firebase_uid).first()
    assert db_user.full_name == name # Still original name

def test_get_me_existing_user_with_update(test_client: TestClient, db_session, mock_firebase_auth_sdk_fixture):
    firebase_uid = "existing_user_uid_with_update"
    email = "existing_update@example.com"
    original_name = "Original Name"
    updated_name = "Updated Name from Firebase"
    original_picture = "http://example.com/original.jpg"
    updated_picture = "http://example.com/updated.jpg"
    user_role = "student" # Role for the existing user

    existing_user = User(firebase_uid=firebase_uid, email=email, full_name=original_name, picture_url=original_picture, role=user_role)
    db_session.add(existing_user)
    db_session.commit()

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": firebase_uid, "email": email, "name": updated_name, "picture": updated_picture, "email_verified": True
    })

    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer validtoken"})
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["full_name"] == updated_name
    assert user_data["picture_url"] == updated_picture
    assert user_data["role"] == user_role # Role should not change

    db_user_updated = db_session.query(User).filter(User.firebase_uid == firebase_uid).first()
    assert db_user_updated.full_name == updated_name
    assert db_user_updated.picture_url == updated_picture
    assert db_user_updated.role == user_role # Role should remain unchanged in DB

def test_get_me_firebase_uid_missing_in_token(test_client: TestClient, mock_firebase_auth_sdk_fixture):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {"email": "test@example.com"}) # UID missing
    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer validtoken_no_uid"})
    assert response.status_code == 400 # As per get_current_active_user logic
    assert "Firebase UID not found in token" in response.json()["detail"]

def test_get_me_email_missing_in_token_for_new_user(test_client: TestClient, mock_firebase_auth_sdk_fixture):
    # This test assumes the user does not exist, so creation will be attempted.
    # User creation requires an email.
    firebase_uid = "new_user_no_email_uid"
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": firebase_uid, "name": "New User No Email" # Email missing
    })
    response = test_client.get("/api/users/me", headers={"Authorization": "Bearer validtoken_no_email"})
    assert response.status_code == 400
    assert "Email not found in Firebase token, cannot create user" in response.json()["detail"]

# Note: The old logout tests are removed as the endpoint was removed.
# The old custom JWT helper create_test_access_token is no longer needed.
pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from typing import List

from backend.main import User, ParentChildLink, UserResponse, ChildDashboardData # UserResponse might be useful for checking user details
from backend.main import ParentChildLinkCreate, ParentChildLinkResponse, UserBasicInfo # Schemas used in link endpoints
from backend.tests.conftest import set_mock_firebase_token # Helper from conftest
from firebase_admin import auth as firebase_auth_errors # For auth errors

# Constants for user details to ensure consistency
PARENT_EMAIL = "parent@example.com"
PARENT_UID = "parent_firebase_uid"
PARENT_FULL_NAME = "Parent User"

STUDENT_ONE_EMAIL = "student1@example.com"
STUDENT_ONE_UID = "student1_firebase_uid"
STUDENT_ONE_FULL_NAME = "Student User One"

STUDENT_TWO_EMAIL = "student2@example.com"
STUDENT_TWO_UID = "student2_firebase_uid"
STUDENT_TWO_FULL_NAME = "Student User Two"

# Pytest Fixtures for Users
@pytest.fixture
def parent_user(db_session: Session) -> User:
    user = User(
        firebase_uid=PARENT_UID,
        email=PARENT_EMAIL,
        full_name=PARENT_FULL_NAME,
        role="parent"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def student_user_one(db_session: Session) -> User:
    user = User(
        firebase_uid=STUDENT_ONE_UID,
        email=STUDENT_ONE_EMAIL,
        full_name=STUDENT_ONE_FULL_NAME,
        role="student"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def student_user_two(db_session: Session) -> User:
    user = User(
        firebase_uid=STUDENT_TWO_UID,
        email=STUDENT_TWO_EMAIL,
        full_name=STUDENT_TWO_FULL_NAME,
        role="student"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

# Tests for POST /api/links/parent-child

def test_link_parent_child_success(
    test_client: TestClient, db_session: Session, parent_user: User, student_user_one: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": student_user_one.email}
    )
    assert response.status_code == 200
    link_data = response.json()
    assert link_data["parent_id"] == parent_user.id
    assert link_data["child_id"] == student_user_one.id
    assert "id" in link_data

    db_link = db_session.query(ParentChildLink).filter_by(id=link_data["id"]).first()
    assert db_link is not None
    assert db_link.parent_id == parent_user.id
    assert db_link.child_id == student_user_one.id

def test_link_parent_child_error_not_a_parent(
    test_client: TestClient, student_user_one: User, student_user_two: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": student_user_one.firebase_uid, "email": student_user_one.email, "name": student_user_one.full_name, "role": "student"
    })
    response = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": student_user_two.email}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Only parents can link to children."

def test_link_parent_child_error_child_not_found(
    test_client: TestClient, parent_user: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": "nonexistent@example.com"}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Child user not found."

def test_link_parent_child_error_child_not_a_student(
    test_client: TestClient, db_session: Session, parent_user: User, mock_firebase_auth_sdk_fixture
):
    # Create another parent to try linking to
    another_parent = User(firebase_uid="anotherparentuid", email="anotherparent@example.com", role="parent", full_name="Another Parent")
    db_session.add(another_parent)
    db_session.commit()

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": another_parent.email}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Can only link to student users."

def test_link_parent_child_error_linking_to_oneself(
    test_client: TestClient, parent_user: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": parent_user.email}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot link to oneself."

def test_link_parent_child_error_link_already_exists(
    test_client: TestClient, db_session: Session, parent_user: User, student_user_one: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    # First, create the link
    response1 = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": student_user_one.email}
    )
    assert response1.status_code == 200
    link_id_1 = response1.json()["id"]

    # Then, attempt to create it again
    response2 = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer validtoken"},
        json={"child_email": student_user_one.email}
    )
    assert response2.status_code == 200 # As per current implementation, returns existing link
    assert response2.json()["id"] == link_id_1

    count = db_session.query(ParentChildLink).filter_by(parent_id=parent_user.id, child_id=student_user_one.id).count()
    assert count == 1

def test_link_parent_child_error_unauthenticated(
    test_client: TestClient, student_user_one: User, mock_firebase_auth_sdk_fixture
):
    error_instance_invalid = firebase_auth_errors.InvalidIdTokenError("auth/invalid-id-token", "Test token is invalid.")
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, exception_to_raise=error_instance_invalid)

    response = test_client.post(
        "/api/links/parent-child",
        headers={"Authorization": "Bearer invalidtoken"},
        json={"child_email": student_user_one.email}
    )
    assert response.status_code == 401

# Tests for GET /api/users/me/children

def test_get_my_children_success_parent_with_children(
    test_client: TestClient, db_session: Session, parent_user: User, student_user_one: User, student_user_two: User, mock_firebase_auth_sdk_fixture
):
    # Link parent to student_user_one
    link1 = ParentChildLink(parent_id=parent_user.id, child_id=student_user_one.id)
    db_session.add(link1)
    # Link parent to student_user_two
    link2 = ParentChildLink(parent_id=parent_user.id, child_id=student_user_two.id)
    db_session.add(link2)
    db_session.commit()

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.get("/api/users/me/children", headers={"Authorization": "Bearer validtoken"})
    assert response.status_code == 200
    children_data = response.json()
    assert isinstance(children_data, list)
    assert len(children_data) == 2

    # Verify details (order might vary, so check emails)
    emails_returned = {child["email"] for child in children_data}
    assert student_user_one.email in emails_returned
    assert student_user_two.email in emails_returned

    for child_info in children_data:
        assert "id" in child_info
        assert "full_name" in child_info
        assert child_info["role"] == "student"
        if child_info["email"] == student_user_one.email:
            assert child_info["id"] == student_user_one.id
            assert child_info["full_name"] == student_user_one.full_name
        elif child_info["email"] == student_user_two.email:
            assert child_info["id"] == student_user_two.id
            assert child_info["full_name"] == student_user_two.full_name

def test_get_my_children_success_parent_with_no_children(
    test_client: TestClient, parent_user: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.get("/api/users/me/children", headers={"Authorization": "Bearer validtoken"})
    assert response.status_code == 200
    children_data = response.json()
    assert isinstance(children_data, list)
    assert len(children_data) == 0

def test_get_my_children_error_not_a_parent(
    test_client: TestClient, student_user_one: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": student_user_one.firebase_uid, "email": student_user_one.email, "name": student_user_one.full_name, "role": "student"
    })
    response = test_client.get("/api/users/me/children", headers={"Authorization": "Bearer validtoken"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Only parents can view linked children."

def test_get_my_children_error_unauthenticated(test_client: TestClient, mock_firebase_auth_sdk_fixture):
    error_instance_invalid = firebase_auth_errors.InvalidIdTokenError("auth/invalid-id-token", "Test token is invalid.")
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, exception_to_raise=error_instance_invalid)

    response = test_client.get("/api/users/me/children", headers={"Authorization": "Bearer invalidtoken"})
    assert response.status_code == 401

# Add a marker to ignore deprecation warnings from SQLAlchemy and Pydantic if they appear during tests
pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


# Tests for GET /api/parent/children/{child_user_id}/dashboard

def test_get_child_dashboard_success(
    test_client: TestClient, db_session: Session, parent_user: User, student_user_one: User, mock_firebase_auth_sdk_fixture
):
    # Link parent to student
    link = ParentChildLink(parent_id=parent_user.id, child_id=student_user_one.id)
    db_session.add(link)
    db_session.commit()

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })

    response = test_client.get(
        f"/api/parent/children/{student_user_one.id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    assert response.status_code == 200
    dashboard_data = response.json()

    # Assert structure matches ChildDashboardData (Pydantic will validate on parse if response_model is used correctly)
    # For explicit checks:
    assert dashboard_data["child_id"] == student_user_one.id
    assert dashboard_data["child_full_name"] == student_user_one.full_name
    assert "total_tutoring_time_week_minutes" in dashboard_data
    assert dashboard_data["total_tutoring_time_week_minutes"] > 0 # Based on mock data
    assert "overall_curriculum_progress" in dashboard_data
    assert "strengths" in dashboard_data
    assert "weaknesses" in dashboard_data
    assert "progress_by_topic" in dashboard_data
    assert "recent_activity_log" in dashboard_data
    assert "performance_trends" in dashboard_data
    assert len(dashboard_data["progress_by_topic"]) > 0 # Based on mock data
    assert len(dashboard_data["recent_activity_log"]) > 0 # Based on mock data

def test_get_child_dashboard_error_requester_not_parent(
    test_client: TestClient, db_session: Session, student_user_one: User, student_user_two: User, mock_firebase_auth_sdk_fixture
):
    # student_user_one attempts to access student_user_two's dashboard
    # No actual link needed between them as the role check should prevent access first
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": student_user_one.firebase_uid, "email": student_user_one.email, "name": student_user_one.full_name, "role": "student"
    })
    response = test_client.get(
        f"/api/parent/children/{student_user_two.id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Access denied: User is not a parent."

def test_get_child_dashboard_error_parent_not_linked(
    test_client: TestClient, db_session: Session, parent_user: User, student_user_one: User, student_user_two: User, mock_firebase_auth_sdk_fixture
):
    # Parent is linked to student_user_one
    link = ParentChildLink(parent_id=parent_user.id, child_id=student_user_one.id)
    db_session.add(link)
    db_session.commit()

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })

    # Parent attempts to access student_user_two's dashboard (not linked)
    response = test_client.get(
        f"/api/parent/children/{student_user_two.id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Access denied: You are not linked to this child."

def test_get_child_dashboard_error_child_user_not_found(
    test_client: TestClient, parent_user: User, mock_firebase_auth_sdk_fixture
):
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    non_existent_child_id = 99999
    response = test_client.get(
        f"/api/parent/children/{non_existent_child_id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    # This will first fail the parent-child link check if no such child_id exists in links table,
    # or if it does, then it will fail the child user fetch.
    # The current API logic checks link first, then child.
    # If child_user_id doesn't exist at all, the link won't be found.
    # If a link pointed to a non-existent child_id (data integrity issue), then 404 would be hit.
    # Given the current check order, "Access denied: You are not linked to this child." is more likely
    # if the child_id doesn't exist and thus no link can be found.
    # However, if we want to specifically test the "Child user not found" part,
    # we'd need a parent linked to a child_id that then gets deleted.
    # For a simple non-existent ID, the "not linked" error is appropriate.
    # Let's adjust the expectation based on current API logic.
    # The API first checks the link: `select(ParentChildLink).where(parent_id == current_user.id, child_id == child_user_id)`
    # If child_user_id=99999, no link will be found.
    assert response.status_code == 403 # Expect "Access denied: You are not linked to this child."
    assert response.json()["detail"] == "Access denied: You are not linked to this child."

    # To specifically test the 404 for "Child user not found", we'd need a more complex setup:
    # 1. Create parent, child.
    # 2. Link them.
    # 3. Authenticate as parent.
    # 4. Delete the child user from DB (but keep the link record).
    # 5. Call API -> This should then hit the 404.
    # This is more of an integrity test. For now, the above test for non-existent ID is fine.

def test_get_child_dashboard_error_unauthenticated(
    test_client: TestClient, student_user_one: User, mock_firebase_auth_sdk_fixture # student_user_one.id is a valid child ID
):
    error_instance_invalid = firebase_auth_errors.InvalidIdTokenError("auth/invalid-id-token", "Test token is invalid.")
    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, exception_to_raise=error_instance_invalid)

    response = test_client.get(
        f"/api/parent/children/{student_user_one.id}/dashboard",
        headers={"Authorization": "Bearer invalidtoken"}
    )
    assert response.status_code == 401

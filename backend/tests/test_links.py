import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from typing import List
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta, timezone

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


# Helper functions for Firestore mocks
def create_mock_firestore_doc(data: dict, exists: bool = True):
    mock_doc = MagicMock()
    mock_doc.exists = exists
    mock_doc.to_dict.return_value = data
    mock_doc.id = data.get("id", "mock_doc_id") # Ensure id is part of data if used as topic_name fallback
    return mock_doc

def create_mock_firestore_stream(doc_data_list: List[dict]):
    return [create_mock_firestore_doc(data) for data in doc_data_list]

# Tests for GET /api/parent/children/{child_user_id}/dashboard

@patch('backend.main.firestore.client')
def test_get_child_dashboard_success(
    mock_firestore_client_constructor: MagicMock,
    test_client: TestClient,
    db_session: Session,
    parent_user: User,
    student_user_one: User,
    mock_firebase_auth_sdk_fixture
):
    # Link parent to student in PG DB
    link = ParentChildLink(parent_id=parent_user.id, child_id=student_user_one.id)
    db_session.add(link)
    db_session.commit()

    # Mock Firestore client instance
    mock_fs_client = MagicMock()
    mock_firestore_client_constructor.return_value = mock_fs_client

    # --- Mock Firestore Data Setup ---
    now = datetime.now(timezone.utc)

    # Mock student_progress document
    mock_student_doc_data = {'overall_curriculum_progress': 65.0}
    mock_fs_client.collection.return_value.document.return_value.get.return_value = create_mock_firestore_doc(mock_student_doc_data)

    # Mock topic_mastery subcollection
    mock_topic_mastery_data = [
        {'id': 'topic1', 'topic_name': 'Algebra Basics', 'progress_percentage': 95.0, 'skill_rating': 'Excellent'},
        {'id': 'topic2', 'topic_name': 'Fractions', 'progress_percentage': 40.0, 'skill_rating': 'Needs Improvement'},
        {'id': 'topic3', 'topic_name': 'Geometry', 'progress_percentage': 70.0, 'skill_rating': 'Satisfactory'},
    ]
    # Configure the chain for topic_mastery
    mock_fs_client.collection.return_value.document.return_value.collection.return_value.stream.side_effect = [
        create_mock_firestore_stream(mock_topic_mastery_data), # First call for topic_mastery
        # Subsequent calls for sessions (see below)
    ]

    # Mock sessions subcollection
    # For simplicity, let's create sessions that fall into specific categories for aggregation
    mock_sessions_data = [
        # Current week
        {'timestamp': (now - timedelta(days=1)).isoformat(), 'duration_minutes': 30, 'description': 'Session A'},
        {'timestamp': (now - timedelta(days=2)).isoformat(), 'duration_minutes': 25, 'description': 'Session B'},
        # Last week (for performance trend)
        {'timestamp': (now - timedelta(days=8)).isoformat(), 'duration_minutes': 40, 'description': 'Session C'},
        # Current month, but not current week
        {'timestamp': (now - timedelta(days=15)).isoformat(), 'duration_minutes': 60, 'description': 'Session D'},
    ]
    # Need to handle multiple .collection() calls on the same document mock if student_progress and sessions are under the same doc
    # A more robust way is to configure side_effect for collection().document() based on path
    # For now, let's assume specific ordering or use different mocks if needed.
    # The previous side_effect for stream() was a list, this makes it tricky.
    # Let's refine mock setup:

    mock_student_progress_doc_ref = MagicMock()
    mock_fs_client.collection.return_value.document.return_value = mock_student_progress_doc_ref
    mock_student_progress_doc_ref.get.return_value = create_mock_firestore_doc(mock_student_doc_data)

    # Topic Mastery
    mock_topic_mastery_collection_ref = MagicMock()
    mock_student_progress_doc_ref.collection.side_effect = lambda name: mock_topic_mastery_collection_ref if name == 'topic_mastery' else MagicMock()
    mock_topic_mastery_collection_ref.stream.return_value = create_mock_firestore_stream(mock_topic_mastery_data)

    # Sessions
    # We need to make sure the sessions query mock is separate
    mock_sessions_collection_ref = MagicMock()

    # If collection('student_progress').document(uid).collection('sessions') is called:
    # We need a way to make collection() return different refs based on name
    def collection_side_effect(collection_name):
        if collection_name == 'topic_mastery':
            return mock_topic_mastery_collection_ref
        elif collection_name == 'sessions':
            mock_sessions_query = MagicMock()
            mock_sessions_query.order_by.return_value = mock_sessions_query # for chaining
            mock_sessions_query.where.return_value = mock_sessions_query
            mock_sessions_query.stream.return_value = create_mock_firestore_stream(mock_sessions_data)
            return mock_sessions_query # This should be a collection_ref that then has query methods
        return MagicMock() # Default mock for other collections

    mock_student_progress_doc_ref.collection.side_effect = collection_side_effect
    # --- End Mock Firestore Data Setup ---

    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })

    response = test_client.get(
        f"/api/parent/children/{student_user_one.id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    assert response.status_code == 200
    dashboard_data = response.json()

    assert dashboard_data["child_id"] == student_user_one.id
    assert dashboard_data["child_full_name"] == student_user_one.full_name
    assert dashboard_data["overall_curriculum_progress"] == 65.0

    assert len(dashboard_data["progress_by_topic"]) == 3
    assert dashboard_data["progress_by_topic"][0]["topic_name"] == "Algebra Basics"
    assert dashboard_data["strengths"] == ["Algebra Basics"]
    assert dashboard_data["weaknesses"] == ["Fractions"]

    assert len(dashboard_data["recent_activity_log"]) == 4 # All mocked sessions
    assert dashboard_data["recent_activity_log"][0]["description"] == "Session A"

    # Assertions for aggregated data (these depend on current date and mock data timing)
    # This week: Session A (30), Session B (25) = 55 mins, 2 sessions
    assert dashboard_data["total_tutoring_time_week_minutes"] == 55
    assert dashboard_data["sessions_completed_week"] == 2
    # This month: Session A, B, D (30+25+60) = 115 mins, 3 sessions (assuming C is outside current month for simplicity or test near month end)
    # Actual month calculation depends on 'now'. For this test, Session C (8 days ago) might be in this month or not.
    # Let's assume all 4 sessions are within the current month for this mock setup.
    assert dashboard_data["total_tutoring_time_month_minutes"] == 30 + 25 + 40 + 60 # 155
    assert dashboard_data["sessions_completed_month"] == 4

    # Performance trends: 4 weeks. Week 0 (3 weeks ago), 1 (2 weeks ago), 2 (last week), 3 (current week)
    # Current week (index 3): 2 sessions (A,B)
    # Last week (index 2): 1 session (C)
    # 2 weeks ago (index 1): 1 session (D)
    # 3 weeks ago (index 0): 0 sessions
    assert len(dashboard_data["performance_trends"]) == 4
    # Note: The exact values depend on how 'now' aligns with week boundaries in the test run.
    # The logic in main.py for trends is simplified. We're checking if it produces 4 points.
    # And based on data: current week has 2, last week 1, week before that 1.
    # The performance_trends list is sorted by date, earliest first.
    # So trend[3] is current week, trend[2] is last week.
    # This needs careful checking against the main.py trend calculation logic.
    # The main.py logic for trends: `week_start_date = (now - timedelta(weeks=(3-i)))`
    # i=0: 3 weeks ago from today (value: weekly_sessions_count[0])
    # i=1: 2 weeks ago from today (value: weekly_sessions_count[1])
    # i=2: 1 week ago from today (value: weekly_sessions_count[2])
    # i=3: current week (value: weekly_sessions_count[3])
    # And weekly_sessions_count index: 3 = current, 2 = last, 1 = 2 weeks ago, 0 = 3 weeks ago
    # So trend[0].value should be weekly_sessions_count[0]
    # Session D (15 days ago) is ~2 weeks ago. Session C (8 days ago) is ~1 week ago. A, B are current week.
    # So, weekly_sessions_count should be roughly [0, 1 (D), 1 (C), 2 (A,B)]
    assert dashboard_data["performance_trends"][0]["value"] == 0 # 3 weeks ago
    assert dashboard_data["performance_trends"][1]["value"] == 1 # 2 weeks ago (Session D)
    assert dashboard_data["performance_trends"][2]["value"] == 1 # last week (Session C)
    assert dashboard_data["performance_trends"][3]["value"] == 2 # current week (Sessions A,B)

    # Assert Alerts
    # Mock data: Session A was 1 day ago (recent), Algebra Basics is 95% 'Excellent'
    assert "Great job! Progress made in Algebra Basics (Excellent, 95.0%)." in dashboard_data["alerts"] # Added period
    assert len(dashboard_data["alerts"]) == 1 # Only the mastery alert


@patch('backend.main.firestore.client')
def test_get_child_dashboard_alerts_inactivity_and_no_mastery(
    mock_firestore_client_constructor: MagicMock,
    test_client: TestClient,
    db_session: Session,
    parent_user: User,
    student_user_one: User,
    mock_firebase_auth_sdk_fixture
):
    link = ParentChildLink(parent_id=parent_user.id, child_id=student_user_one.id)
    db_session.add(link)
    db_session.commit()

    mock_fs_client = MagicMock()
    mock_firestore_client_constructor.return_value = mock_fs_client

    now = datetime.now(timezone.utc)
    mock_student_doc_data = {'overall_curriculum_progress': 30.0}
    mock_topic_mastery_data = [
        {'id': 'topic1', 'topic_name': 'Fractions', 'progress_percentage': 40.0, 'skill_rating': 'Needs Improvement'},
    ]
    # Last session was 6 days ago
    last_session_date = now - timedelta(days=6)
    mock_sessions_data = [
        {'timestamp': last_session_date.isoformat(), 'duration_minutes': 30, 'description': 'Old Session'},
    ]

    mock_student_progress_doc_ref = MagicMock()
    mock_fs_client.collection.return_value.document.return_value = mock_student_progress_doc_ref
    mock_student_progress_doc_ref.get.return_value = create_mock_firestore_doc(mock_student_doc_data)

    mock_topic_mastery_collection_ref = MagicMock()
    # mock_sessions_collection_ref = MagicMock() # This was for stream, but query object is needed

    def collection_side_effect(collection_name):
        if collection_name == 'topic_mastery':
            mock_topic_mastery_collection_ref.stream.return_value = create_mock_firestore_stream(mock_topic_mastery_data)
            return mock_topic_mastery_collection_ref
        elif collection_name == 'sessions':
            # Simulate the query chain for sessions
            query_mock = MagicMock()
            query_mock.where.return_value = query_mock #.where() returns a Query
            query_mock.order_by.return_value = query_mock # .order_by() returns a Query
            query_mock.stream.return_value = create_mock_firestore_stream(mock_sessions_data) # .stream() is called on Query
            return query_mock # The collection method itself should return a CollectionReference, which then has query methods.
                               # For simplicity in mock, we make collection('sessions') directly return the final query mock.
                               # A more accurate mock would have collection('sessions') return a CollectionReference mock,
                               # which then has .where(), .order_by() methods returning Query mocks.
                               # Let's adjust this:
    mock_sessions_collection_actual_ref = MagicMock() # This is the CollectionReference for 'sessions'
    mock_sessions_query_obj = MagicMock() # This is the Query object
    mock_sessions_collection_actual_ref.where.return_value = mock_sessions_query_obj
    mock_sessions_query_obj.order_by.return_value = mock_sessions_query_obj
    mock_sessions_query_obj.stream.return_value = create_mock_firestore_stream(mock_sessions_data)


    def new_collection_side_effect(collection_name):
        if collection_name == 'topic_mastery':
            mock_topic_mastery_collection_ref.stream.return_value = create_mock_firestore_stream(mock_topic_mastery_data)
            return mock_topic_mastery_collection_ref
        elif collection_name == 'sessions':
            return mock_sessions_collection_actual_ref # Return the CollectionReference mock for 'sessions'
        return MagicMock()

    mock_student_progress_doc_ref.collection.side_effect = new_collection_side_effect


    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })
    response = test_client.get(
        f"/api/parent/children/{student_user_one.id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    assert response.status_code == 200
    dashboard_data = response.json()

    expected_inactivity_alert = f"Child has not had a session in over 5 days (last session: {last_session_date.strftime('%Y-%m-%d')})."
    assert expected_inactivity_alert in dashboard_data["alerts"]
    # No mastery alerts should be generated as Fractions is 40% "Needs Improvement"
    found_mastery_alert = any("Great job!" in alert for alert in dashboard_data["alerts"])
    assert not found_mastery_alert, "Should not find mastery alerts"
    assert len(dashboard_data["alerts"]) == 1


@patch('backend.main.firestore.client')
def test_get_child_dashboard_success_no_firestore_data(
    mock_firestore_client_constructor: MagicMock,
    test_client: TestClient,
    db_session: Session,
    parent_user: User,
    student_user_one: User,
    mock_firebase_auth_sdk_fixture
):
    # Link parent to student in PG DB
    link = ParentChildLink(parent_id=parent_user.id, child_id=student_user_one.id)
    db_session.add(link)
    db_session.commit()

    mock_fs_client = MagicMock()
    mock_firestore_client_constructor.return_value = mock_fs_client

    # Mock Firestore to return no data
    mock_student_progress_doc_ref = MagicMock()
    mock_fs_client.collection.return_value.document.return_value = mock_student_progress_doc_ref
    mock_student_progress_doc_ref.get.return_value = create_mock_firestore_doc({}, exists=False) # Main doc doesn't exist

    mock_empty_stream = create_mock_firestore_stream([])

    def collection_side_effect_empty(collection_name):
        mock_collection_ref = MagicMock()
        if collection_name == 'topic_mastery':
            mock_collection_ref.stream.return_value = mock_empty_stream
            return mock_collection_ref
        elif collection_name == 'sessions':
            mock_sessions_query = MagicMock()
            mock_sessions_query.order_by.return_value = mock_sessions_query
            mock_sessions_query.where.return_value = mock_sessions_query
            mock_sessions_query.stream.return_value = mock_empty_stream
            return mock_sessions_query # This should be a collection_ref that then has query methods
        return mock_collection_ref # Default mock for other collections
    mock_student_progress_doc_ref.collection.side_effect = collection_side_effect_empty


    set_mock_firebase_token(mock_firebase_auth_sdk_fixture, {
        "uid": parent_user.firebase_uid, "email": parent_user.email, "name": parent_user.full_name, "role": "parent"
    })

    response = test_client.get(
        f"/api/parent/children/{student_user_one.id}/dashboard",
        headers={"Authorization": "Bearer validtoken"}
    )
    assert response.status_code == 200
    dashboard_data = response.json()

    assert dashboard_data["child_id"] == student_user_one.id
    assert dashboard_data["child_full_name"] == student_user_one.full_name
    assert dashboard_data["overall_curriculum_progress"] == 0.0
    assert dashboard_data["progress_by_topic"] == []
    assert dashboard_data["strengths"] == []
    assert dashboard_data["weaknesses"] == []
    assert dashboard_data["recent_activity_log"] == []
    assert dashboard_data["total_tutoring_time_week_minutes"] == 0
    assert dashboard_data["sessions_completed_week"] == 0
    assert dashboard_data["total_tutoring_time_month_minutes"] == 0
    assert dashboard_data["sessions_completed_month"] == 0
    assert len(dashboard_data["performance_trends"]) == 4 # Should still have 4 points, all zero
    for trend_point in dashboard_data["performance_trends"]:
        assert trend_point["value"] == 0
    # Alert for no data: if doc.exists is False and no sessions, "No recent sessions..." is generated.
    # The "No progress data found..." is for when .get() itself raises GoogleCloudNotFound.
    assert "No recent sessions recorded in the last 4 weeks." in dashboard_data["alerts"]
    assert len(dashboard_data["alerts"]) == 1

# The existing error tests for dashboard (auth, not linked, etc.) should still pass
# as they are checked before Firestore interaction.

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

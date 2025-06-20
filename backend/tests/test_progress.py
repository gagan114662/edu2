import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

# Adjust these imports based on your actual project structure
from backend.main import app, get_current_active_user, get_firestore_db
# User model might not be directly needed if MagicMock for current_user is sufficient
# from backend.database import User # Assuming User is SQLAlchemy model from main
from backend.main import UserProgressResponse, LogEventRequest # Pydantic models

# Import firestore for type checking Increment and SERVER_TIMESTAMP
from firebase_admin import firestore

@pytest.fixture
def mock_current_user_obj(): # Removed self from fixture
    user_mock = MagicMock()
    user_mock.firebase_uid = "test_firebase_uid_123"
    user_mock.email = "testuser@example.com"
    # Add other attributes if your User SQLAlchemy model has them and they are accessed
    # For example, if UserResponse for /api/progress/me tries to access current_user.id
    user_mock.id = 1 # Example, if UserResponse tries to get it via from_attributes
    return user_mock

@pytest.fixture
def mock_firestore_setup():
    mock_fs_client = MagicMock(spec=firestore.Client)

    mock_doc_snapshot = MagicMock(spec=firestore.DocumentSnapshot)
    mock_doc_snapshot.exists = False
    mock_doc_snapshot.to_dict.return_value = {}

    mock_doc_ref = MagicMock(spec=firestore.DocumentReference)
    mock_doc_ref.get.return_value = mock_doc_snapshot
    mock_doc_ref.set = MagicMock()
    mock_doc_ref.update = MagicMock()

    mock_collection_ref = MagicMock(spec=firestore.CollectionReference)
    mock_collection_ref.document.return_value = mock_doc_ref
    mock_fs_client.collection.return_value = mock_collection_ref

    mock_transaction = MagicMock(spec=firestore.Transaction)
    # Configure transaction.get to return the same snapshot by default
    # This can be overridden per test if needed
    mock_transaction_doc_snapshot = MagicMock(spec=firestore.DocumentSnapshot)
    mock_transaction_doc_snapshot.exists = False # Default for transaction.get()
    mock_transaction_doc_snapshot.to_dict.return_value = {}
    mock_transaction.get = MagicMock(return_value=mock_transaction_doc_snapshot)

    mock_transaction.set = MagicMock()
    mock_transaction.update = MagicMock()
    # mock_transaction.commit = MagicMock() # Not directly called in app code, but by @firestore.transactional

    mock_fs_client.transaction.return_value = mock_transaction

    return {
        "client": mock_fs_client,
        "doc_ref": mock_doc_ref,
        "doc_snapshot": mock_doc_snapshot, # For direct .get() calls
        "transaction_doc_snapshot": mock_transaction_doc_snapshot, # For transaction.get() calls
        "collection_ref": mock_collection_ref,
        "transaction": mock_transaction
    }

@pytest.fixture
def test_app_client(mock_current_user_obj, mock_firestore_setup):
    async def override_get_user_dependency():
        return mock_current_user_obj

    def override_get_firestore_dependency():
        return mock_firestore_setup["client"]

    app.dependency_overrides[get_current_active_user] = override_get_user_dependency
    app.dependency_overrides[get_firestore_db] = override_get_firestore_dependency

    with TestClient(app) as client_instance:
        yield client_instance

    # Clean up overrides
    if get_current_active_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_active_user]
    if get_firestore_db in app.dependency_overrides:
        del app.dependency_overrides[get_firestore_db]

# --- Tests for /api/progress/me ---
def test_get_user_progress_no_document(test_app_client, mock_firestore_setup, mock_current_user_obj):
    mock_firestore_setup["doc_snapshot"].exists = False

    response = test_app_client.get("/api/progress/me")
    assert response.status_code == 200
    data = response.json()
    assert data["userId"] == mock_current_user_obj.firebase_uid
    assert data["email"] == mock_current_user_obj.email
    assert data["totalSessions"] == 0
    assert data["topics"] == {}
    mock_firestore_setup["collection_ref"].document.assert_called_once_with(mock_current_user_obj.firebase_uid)
    mock_firestore_setup["doc_ref"].get.assert_called_once()

def test_get_user_progress_document_exists(test_app_client, mock_firestore_setup, mock_current_user_obj):
    mock_firestore_setup["doc_snapshot"].exists = True
    now_iso = datetime.now(timezone.utc).isoformat() # Firestore often returns ISO strings for datetimes

    # Simulate Firestore data which might have timestamps as ISO strings or datetime objects
    # Pydantic V2 handles datetime parsing from ISO strings automatically.
    sample_progress_from_firestore = {
        "userId": mock_current_user_obj.firebase_uid, "email": mock_current_user_obj.email,
        "totalSessions": 5, "totalTimeSpentSeconds": 1234,
        "lastActivityTimestamp": now_iso,
        "createdAt": now_iso,
        "topics": {
            "Algebra": {"questionsAttempted": 10, "questionsCorrect": 8, "masteryLevel": 0.8, "lastPracticed": now_iso}
        }
    }
    mock_firestore_setup["doc_snapshot"].to_dict.return_value = sample_progress_from_firestore

    response = test_app_client.get("/api/progress/me")
    assert response.status_code == 200

    # Validate data with Pydantic model to ensure type conformity and default handling
    data = UserProgressResponse(**response.json())
    assert data.userId == sample_progress_from_firestore["userId"]
    assert data.totalSessions == 5
    assert data.topics["Algebra"].masteryLevel == 0.8
    assert data.lastActivityTimestamp is not None
    assert data.lastActivityTimestamp.isoformat().startswith(now_iso.split('.')[0]) # Compare without microseconds for safety


def test_get_user_progress_firestore_error(test_app_client, mock_firestore_setup):
    mock_firestore_setup["doc_ref"].get.side_effect = Exception("Firestore test error")
    response = test_app_client.get("/api/progress/me")
    assert response.status_code == 500
    assert "Error fetching progress data" in response.json()["detail"]

# --- Tests for /api/progress/log_event ---
def test_log_event_session_start_new_user(test_app_client, mock_firestore_setup, mock_current_user_obj):
    mock_firestore_setup["doc_snapshot"].exists = False

    event_payload = {"event_type": "SESSION_START"}
    response = test_app_client.post("/api/progress/log_event", json=event_payload)

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_firestore_setup["doc_ref"].set.assert_called_once()
    args, _ = mock_firestore_setup["doc_ref"].set.call_args
    set_data = args[0]
    assert set_data["userId"] == mock_current_user_obj.firebase_uid
    assert set_data["email"] == mock_current_user_obj.email
    assert set_data["totalSessions"] == 1
    assert "createdAt" in set_data
    assert "lastActivityTimestamp" in set_data

def test_log_event_session_start_existing_user(test_app_client, mock_firestore_setup, mock_current_user_obj):
    mock_firestore_setup["doc_snapshot"].exists = True
    mock_firestore_setup["doc_snapshot"].to_dict.return_value = {"userId": mock_current_user_obj.firebase_uid, "totalSessions": 1}

    event_payload = {"event_type": "SESSION_START"}
    response = test_app_client.post("/api/progress/log_event", json=event_payload)

    assert response.status_code == 200
    mock_firestore_setup["doc_ref"].update.assert_called_once()
    args, _ = mock_firestore_setup["doc_ref"].update.call_args
    update_data = args[0]
    assert isinstance(update_data["totalSessions"], firestore.Increment)
    assert "lastActivityTimestamp" in update_data

def test_log_event_session_end(test_app_client, mock_firestore_setup, mock_current_user_obj):
    mock_firestore_setup["doc_snapshot"].exists = True
    mock_firestore_setup["doc_snapshot"].to_dict.return_value = {"userId": mock_current_user_obj.firebase_uid, "totalTimeSpentSeconds": 100}

    event_payload = {"event_type": "SESSION_END", "event_data": {"sessionDurationSeconds": 120}}
    response = test_app_client.post("/api/progress/log_event", json=event_payload)

    assert response.status_code == 200
    mock_firestore_setup["doc_ref"].update.assert_called_once()
    args, _ = mock_firestore_setup["doc_ref"].update.call_args
    update_data = args[0]
    assert isinstance(update_data["totalTimeSpentSeconds"], firestore.Increment)
    assert "lastActivityTimestamp" in update_data

def test_log_event_question_answered_new_user_new_topic(test_app_client, mock_firestore_setup, mock_current_user_obj):
    # For transaction.get(), ensure the snapshot it returns reflects "document does not exist"
    mock_firestore_setup["transaction_doc_snapshot"].exists = False
    mock_firestore_setup["transaction"].get.return_value = mock_firestore_setup["transaction_doc_snapshot"]

    event_payload = {
        "event_type": "QUESTION_ANSWERED",
        "event_data": {"topicName": " NewTopic. ", "isCorrect": True} # Test sanitization
    }
    response = test_app_client.post("/api/progress/log_event", json=event_payload)

    assert response.status_code == 200
    mock_firestore_setup["transaction"].set.assert_called_once()
    args, _ = mock_firestore_setup["transaction"].set.call_args
    created_doc_data = args[1]
    assert created_doc_data["userId"] == mock_current_user_obj.firebase_uid
    assert created_doc_data["email"] == mock_current_user_obj.email
    assert "NewTopic_" in created_doc_data["topics"] # Check sanitized name
    topic_data = created_doc_data["topics"]["NewTopic_"]
    assert topic_data["questionsAttempted"] == 1
    assert topic_data["questionsCorrect"] == 1
    assert topic_data["masteryLevel"] == 1.0
    assert created_doc_data["totalSessions"] == 1 # Check if session is started

def test_log_event_question_answered_existing_user_topic_update(test_app_client, mock_firestore_setup, mock_current_user_obj):
    now_dt_iso = datetime.now(timezone.utc).isoformat()
    initial_topic_data = {
        "questionsAttempted": 1, "questionsCorrect": 0, "masteryLevel": 0.0, "lastPracticed": now_dt_iso
    }
    existing_user_data = {
        "userId": mock_current_user_obj.firebase_uid, "email": mock_current_user_obj.email,
        "topics": {"ExistingTopic": initial_topic_data}, "lastActivityTimestamp": now_dt_iso,
        "totalSessions":1, "createdAt": now_dt_iso, "totalTimeSpentSeconds": 0
    }
    mock_firestore_setup["transaction_doc_snapshot"].exists = True
    mock_firestore_setup["transaction_doc_snapshot"].to_dict.return_value = existing_user_data
    mock_firestore_setup["transaction"].get.return_value = mock_firestore_setup["transaction_doc_snapshot"]

    event_payload = {
        "event_type": "QUESTION_ANSWERED",
        "event_data": {"topicName": "ExistingTopic", "isCorrect": True}
    }
    response = test_app_client.post("/api/progress/log_event", json=event_payload)

    assert response.status_code == 200
    mock_firestore_setup["transaction"].update.assert_called_once()
    args, _ = mock_firestore_setup["transaction"].update.call_args
    updated_fields = args[1]

    topic_data = updated_fields["topics.ExistingTopic"]
    assert topic_data["questionsAttempted"] == 2
    assert topic_data["questionsCorrect"] == 1
    assert topic_data["masteryLevel"] == 0.5

def test_log_event_question_answered_invalid_data_topicname(test_app_client):
    event_payload = {"event_type": "QUESTION_ANSWERED", "event_data": {"topicName": "  ", "isCorrect": True}} # Empty topic name
    response = test_app_client.post("/api/progress/log_event", json=event_payload)
    assert response.status_code == 400
    assert "topicName" in response.json()["detail"]

def test_log_event_question_answered_invalid_data_iscorrect(test_app_client):
    event_payload = {"event_type": "QUESTION_ANSWERED", "event_data": {"topicName": "Math"}}
    response = test_app_client.post("/api/progress/log_event", json=event_payload)
    assert response.status_code == 400
    assert "isCorrect" in response.json()["detail"]

def test_log_event_firestore_error_in_transaction(test_app_client, mock_firestore_setup):
    # Configure the snapshot returned by transaction.get()
    mock_firestore_setup["transaction_doc_snapshot"].exists = False
    mock_firestore_setup["transaction"].get.return_value = mock_firestore_setup["transaction_doc_snapshot"]

    # Simulate an error during the transaction's set/update operations
    mock_firestore_setup["transaction"].set.side_effect = Exception("Firestore transaction test error")
    mock_firestore_setup["transaction"].update.side_effect = Exception("Firestore transaction test error") # Also mock update

    event_payload = {
        "event_type": "QUESTION_ANSWERED",
        "event_data": {"topicName": "ErrorTopic", "isCorrect": True}
    }
    response = test_app_client.post("/api/progress/log_event", json=event_payload)
    assert response.status_code == 500
    assert "Error processing progress event" in response.json()["detail"]

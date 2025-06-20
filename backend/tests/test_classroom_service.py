import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import classroom_service
from google.oauth2.credentials import Credentials
# Import HttpError for more specific error mocking if needed
# from googleapiclient.errors import HttpError

@pytest.fixture
def mock_google_creds():
    # Create a mock Credentials object. Add attributes/methods if they are accessed.
    creds = MagicMock(spec=Credentials)
    creds.valid = True # Assume valid unless specified otherwise in a test
    creds.token = "mock_access_token"
    # Add other attributes like refresh_token, expiry if classroom_service starts using them directly
    return creds

@patch('googleapiclient.discovery.build')
def test_get_courses_success(mock_build, mock_google_creds):
    mock_service_instance = MagicMock()
    mock_courses_resource = MagicMock()
    mock_list_request = MagicMock()

    mock_list_request.execute.return_value = {
        'courses': [
            {'id': '1', 'name': 'Math 101', 'descriptionHeading': 'Full Year', 'courseState': 'ACTIVE', 'alternateLink': 'link1'},
            {'id': '2', 'name': 'History 101', 'descriptionHeading': 'Semester 1', 'courseState': 'ACTIVE', 'alternateLink': 'link2'}
        ]
    }
    mock_courses_resource.list.return_value = mock_list_request
    mock_service_instance.courses.return_value = mock_courses_resource
    mock_build.return_value = mock_service_instance

    courses = classroom_service.get_courses(mock_google_creds)

    assert len(courses) == 2
    assert courses[0]['name'] == 'Math 101'
    assert courses[1]['id'] == '2'
    mock_build.assert_called_once_with('classroom', 'v1', credentials=mock_google_creds)
    mock_courses_resource.list.assert_called_once_with(studentId="me", courseStates=['ACTIVE'])

@patch('googleapiclient.discovery.build')
def test_get_courses_no_courses_found(mock_build, mock_google_creds):
    mock_service_instance = MagicMock()
    mock_courses_resource = MagicMock()
    mock_list_request = MagicMock()
    mock_list_request.execute.return_value = {} # No 'courses' key or empty list

    mock_courses_resource.list.return_value = mock_list_request
    mock_service_instance.courses.return_value = mock_courses_resource
    mock_build.return_value = mock_service_instance

    courses = classroom_service.get_courses(mock_google_creds)
    assert courses == []

@patch('googleapiclient.discovery.build')
def test_get_courses_api_error(mock_build, mock_google_creds):
    # Simulate an error during the build or execute call
    mock_build.side_effect = Exception("Google API Error")

    courses = classroom_service.get_courses(mock_google_creds)
    assert courses == []

def test_get_courses_no_credentials():
    courses = classroom_service.get_courses(None)
    assert courses == []


@patch('googleapiclient.discovery.build')
def test_get_assignments_success(mock_build, mock_google_creds):
    mock_service_instance = MagicMock()
    mock_coursework_resource = MagicMock()
    mock_list_request = MagicMock()

    mock_list_request.execute.return_value = {
        'courseWork': [
            {'id': 'cw1', 'title': 'Homework 1', 'description': 'Chapter 1 problems.',
             'dueDate': {'year': 2023, 'month': 10, 'day': 30},
             'dueTime': {'hours': 23, 'minutes': 59},
             'state': 'PUBLISHED', 'alternateLink': 'link_cw1', 'maxPoints': 100, 'workType': 'ASSIGNMENT'},
            {'id': 'cw2', 'title': 'Quiz 1', 'description': 'A short quiz on terms.',
             'dueDate': {'year': 2023, 'month': 11, 'day': 5}, # No dueTime
             'state': 'PUBLISHED', 'alternateLink': 'link_cw2', 'maxPoints': 20, 'workType': 'MULTIPLE_CHOICE_QUESTION'}
        ]
    }
    mock_coursework_resource.list.return_value = mock_list_request
    mock_service_instance.courses.return_value.courseWork.return_value = mock_coursework_resource # Chain the mock
    mock_build.return_value = mock_service_instance

    assignments = classroom_service.get_assignments(mock_google_creds, "course_123")

    assert len(assignments) == 2
    assert assignments[0]['title'] == 'Homework 1'
    assert assignments[0]['dueDate'] == '2023-10-30 23:59 UTC'
    assert assignments[1]['title'] == 'Quiz 1'
    assert assignments[1]['dueDate'] == '2023-11-05 (Date only, no specific time)'
    assert assignments[1]['maxPoints'] == 20

    mock_build.assert_called_once_with('classroom', 'v1', credentials=mock_google_creds)
    mock_coursework_resource.list.assert_called_once_with(
        courseId="course_123",
        orderBy="dueDate asc",
        courseWorkStates=['PUBLISHED']
    )

@patch('googleapiclient.discovery.build')
def test_get_assignments_no_assignments_found(mock_build, mock_google_creds):
    mock_service_instance = MagicMock()
    mock_coursework_resource = MagicMock()
    mock_list_request = MagicMock()
    mock_list_request.execute.return_value = {} # No 'courseWork' key

    mock_coursework_resource.list.return_value = mock_list_request
    mock_service_instance.courses.return_value.courseWork.return_value = mock_coursework_resource
    mock_build.return_value = mock_service_instance

    assignments = classroom_service.get_assignments(mock_google_creds, "course_empty")
    assert assignments == []

@patch('googleapiclient.discovery.build')
def test_get_assignments_api_error(mock_build, mock_google_creds):
    mock_build.side_effect = Exception("Google API Error")

    assignments = classroom_service.get_assignments(mock_google_creds, "course_error")
    assert assignments == []

def test_get_assignments_no_credentials():
    assignments = classroom_service.get_assignments(None, "course_no_creds")
    assert assignments == []

def test_get_assignments_no_course_id(mock_google_creds):
    # No need to mock build here as it shouldn't be called if course_id is missing
    assignments = classroom_service.get_assignments(mock_google_creds, "")
    assert assignments == []
    assignments_none = classroom_service.get_assignments(mock_google_creds, None)
    assert assignments_none == []

```

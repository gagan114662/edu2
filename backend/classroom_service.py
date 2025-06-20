# backend/classroom_service.py

from typing import List, Dict, Any, Optional

from googleapiclient.discovery import build, Resource # For building the service and type hinting
from google.oauth2.credentials import Credentials # For type hinting credentials

# Regarding User model import:
# from main import User # This could cause circular dependency if main.py also imports from classroom_service.py
# Similar to google_api_utils.py, we'd use TYPE_CHECKING for type hints if User model is needed directly.
# from typing import TYPE_CHECKING
# if TYPE_CHECKING:
#     from main import User
# For now, functions will expect user-like objects or specific attributes.

# Regarding google_api_utils import:
# from . import google_api_utils # This would be used if classroom_service needs to call get_google_api_credentials
# This will be uncommented when functions using it are implemented.

# This file will contain functions to interact with the Google Classroom API.

def get_courses(user_google_credentials: Credentials) -> List[Dict[str, Any]]:
    """
    Fetches a list of courses for the user from Google Classroom.

    Args:
        user_google_credentials: Valid Google OAuth2 credentials for the user.

    Returns:
        A list of dictionaries, where each dictionary represents a course
        with selected fields (e.g., id, name, descriptionHeading, teacher).
        Returns an empty list if an error occurs or no courses are found.
    """
    if not user_google_credentials:
        print("Error: No Google credentials provided to get_courses.")
        return []

    try:
        # Ensure credentials are valid (e.g. by checking creds.valid or refreshing if needed)
        # This step is crucial and typically handled before calling this function,
        # e.g., by get_google_api_credentials in google_api_utils.py
        # If user_google_credentials might be stale, they must be refreshed first.
        # For now, assume they are valid when passed to this function.

        service: Resource = build('classroom', 'v1', credentials=user_google_credentials)

        # Call the Classroom API
        # Fetches courses where the user is a student, and the course is ACTIVE.
        results = service.courses().list(studentId="me", courseStates=['ACTIVE']).execute()
        courses = results.get('courses', [])

        formatted_courses: List[Dict[str, Any]] = []
        if courses:
            for course in courses:
                # Basic course details
                course_info = {
                    "id": course.get("id"),
                    "name": course.get("name"),
                    "descriptionHeading": course.get("descriptionHeading"),
                    # "enrollmentCode": course.get("enrollmentCode"), # Usually only for teachers
                    "courseState": course.get("courseState"),
                    "alternateLink": course.get("alternateLink"), # Link to the course in Classroom UI
                }
                # Attempt to get teacher information (this might not always be available directly this way for students)
                # The 'teachers' field is typically available if requested via courses.get with specific permissions.
                # For courses.list, teacher info might be limited.
                # 'ownerId' is the primary teacher's ID.
                # For simplicity, we won't fetch detailed teacher profiles here.
                # descriptionHeading sometimes contains teacher name or period info.

                # The `teacherFolder` is related to Drive, might not be what we want for "teacher name".
                # `course.get("teachers")` would be a list of UserProfiles if available.
                # For now, we'll skip complex teacher fetching.
                # course_info["teacher"] = "N/A" # Placeholder

                formatted_courses.append(course_info)

        return formatted_courses
    except Exception as e:
        # Log the error for debugging purposes
        print(f"An error occurred while fetching Google Classroom courses: {e}")
        # Specific error handling can be added here:
        # For example, if e is an HttpError from googleapiclient.errors, check e.resp.status
        # If status is 401/403, it might indicate token issues not caught by prior refresh logic
        # or insufficient permissions for the Classroom API.
        # if isinstance(e, googleapiclient.errors.HttpError):
        #     if e.resp.status in [401, 403]:
        #         print(f"Auth error fetching courses: {e.resp.status} - {e._get_reason()}")
        #         # This might indicate a need to re-authenticate or that token needs refresh
        #         # and the refresh attempt (if any, before this call) failed.
        return []

def get_assignments(user_google_credentials: Credentials, course_id: str) -> List[Dict[str, Any]]:
    """
    Fetches a list of coursework for a specific course from Google Classroom.

    Args:
        user_google_credentials: Valid Google OAuth2 credentials for the user.
        course_id: The ID of the course for which to fetch assignments.

    Returns:
        A list of dictionaries, where each dictionary represents an assignment
        with selected fields (e.g., id, title, description, dueDate, alternateLink).
        Returns an empty list if an error occurs or no assignments are found.
    """
    if not user_google_credentials:
        print("Error: No Google credentials provided to get_assignments.")
        return []
    if not course_id:
        print("Error: course_id is required to fetch assignments.")
        return []

    try:
        service: Resource = build('classroom', 'v1', credentials=user_google_credentials)

        # Call the Classroom API to get coursework for the specified course
        # We can also filter by courseWorkStates, e.g., ['PUBLISHED'] to get only published assignments
        results = service.courses().courseWork().list(
            courseId=course_id,
            orderBy="dueDate asc", # Order by due date
            courseWorkStates=['PUBLISHED'] # Fetch only published assignments
        ).execute()

        coursework_items = results.get('courseWork', [])

        formatted_assignments: List[Dict[str, Any]] = []
        if coursework_items:
            for item in coursework_items:
                due_date_obj = item.get("dueDate")
                due_time_obj = item.get("dueTime")

                formatted_due_datetime_str = None
                if due_date_obj:
                    year = due_date_obj.get('year', 0)
                    month = due_date_obj.get('month', 1)
                    day = due_date_obj.get('day', 1)

                    hour = 0
                    minute = 0
                    if due_time_obj:
                        hour = due_time_obj.get('hours', 0)
                        minute = due_time_obj.get('minutes', 0)

                    # Construct datetime object. Handle potential missing parts, though API usually provides them if date/time is set.
                    # Classroom API due times are in UTC.
                    try:
                        # Create a naive datetime first, then assume UTC if no timezone info from API (Classroom usually implies UTC for due times)
                        # The API docs state: "Time of day the work is due, in UTC."
                        # However, the TimeOfDay object doesn't explicitly contain timezone offset.
                        # For consistency, one might construct a timezone-aware datetime object if needed by frontend.
                        # Here, we format it as a string.
                        # If year, month, or day is missing, this might error or give odd dates.
                        # The API guarantees year, month, day if dueDate is set. Hours/minutes default to 0 if not in dueTime.

                        # Simple string formatting:
                        formatted_due_datetime_str = f"{year:04d}-{month:02d}-{day:02d}"
                        if due_time_obj: # Only add time if dueTime was present
                             formatted_due_datetime_str += f" {hour:02d}:{minute:02d} UTC"
                        else: # If only date is present, note that time is not specified
                            formatted_due_datetime_str += " (Date only, no specific time)"


                    except ValueError as ve:
                        print(f"Error parsing date/time for assignment {item.get('id')}: {ve}")
                        formatted_due_datetime_str = "Invalid date/time format from API"

                formatted_assignments.append({
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "description": item.get("description"),
                    "state": item.get("state"),
                    "alternateLink": item.get("alternateLink"),
                    "creationTime": item.get("creationTime"),
                    "updateTime": item.get("updateTime"),
                    "dueDate": formatted_due_datetime_str,
                    "maxPoints": item.get("maxPoints"),
                    "workType": item.get("workType"),
                })
        return formatted_assignments
    except Exception as e:
        print(f"An error occurred while fetching Google Classroom assignments for course {course_id}: {e}")
        return []
```

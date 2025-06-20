import os
from datetime import datetime, timedelta, timezone # Keep for other uses if any, but not for JWT expiry here
from fastapi import FastAPI, HTTPException, Depends
# from fastapi.responses import RedirectResponse # No longer used
from sqlalchemy import create_engine, Column, Integer, String, select, ForeignKey, UniqueConstraint

from sqlalchemy.orm import Session, sessionmaker, relationship
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.declarative import declarative_base
# from jose import jwt, JWTError # No longer used for custom JWTs
# from google.oauth2 import credentials as google_credentials # No longer used
# from google_auth_oauthlib.flow import Flow as GoogleFlow # No longer used
# import requests # No longer used for fetching user info from Google API
from fastapi.security import OAuth2PasswordBearer
# from fastapi import Request as FastAPIRequest # No longer needed for state cookie
# from starlette.responses import Response as StarletteResponse # No longer needed for state cookie
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List
# from itsdangerous import URLSafeTimedSerializer # No longer used

import firebase_admin
from firebase_admin import credentials as firebase_credentials, auth as firebase_auth, firestore
from google.cloud.exceptions import NotFound as GoogleCloudNotFound


load_dotenv()

# Environment Variables
# IMPORTANT: For production, ensure GOOGLE_CLIENT_SECRET and JWT_SECRET_KEY are securely managed
# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI are no longer needed for backend.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000") # Still might be useful for other things

# Old JWT Settings - REMOVED
# JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your_super_secret_key_please_change_me_for_real")
# ALGORITHM = "HS256"
# ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Initialize Firebase Admin SDK
cred_path = os.getenv("FIREBASE_ADMIN_SDK_CREDENTIALS_PATH")
if not cred_path:
    print("WARNING: FIREBASE_ADMIN_SDK_CREDENTIALS_PATH environment variable not set.")
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        try:
            firebase_admin.initialize_app()
            print("Firebase Admin SDK initialized with default GOOGLE_APPLICATION_CREDENTIALS.")
        except Exception as e_default:
            print(f"Failed to initialize Firebase Admin SDK with default credentials: {e_default}")
    else:
        print("CRITICAL: Firebase Admin SDK not initialized. No credentials path provided and GOOGLE_APPLICATION_CREDENTIALS not set.")
else:
    try:
        cred = firebase_credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized successfully using path from FIREBASE_ADMIN_SDK_CREDENTIALS_PATH.")
    except Exception as e_path:
        print(f"CRITICAL: Error initializing Firebase Admin SDK using path '{cred_path}': {e_path}. Application may not function correctly.")
        # Depending on the application's needs, you might want to raise the exception here
        # to prevent the app from starting if Firebase Admin SDK is essential.
        # raise e_path

# SQLAlchemy Setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    # Firebase UID will be the primary link to Firebase users
    firebase_uid = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False) # Email from Firebase is verified
    full_name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)
    role = Column(String, default='student', nullable=False)

    # Relationships for ParentChildLink
    children = relationship("ParentChildLink", foreign_keys="[ParentChildLink.parent_id]", back_populates="parent")
    parents = relationship("ParentChildLink", foreign_keys="[ParentChildLink.child_id]", back_populates="child")

class ParentChildLink(Base):
    __tablename__ = "parent_child_links"
    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    child_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    parent = relationship("User", foreign_keys=[parent_id])
    child = relationship("User", foreign_keys=[child_id])

    __table_args__ = (UniqueConstraint('parent_id', 'child_id', name='uq_parent_child'),)

def create_db_and_tables():
    Base.metadata.create_all(bind=engine)

class UserResponse(BaseModel):
    id: int
    firebase_uid: str # Add firebase_uid
    email: str
    full_name: str | None = None
    picture_url: str | None = None
    role: str
    class Config:
        from_attributes = True

# Pydantic models for ParentChildLink
class UserBasicInfo(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    role: str

    class Config:
        from_attributes = True

class ParentChildLinkCreate(BaseModel):
    child_email: str

class ParentChildLinkResponse(BaseModel):
    id: int
    parent_id: int
    child_id: int

    class Config:
        from_attributes = True

# Pydantic Models for Dashboard Data
class TopicProgress(BaseModel):
    topic_name: str
    progress_percentage: float
    skill_rating: str | None = None

class RecentActivity(BaseModel):
    timestamp: str # ISO format string
    description: str
    duration_minutes: int | None = None
    accuracy_percentage: float | None = None

class PerformanceTrendPoint(BaseModel):
    date: str # "YYYY-MM-DD" or week start date
    value: float # e.g., hours spent, average score

class ChildDashboardData(BaseModel):
    child_id: int
    child_full_name: str
    total_tutoring_time_week_minutes: int
    total_tutoring_time_month_minutes: int
    sessions_completed_week: int
    sessions_completed_month: int
    overall_curriculum_progress: float
    strengths: List[str]
    weaknesses: List[str]
    progress_by_topic: List[TopicProgress]
    recent_activity_log: List[RecentActivity]
    performance_trends: List[PerformanceTrendPoint]
    alerts: List[str] = []

app = FastAPI()

@app.on_event("startup")
async def on_startup():
    create_db_and_tables()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl is notional for Firebase

# get_current_active_user verifies Firebase token and returns local DB User model instance
async def get_current_active_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not firebase_admin._apps:
        print("CRITICAL: Firebase Admin SDK not initialized in get_current_active_user.")
        raise HTTPException(status_code=503, detail="Authentication service unavailable.")

    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials / Invalid Firebase ID token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        decoded_token = firebase_auth.verify_id_token(token)
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has expired. Please re-authenticate.", headers={"WWW-Authenticate": "Bearer"})
    except firebase_auth.InvalidIdTokenError:
        raise credentials_exception
    except Exception as e: # Catch any other unforeseen errors during token verification itself
        print(f"Unexpected error verifying Firebase token: {e}")
        raise HTTPException(status_code=500, detail="Could not verify authentication token.")

    firebase_uid = decoded_token.get("uid")
    if not firebase_uid:
        # This case should ideally be caught by verify_id_token's own checks,
        # but as a safeguard:
        raise HTTPException(status_code=400, detail="Firebase UID not found in token.")

    # Try to find user in local DB
    user = db.execute(select(User).where(User.firebase_uid == firebase_uid)).scalar_one_or_none()

    email = decoded_token.get("email")
    name = decoded_token.get("name")
    picture = decoded_token.get("picture")

    if user is None:
        # User does not exist, create new user
        if not email: # Email is required for our User model
             raise HTTPException(status_code=400, detail="Email not found in Firebase token, cannot create user.")

        new_user = User(
            firebase_uid=firebase_uid,
            email=email,
            full_name=name,
            picture_url=picture
        )
        try:
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            print(f"New user created for Firebase UID: {firebase_uid}, Email: {email}")
            return new_user
        except Exception as e_db: # Catch SQLAlchemy errors, e.g., IntegrityError for duplicate email if not caught by UID query
            db.rollback()
            print(f"Database error creating new user: {e_db}")
            # Check if it's a duplicate email for a *different* firebase_uid (should be rare if email is verified by Firebase)
            existing_by_email = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if existing_by_email:
                 raise HTTPException(status_code=409, detail=f"An account with email {email} already exists but with a different Firebase UID.")
            raise HTTPException(status_code=500, detail="Could not create user profile in database.")

    else:
        # User exists, optionally update their info
        updated = False
        if user.full_name != name and name is not None: # Only update if changed and not None
            user.full_name = name
            updated = True
        if user.picture_url != picture and picture is not None: # Only update if changed and not None
            user.picture_url = picture
            updated = True

        if updated:
            try:
                db.commit()
                db.refresh(user)
                print(f"User profile updated for Firebase UID: {firebase_uid}")
            except Exception as e_db_update:
                db.rollback()
                print(f"Database error updating user profile: {e_db_update}")
                # Non-critical, can proceed with stale data, or raise 500
                # For now, proceed with the user object as it was pre-update attempt
        return user

@app.get("/")
async def root():
    return {"message": "AI Tutor Backend - Firebase Auth"}

# Old /auth/google/login, /auth/google/callback, create_access_token, and /api/auth/logout are removed.

@app.get("/api/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    # current_user is now an SQLAlchemy User model instance from get_current_active_user
    return current_user

@app.post("/api/links/parent-child", response_model=ParentChildLinkResponse)
async def link_parent_to_child(
    link_data: ParentChildLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if current_user.role != 'parent':
        raise HTTPException(status_code=403, detail="Only parents can link to children.")

    child_user = db.execute(select(User).where(User.email == link_data.child_email)).scalar_one_or_none()
    if not child_user:
        raise HTTPException(status_code=404, detail="Child user not found.")

    # Check for self-linking first
    if current_user.id == child_user.id:
        raise HTTPException(status_code=400, detail="Cannot link to oneself.")

    if child_user.role != 'student':
        raise HTTPException(status_code=400, detail="Can only link to student users.")

    # Check if link already exists
    existing_link = db.execute(
        select(ParentChildLink).where(
            ParentChildLink.parent_id == current_user.id,
            ParentChildLink.child_id == child_user.id
        )
    ).scalar_one_or_none()

    if existing_link:
        # You might want to return a 200 OK with the existing link
        # or a specific message, e.g., a 409 Conflict if creating is the only action.
        # For now, let's return the existing link as if it was just created.
        return existing_link

    new_link = ParentChildLink(parent_id=current_user.id, child_id=child_user.id)
    try:
        db.add(new_link)
        db.commit()
        db.refresh(new_link)
        return new_link
    except IntegrityError: # Handles unique constraint violation (uq_parent_child)
        db.rollback()
        # This might happen in a race condition if the check above passes for two concurrent requests
        # Re-fetch to ensure the correct link is returned if it was created by another request
        existing_link_after_race = db.execute(
            select(ParentChildLink).where(
                ParentChildLink.parent_id == current_user.id,
                ParentChildLink.child_id == child_user.id
            )
        ).scalar_one_or_none()
        if existing_link_after_race:
            return existing_link_after_race # Return the link that caused the integrity error
        # If it's some other integrity error, this would be a 500, but uq_parent_child is most likely
        raise HTTPException(status_code=409, detail="Link could not be created due to a conflict. It might already exist.")


@app.get("/api/users/me/children", response_model=List[UserBasicInfo])
async def get_my_linked_children(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'parent':
        raise HTTPException(status_code=403, detail="Only parents can view linked children.")

    # Query ParentChildLink table for entries where parent_id is current_user.id
    # The relationship User.children already gives us ParentChildLink objects
    # We need to iterate through these and get the .child (which is a User object)
    linked_children_users = []
    for link in current_user.children: # current_user.children is a list of ParentChildLink objects
        # The 'child' attribute in ParentChildLink is the related User object for the child.
        # We need to ensure the relationship is loaded, or explicitly query.
        # Given current_user is from get_current_active_user, relationships might not be loaded by default.
        # Let's explicitly query to be sure and to potentially optimize if relationships are lazy.
        # However, SQLAlchemy might be smart enough with `current_user.children`.
        # For clarity and directness, let's use the relationships if they work,
        # otherwise, an explicit query on ParentChildLink would be:
        # links = db.query(ParentChildLink).filter(ParentChildLink.parent_id == current_user.id).all()
        # child_ids = [link.child_id for link in links]
        # if child_ids:
        #     linked_children_users = db.query(User).filter(User.id.in_(child_ids)).all()

        # Assuming User.children relationship correctly fetches ParentChildLink instances
        # and ParentChildLink.child relationship correctly fetches the User instance for the child.
        # This is typical SQLAlchemy behavior.
        if link.child: # The User object representing the child
            linked_children_users.append(link.child)

    return linked_children_users

@app.get("/api/parent/children/{child_user_id}/dashboard", response_model=ChildDashboardData)
async def get_child_dashboard_data(
    child_user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'parent':
        raise HTTPException(status_code=403, detail="Access denied: User is not a parent.")

    # Verify parent-child link
    link = db.execute(
        select(ParentChildLink).where(
            ParentChildLink.parent_id == current_user.id,
            ParentChildLink.child_id == child_user_id
        )
    ).scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=403, detail="Access denied: You are not linked to this child.")

    child_user = db.execute(select(User).where(User.id == child_user_id)).scalar_one_or_none()
    if not child_user:
        # This case should ideally not be reached if a link exists,
        # as it implies data inconsistency (link exists to a non-existent user).
        raise HTTPException(status_code=404, detail="Child user not found.")

    # Mock data construction
    # Ensure datetime and timedelta are available if not already imported at the top
    db_fs = firestore.client()
    child_firebase_uid = child_user.firebase_uid

    # Initialize default values
    progress_by_topic_list = []
    strengths_list = []
    weaknesses_list = []
    recent_activity_log_list = []
    performance_trends_list = []
    overall_curriculum_progress_val = 0.0
    total_tutoring_time_week_val = 0
    total_tutoring_time_month_val = 0
    sessions_completed_week_val = 0
    sessions_completed_month_val = 0
    alerts_list = []

    try:
        # Fetch Topic Mastery
        topics_ref = db_fs.collection('student_progress').document(child_firebase_uid).collection('topic_mastery')
        topics_docs = topics_ref.stream()
        for doc in topics_docs:
            topic_data = doc.to_dict()
            # Ensure required fields are present, provide defaults if not
            progress_percentage = topic_data.get('progress_percentage', 0.0)
            skill_rating = topic_data.get('skill_rating', 'Not Evaluated')
            topic_name = topic_data.get('topic_name', doc.id) # Use doc.id as fallback for topic_name

            progress_by_topic_list.append(TopicProgress(
                topic_name=topic_name,
                progress_percentage=progress_percentage,
                skill_rating=skill_rating
            ))
            if progress_percentage >= 80: # Example threshold for strength
                strengths_list.append(topic_name)
            elif progress_percentage < 50: # Example threshold for weakness
                weaknesses_list.append(topic_name)

        # Fetch Overall Progress from student's main progress document
        student_progress_doc_ref = db_fs.collection('student_progress').document(child_firebase_uid)
        student_progress_doc = student_progress_doc_ref.get()
        if student_progress_doc.exists:
            overall_curriculum_progress_val = student_progress_doc.to_dict().get('overall_curriculum_progress', 0.0)

        # Fetch Sessions for Recent Activity & Aggregations
        # Fetch sessions from the last ~30 days for week/month calculations.
        # For performance trends (e.g., last 4 weeks), might need more, or adjust trend detail.
        now = datetime.utcnow().replace(tzinfo=timezone.utc) # Ensure timezone aware
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_of_week = now - timedelta(days=now.weekday())
        start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)

        # For performance trends (last 4 weeks)
        four_weeks_ago = now - timedelta(weeks=4)
        four_weeks_ago = four_weeks_ago.replace(hour=0, minute=0, second=0, microsecond=0)

        sessions_ref = db_fs.collection('student_progress').document(child_firebase_uid).collection('sessions')
        # Query sessions from at least four_weeks_ago to cover all calculations
        sessions_query = sessions_ref.where('timestamp', '>=', four_weeks_ago).order_by('timestamp', direction=firestore.Query.DESCENDING)
        session_docs = sessions_query.stream()

        weekly_sessions_count = [0] * 4 # For last 4 weeks, current week is index 3

        for doc in session_docs:
            session_data = doc.to_dict()
            session_timestamp_obj = session_data.get('timestamp')

            # Convert Firestore Timestamp to datetime object if necessary
            if isinstance(session_timestamp_obj, firestore.SERVER_TIMESTAMP.__class__): #This is a bit of a hack way to check type
                 # If it's a server timestamp placeholder, it might not be resolved yet, skip or handle
                continue
            if not isinstance(session_timestamp_obj, datetime):
                 # Attempt to parse if it's an ISO string, or handle other formats
                try:
                    session_timestamp_obj = datetime.fromisoformat(str(session_timestamp_obj).replace('Z', '+00:00'))
                    if session_timestamp_obj.tzinfo is None: # Ensure tz-aware for comparison
                        session_timestamp_obj = session_timestamp_obj.replace(tzinfo=timezone.utc)
                except ValueError: # Skip if timestamp is not in a recognized format
                    print(f"Warning: Skipping session with unparseable timestamp: {session_timestamp_obj}")
                    continue

            # Ensure timestamp is timezone-aware (UTC) for comparison
            if session_timestamp_obj.tzinfo is None:
                session_timestamp_obj = session_timestamp_obj.replace(tzinfo=timezone.utc)


            # Recent Activity Log (limit to last 20 or so of the already time-filtered sessions)
            if len(recent_activity_log_list) < 20:
                 recent_activity_log_list.append(RecentActivity(
                    timestamp=session_timestamp_obj.isoformat(),
                    description=session_data.get('description', 'N/A'),
                    duration_minutes=session_data.get('duration_minutes'),
                    accuracy_percentage=session_data.get('accuracy_percentage')
                ))

            # Aggregations for week/month
            duration = session_data.get('duration_minutes', 0)
            if session_timestamp_obj >= start_of_week:
                total_tutoring_time_week_val += duration
                sessions_completed_week_val += 1
            if session_timestamp_obj >= start_of_month:
                total_tutoring_time_month_val += duration
                sessions_completed_month_val += 1

            # Performance Trends: sessions per week for the last 4 weeks
            for i in range(4):
                week_start_boundary = now - timedelta(weeks=(4-i))
                week_start_boundary = week_start_boundary.replace(hour=0, minute=0, second=0, microsecond=0)
                week_end_boundary = now - timedelta(weeks=(3-i)) # Non-inclusive end or adjust
                week_end_boundary = week_end_boundary.replace(hour=0, minute=0, second=0, microsecond=0)

                if week_start_boundary <= session_timestamp_obj < week_end_boundary :
                     # This logic for weekly_sessions_count is simplified.
                     # A more robust way is to group by week number after fetching.
                     # For simplicity here, this might overcount if sessions are near boundaries.
                     # Correct approach: determine week number for each session, then sum.
                     # Let's adjust to assign to correct week bucket based on how many weeks ago it was
                    delta_weeks = (now - session_timestamp_obj).days // 7
                    if 0 <= delta_weeks < 4:
                        # index 3 = current week, 2 = last week, ... 0 = 3 weeks ago
                        week_index = 3 - delta_weeks
                        weekly_sessions_count[week_index] +=1


        # Create PerformanceTrendPoint data from weekly_sessions_count
        for i in range(4):
            # Date for the start of that week (Monday)
            week_start_date = (now - timedelta(weeks=(3-i))).replace(hour=0, minute=0, second=0, microsecond=0)
            week_start_date_monday = week_start_date - timedelta(days=week_start_date.weekday())
            performance_trends_list.append(PerformanceTrendPoint(
                date=week_start_date_monday.strftime("%Y-%m-%d"),
                value=weekly_sessions_count[i]
            ))

        # Generate Alerts
        # 1. Inactivity Alert
        if recent_activity_log_list:
            # recent_activity_log_list is sorted DESC by timestamp from query
            most_recent_session_timestamp_str = recent_activity_log_list[0].timestamp
            most_recent_session_dt = datetime.fromisoformat(most_recent_session_timestamp_str)
            if (now - most_recent_session_dt).days > 5:
                alerts_list.append(f"Child has not had a session in over 5 days (last session: {most_recent_session_dt.strftime('%Y-%m-%d')}).")
        else:
            # No sessions at all in the queried period (last 4 weeks)
            # This could mean inactivity for longer, or a new student.
            # For a more definitive "no sessions ever", one might need a separate check or rely on overall progress.
            alerts_list.append("No recent sessions recorded in the last 4 weeks.")

        # 2. New Topic Mastery Alert (Simplified)
        mastery_alerts_count = 0
        # Sort topics by last_practiced_timestamp if available, or just iterate
        # For this simplified version, we iterate as is. A real version might need last_practiced_timestamp in TopicProgress.
        # We'll use the progress_by_topic_list which is already populated.
        # Let's assume topics_docs from earlier also had last_practiced_timestamp if we want to use it.
        # For now, based on current TopicProgress model (no last_practiced):
        for topic in progress_by_topic_list:
            if mastery_alerts_count < 2: # Limit to 2 mastery alerts
                if topic.progress_percentage == 100.0 or topic.skill_rating == "Excellent":
                    # To make this "recent", we'd need a timestamp on the topic mastery itself,
                    # or infer from recent sessions covering this topic.
                    # The current data model for TopicProgress doesn't have a 'last_mastered_timestamp'.
                    # We'll make a generic mastery alert.
                    alerts_list.append(f"Great job! Progress made in {topic.topic_name} ({topic.skill_rating}, {topic.progress_percentage}%).")
                    mastery_alerts_count += 1
            else:
                break

    except GoogleCloudNotFound:
        # This means the student_progress document or subcollections might not exist.
        alerts_list.append("No progress data found for this child yet.")
        # Defaults will be returned, which is acceptable.
        print(f"No Firestore data found for child UID: {child_firebase_uid}. Returning defaults.")
    except Exception as e:
        # Log other potential errors (e.g., permission issues, data parsing)
        print(f"Error fetching dashboard data from Firestore for child UID {child_firebase_uid}: {e}")
        # Depending on policy, you might want to raise an HTTPException or return defaults.
        # For now, returning defaults for robustness.
        # Consider re-raising if it's a critical error: raise HTTPException(status_code=500, detail="Error fetching dashboard data.")

    return ChildDashboardData(
        child_id=child_user_id,
        child_full_name=child_user.full_name if child_user.full_name else "Child User",
        total_tutoring_time_week_minutes=total_tutoring_time_week_val,
        total_tutoring_time_month_minutes=total_tutoring_time_month_val,
        sessions_completed_week=sessions_completed_week_val,
        sessions_completed_month=sessions_completed_month_val,
        overall_curriculum_progress=overall_curriculum_progress_val,
        strengths=strengths_list,
        weaknesses=weaknesses_list,
        progress_by_topic=progress_by_topic_list,
        recent_activity_log=recent_activity_log_list, # Already sorted by Firestore query
        performance_trends=performance_trends_list,
        alerts=alerts_list
    )

# Placeholder for future endpoints that might require the Firebase UID directly
# @app.post("/some_action")
# async def some_action(current_user_firebase_uid: str = Depends(get_current_firebase_uid)):
#     return {"message": f"Action performed by user {current_user_firebase_uid}"}

# Note: The User model in DB should now use firebase_uid as a key identifier.
# The UserResponse model should also reflect this.
# Existing /api/users/me needs to be adapted to fetch User from DB using firebase_uid.
# This will be part of "Adapt User Profile Management".

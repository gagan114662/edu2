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
from firebase_admin import credentials as firebase_credentials, auth as firebase_auth

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
    # from datetime import datetime, timedelta (already imported)

    mock_data = ChildDashboardData(
        child_id=child_user_id,
        child_full_name=child_user.full_name if child_user.full_name else "Child User", # Use actual child name
        total_tutoring_time_week_minutes=120,
        total_tutoring_time_month_minutes=480,
        sessions_completed_week=5,
        sessions_completed_month=20,
        overall_curriculum_progress=75.5,
        strengths=["Algebra", "Geometry"],
        weaknesses=["Trigonometry"],
        progress_by_topic=[
            TopicProgress(topic_name="Algebra", progress_percentage=90.0, skill_rating="Excellent"),
            TopicProgress(topic_name="Geometry", progress_percentage=80.0, skill_rating="Satisfactory"),
            TopicProgress(topic_name="Trigonometry", progress_percentage=50.0, skill_rating="Needs Improvement"),
        ],
        recent_activity_log=[
            RecentActivity(timestamp=datetime.utcnow().isoformat(), description="Completed session on Algebra", duration_minutes=30, accuracy_percentage=95.0),
            RecentActivity(timestamp=(datetime.utcnow() - timedelta(days=1)).isoformat(), description="Practiced Trigonometry problems", duration_minutes=45, accuracy_percentage=60.0),
            RecentActivity(timestamp=(datetime.utcnow() - timedelta(days=2)).isoformat(), description="Reviewed Geometry concepts", duration_minutes=25, accuracy_percentage=88.0),
        ],
        performance_trends=[
            PerformanceTrendPoint(date=(datetime.utcnow() - timedelta(weeks=3)).strftime("%Y-%m-%d"), value=5.0), # e.g. hours
            PerformanceTrendPoint(date=(datetime.utcnow() - timedelta(weeks=2)).strftime("%Y-%m-%d"), value=7.0),
            PerformanceTrendPoint(date=(datetime.utcnow() - timedelta(weeks=1)).strftime("%Y-%m-%d"), value=6.0),
            PerformanceTrendPoint(date=datetime.utcnow().strftime("%Y-%m-%d"), value=8.0),
        ]
    )
    return mock_data

# Placeholder for future endpoints that might require the Firebase UID directly
# @app.post("/some_action")
# async def some_action(current_user_firebase_uid: str = Depends(get_current_firebase_uid)):
#     return {"message": f"Action performed by user {current_user_firebase_uid}"}

# Note: The User model in DB should now use firebase_uid as a key identifier.
# The UserResponse model should also reflect this.
# Existing /api/users/me needs to be adapted to fetch User from DB using firebase_uid.
# This will be part of "Adapt User Profile Management".

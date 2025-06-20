import os
from datetime import datetime, timedelta, timezone # Keep for other uses if any, but not for JWT expiry here
from fastapi import FastAPI, HTTPException, Depends
# from fastapi.responses import RedirectResponse # No longer used
# from sqlalchemy import create_engine, Column, Integer, String, select # Keep select, Column, etc.
from sqlalchemy import create_engine, Column, Integer, String, select

from sqlalchemy.orm import Session, sessionmaker
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

def create_db_and_tables():
    Base.metadata.create_all(bind=engine)

class UserResponse(BaseModel):
    id: int
    firebase_uid: str # Add firebase_uid
    email: str
    full_name: str | None = None
    picture_url: str | None = None
    class Config:
        from_attributes = True

app = FastAPI()

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

# Placeholder for future endpoints that might require the Firebase UID directly
# @app.post("/some_action")
# async def some_action(current_user_firebase_uid: str = Depends(get_current_firebase_uid)):
#     return {"message": f"Action performed by user {current_user_firebase_uid}"}

# Note: The User model in DB should now use firebase_uid as a key identifier.
# The UserResponse model should also reflect this.
# Existing /api/users/me needs to be adapted to fetch User from DB using firebase_uid.
# This will be part of "Adapt User Profile Management".

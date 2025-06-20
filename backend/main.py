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
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal as LiteralType # Added Literal
from datetime import datetime # Ensure this specific import is present

# from itsdangerous import URLSafeTimedSerializer # No longer used

import firebase_admin
from firebase_admin import credentials as firebase_credentials, auth as firebase_auth, firestore # Added firestore
import asyncio
import aiohttp
from fastapi import WebSocket, WebSocketDisconnect

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


# --- Firestore Setup ---
# Global variable for Firestore client instance
_db_firestore_client_instance = None

def get_firestore_db():
    global _db_firestore_client_instance
    if _db_firestore_client_instance is None:
        try:
            if not firebase_admin._DEFAULT_APP_NAME in firebase_admin._apps: # Check if default app is initialized
                print("CRITICAL: Firebase Admin default app not initialized when get_firestore_db was called.")
                # This case should ideally not happen if startup initialization is robust.
                # Re-attempting init here might be an option, or ensure prior init.
                # For now, let it proceed to firestore.client() which will likely use the auto-init if possible or fail.
            _db_firestore_client_instance = firestore.client()
            print("Firestore client initialized via get_firestore_db().")
        except Exception as e:
            print(f"CRITICAL: Failed to initialize Firestore client in get_firestore_db: {e}")
            raise HTTPException(status_code=503, detail="Firestore service is not available due to initialization error.")
    return _db_firestore_client_instance

# Pydantic Models for Progress Logging
class LogEventRequest(BaseModel):
    event_type: LiteralType['SESSION_START', 'SESSION_END', 'QUESTION_ANSWERED']
    event_data: Optional[Dict[str, Any]] = None
    timestamp_client: Optional[datetime] = None

# Pydantic Models for User Progress Response
class TopicProgress(BaseModel):
    questionsAttempted: int = 0
    questionsCorrect: int = 0
    masteryLevel: float = 0.0
    lastPracticed: Optional[datetime] = None

class UserProgressResponse(BaseModel):
    userId: str # This will be the firebase_uid
    email: Optional[str] = None
    totalSessions: int = 0
    totalTimeSpentSeconds: int = 0
    lastActivityTimestamp: Optional[datetime] = None
    createdAt: Optional[datetime] = None
    topics: Dict[str, TopicProgress] = {}

    class Config:
        from_attributes = True


# Gemini WebSocket Proxy Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_LIVE_API_ENDPOINT_URL = os.getenv("GEMINI_LIVE_API_ENDPOINT_URL") # Example: "wss://speech.googleapis.com/v2/streaming/voice" (this is a guess)


async def client_to_gemini_task(client_ws: WebSocket, gemini_ws: aiohttp.ClientWebSocketResponse):
    try:
        while True:
            data = await client_ws.receive_bytes()
            if data:
                await gemini_ws.send_bytes(data)
            # Consider handling text messages if client sends config as text:
            # text_data = await client_ws.receive_text()
            # await gemini_ws.send_str(text_data)
    except WebSocketDisconnect:
        print("Client disconnected from proxy while sending to Gemini.")
        # Ensure Gemini connection is closed if client disconnects abruptly
        if not gemini_ws.closed:
            await gemini_ws.close(code=aiohttp.WSCloseCode.GOING_AWAY, message=b'Client disconnected')
    except Exception as e:
        print(f"Error in client_to_gemini_task: {e}")
        if not gemini_ws.closed:
            await gemini_ws.close(code=aiohttp.WSCloseCode.INTERNAL_ERROR, message=b'Proxy error')


async def gemini_to_client_task(client_ws: WebSocket, gemini_ws: aiohttp.ClientWebSocketResponse):
    try:
        async for msg in gemini_ws:
            if client_ws.client_state == client_ws.client_state.DISCONNECTED:
                print("Client already disconnected, stopping gemini_to_client_task.")
                break

            if msg.type == aiohttp.WSMsgType.TEXT:
                await client_ws.send_text(msg.data)
            elif msg.type == aiohttp.WSMsgType.BINARY:
                await client_ws.send_bytes(msg.data)
            elif msg.type == aiohttp.WSMsgType.CLOSED:
                print("Gemini WS connection closed by remote.")
                # Propagate close to client if Gemini closes first
                if not client_ws.client_state == client_ws.client_state.DISCONNECTED:
                    await client_ws.close(code=gemini_ws.close_code or 1000)
                break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                print(f"Gemini WS connection error: {gemini_ws.exception()}")
                if not client_ws.client_state == client_ws.client_state.DISCONNECTED:
                    await client_ws.close(code=gemini_ws.close_code or 1005) # 1005: No Status Rcvd (generic)
                break
    except WebSocketDisconnect: # This can happen if client_ws.close() is called by the other task
        print("Client disconnected during gemini_to_client_task.")
    except Exception as e:
        print(f"Error in gemini_to_client_task: {e}")
        if not client_ws.client_state == client_ws.client_state.DISCONNECTED:
            try:
                await client_ws.close(code=1011) # Internal error
            except Exception: # Ignore errors during close
                pass


@app.websocket("/ws/voice_tutor")
async def websocket_voice_tutor_endpoint(client_ws: WebSocket):
    await client_ws.accept()
    print("Client WebSocket connected to /ws/voice_tutor.")

    if not GEMINI_API_KEY or not GEMINI_LIVE_API_ENDPOINT_URL:
        error_msg = "Backend not configured for Gemini Live API."
        print(f"Closing WebSocket connection: {error_msg}")
        await client_ws.send_json({"type": "error", "message": error_msg}) # Send JSON for structured error
        await client_ws.close(code=1008) # Policy Violation
        return

    async with aiohttp.ClientSession() as session:
        gemini_ws_conn = None
        try:
            print(f"Attempting to connect to Gemini Live API at {GEMINI_LIVE_API_ENDPOINT_URL}")
            # Actual headers will depend on Gemini API docs. This is a placeholder.
            # Common practice: "Authorization": f"Bearer {GEMINI_API_KEY}" or "X-Goog-Api-Key": GEMINI_API_KEY
            headers = {"Authorization": f"Bearer {GEMINI_API_KEY}"}

            gemini_ws_conn = await session.ws_connect(
                GEMINI_LIVE_API_ENDPOINT_URL,
                headers=headers,
                # Add other relevant params like protocols, heartbeat, etc.
            )
            print("Successfully connected to Gemini Live API WebSocket.")

            # Run both tasks concurrently
            # Ensure that if one task finishes (e.g., due to disconnect or error), the other is cancelled.
            receive_task = asyncio.create_task(client_to_gemini_task(client_ws, gemini_ws_conn))
            send_task = asyncio.create_task(gemini_to_client_task(client_ws, gemini_ws_conn))

            done, pending = await asyncio.wait(
                [receive_task, send_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                print(f"Cancelling pending task: {task}")
                task.cancel()

            # Await done tasks to raise exceptions if any occurred within them
            for task in done:
                try:
                    await task
                except asyncio.CancelledError:
                    print(f"Task {task} was cancelled.")
                except Exception as e:
                    print(f"Task {task} raised an exception: {e}")

        except aiohttp.ClientConnectorError as e:
            error_msg = "Failed to connect to AI voice service (connector error)."
            print(f"{error_msg} Details: {e}")
            await client_ws.send_json({"type": "error", "message": error_msg})
        except aiohttp.WSServerHandshakeError as e:
            error_msg = f"Failed to connect to AI voice service (handshake error: {e.status}, {e.message}). Check API Key and Endpoint URL."
            print(f"{error_msg} Details: {e}")
            await client_ws.send_json({"type": "error", "message": error_msg})
        except Exception as e:
            error_msg = "An unexpected error occurred with the voice service proxy."
            print(f"{error_msg} Details: {e}")
            # Check if this is an asyncio.CancelledError from the main task itself
            if not isinstance(e, asyncio.CancelledError):
                 try:
                    await client_ws.send_json({"type": "error", "message": error_msg})
                 except Exception: # If sending fails, client is likely gone
                    pass
        finally:
            print("Ensuring WebSocket connections are closed.")
            if gemini_ws_conn and not gemini_ws_conn.closed:
                print("Closing Gemini WebSocket connection.")
                await gemini_ws_conn.close()

            # Check client_ws state before attempting to close
            if client_ws.client_state != client_ws.client_state.DISCONNECTED:
                print("Closing client WebSocket connection.")
                try:
                    await client_ws.close()
                except Exception as e_close:
                    print(f"Error closing client WebSocket: {e_close}")
            print("WebSocket proxy endpoint finished.")


# --- Progress Logging Endpoint ---
@app.post("/api/progress/log_event", tags=["Progress"])
async def log_progress_event(
    event_request: LogEventRequest,
    current_user: User = Depends(get_current_active_user), # User is SQLAlchemy model
    db_fs: firestore.Client = Depends(get_firestore_db)
):
    firebase_uid = current_user.firebase_uid
    user_progress_collection_ref = db_fs.collection("UserProgress")
    user_progress_doc_ref = user_progress_collection_ref.document(firebase_uid)

    event_type = event_request.event_type
    # event_data = event_request.event_data # To be used in Phase 2
    server_timestamp = datetime.utcnow()

    try:
        doc_snapshot = user_progress_doc_ref.get()
        initial_doc_data = {
            'userId': firebase_uid,
            'email': current_user.email, # Log email from User model
            'createdAt': server_timestamp,
            'lastActivityTimestamp': server_timestamp,
            'totalSessions': 0,
            'totalTimeSpentSeconds': 0,
            'topics': {}
        }

        # --- SESSION_START ---
        if event_type == "SESSION_START":
            if not doc_snapshot.exists:
                 user_progress_doc_ref.set({
                    'userId': firebase_uid,
                    'email': current_user.email,
                    'lastActivityTimestamp': server_timestamp,
                    'createdAt': server_timestamp,
                    'totalSessions': 1,
                    'totalTimeSpentSeconds': 0,
                    'topics': {}
                })
            else:
                user_progress_doc_ref.update({
                    'lastActivityTimestamp': server_timestamp,
                    'totalSessions': firestore.Increment(1)
                })
            message = f"Logged SESSION_START for user {firebase_uid}"

        # --- SESSION_END ---
        elif event_type == "SESSION_END":
            duration_seconds = 0
            if event_request.event_data and "sessionDurationSeconds" in event_request.event_data:
                try:
                    duration_seconds = int(event_request.event_data["sessionDurationSeconds"])
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid sessionDurationSeconds format.")

            update_data = {
                'lastActivityTimestamp': server_timestamp,
                'totalTimeSpentSeconds': firestore.Increment(duration_seconds)
            }
            if not doc_snapshot.exists:
                initial_doc_data['totalTimeSpentSeconds'] = duration_seconds
                initial_doc_data['lastActivityTimestamp'] = server_timestamp
                initial_doc_data['totalSessions'] = 1 # If session_end is first, assume 1 session
                user_progress_doc_ref.set(initial_doc_data)
                message = f"UserProgress doc created and SESSION_END logged for user {firebase_uid}, duration: {duration_seconds}s."
            else:
                user_progress_doc_ref.update(update_data)
                message = f"Logged SESSION_END for user {firebase_uid}, duration: {duration_seconds}s."
            print(message)

        # --- QUESTION_ANSWERED ---
        elif event_type == "QUESTION_ANSWERED":
            if not event_request.event_data:
                raise HTTPException(status_code=400, detail="event_data is required for QUESTION_ANSWERED.")

            topic_name_raw = event_request.event_data.get("topicName")
            is_correct = event_request.event_data.get("isCorrect")

            if not topic_name_raw or not isinstance(topic_name_raw, str) or topic_name_raw.strip() == "":
                raise HTTPException(status_code=400, detail="Invalid or missing topicName (string) in event_data for QUESTION_ANSWERED.")
            if is_correct is None or not isinstance(is_correct, bool):
                raise HTTPException(status_code=400, detail="Invalid or missing isCorrect (boolean) in event_data for QUESTION_ANSWERED.")

            topic_name_sanitized = topic_name_raw.replace(".", "_").strip() # Sanitize and strip

            # Define the transaction function
            @firestore.transactional
            def update_topic_stats_in_transaction(transaction, doc_ref_to_update, uid_of_user, user_email_from_auth, topic_name_to_update, correct_answer_bool, current_server_timestamp):
                doc_snap = doc_ref_to_update.get(transaction=transaction)

                user_data_dict = {}
                if not doc_snap.exists:
                    # Initialize base document structure if it doesn't exist
                    user_data_dict = {
                        'userId': uid_of_user,
                        'email': user_email_from_auth, # Log email on creation
                        'createdAt': current_server_timestamp,
                        'lastActivityTimestamp': current_server_timestamp,
                        'totalSessions': 1, # Assume first event implies a session
                        'totalTimeSpentSeconds': 0,
                        'topics': {}
                    }
                else:
                    user_data_dict = doc_snap.to_dict()
                    if 'email' not in user_data_dict and user_email_from_auth: # Ensure email is present
                        user_data_dict['email'] = user_email_from_auth
                    if 'totalSessions' not in user_data_dict: # Ensure totalSessions is present
                        user_data_dict['totalSessions'] = 0 # Or 1 if this event implies a new session


                if 'topics' not in user_data_dict or user_data_dict['topics'] is None: # Ensure 'topics' map exists
                    user_data_dict['topics'] = {}

                current_topic_data = user_data_dict.get('topics', {}).get(topic_name_to_update, {
                    'questionsAttempted': 0,
                    'questionsCorrect': 0,
                    'masteryLevel': 0.0, # Initialize masteryLevel
                })

                new_attempted = current_topic_data['questionsAttempted'] + 1
                new_correct = current_topic_data['questionsCorrect'] + (1 if correct_answer_bool else 0)

                mastery_calculated = 0.0
                if new_attempted > 0:
                    mastery_calculated = round(new_correct / new_attempted, 3)

                user_data_dict['topics'][topic_name_to_update] = {
                    'questionsAttempted': new_attempted,
                    'questionsCorrect': new_correct,
                    'masteryLevel': mastery_calculated,
                    'lastPracticed': current_server_timestamp
                }
                user_data_dict['lastActivityTimestamp'] = current_server_timestamp

                if not doc_snap.exists:
                    transaction.set(doc_ref_to_update, user_data_dict)
                else:
                    # Atomically update only the necessary fields
                    update_payload = {
                        f'topics.{topic_name_to_update}': user_data_dict['topics'][topic_name_to_update],
                        'lastActivityTimestamp': current_server_timestamp
                    }
                    if 'email' not in doc_snap.to_dict() and user_email_from_auth:
                         update_payload['email'] = user_email_from_auth
                    # If totalSessions was 0 and this is the first question, it implies a session started.
                    if doc_snap.to_dict().get('totalSessions', 0) == 0:
                        update_payload['totalSessions'] = 1

                    transaction.update(doc_ref_to_update, update_payload)

                return new_attempted, new_correct, mastery_calculated

            # Execute the transaction
            transaction_instance = db_fs.transaction()
            attempted_count, correct_answered_count, calculated_mastery_level = update_topic_stats_in_transaction(
                transaction_instance,
                user_progress_doc_ref,
                firebase_uid,
                current_user.email,
                topic_name_sanitized,
                is_correct,
                server_timestamp
            )

            message = (f"Logged QUESTION_ANSWERED for user {firebase_uid}, topic: '{topic_name_sanitized}'. "
                       f"Correct: {is_correct}. New Stats: Attempted={attempted_count}, Correct={correct_answered_count}. "
                       f"Mastery: {calculated_mastery_level:.3f}")
            print(message)

        # --- Fallback for other/undefined event types (maintains lastActivityTimestamp) ---
        else: # Should not be reached if LiteralType in Pydantic model is exhaustive
            # This block should ideally not be reached if LiteralType for event_type is exhaustive
            # and client sends valid event_types.
            # If it's reached, it means an unknown event_type was sent.
            print(f"Warning: Received unknown event_type '{event_type}' for user {firebase_uid}.")
            update_data = {'lastActivityTimestamp': server_timestamp}
            if not doc_snapshot.exists:
                initial_doc_data.update(update_data)
                user_progress_doc_ref.set(initial_doc_data)
                message = f"UserProgress doc created and event '{event_type}' logged (updated lastActivity) for user {firebase_uid}."
            else:
                user_progress_doc_ref.update(update_data)
                message = f"Event '{event_type}' logged (updated lastActivity) for user {firebase_uid}."
            print(message)

        return {"status": "success", "message": message}

    except Exception as e:
        print(f"Error processing event {event_type} for user {firebase_uid}: {e}")
        # Consider more specific error logging in production
        raise HTTPException(status_code=500, detail=f"Error processing progress event: {str(e)}")


# --- Endpoint to Fetch User Progress ---
@app.get("/api/progress/me", response_model=UserProgressResponse, tags=["Progress"])
async def get_user_progress(
    current_user: User = Depends(get_current_active_user), # User is SQLAlchemy model
    db_fs: firestore.Client = Depends(get_firestore_db)
):
    firebase_uid = current_user.firebase_uid
    user_progress_doc_ref = db_fs.collection("UserProgress").document(firebase_uid)

    try:
        doc_snapshot = user_progress_doc_ref.get()

        if doc_snapshot.exists:
            progress_data = doc_snapshot.to_dict()
            # Pydantic will use default values from the model if fields are missing
            # and they have defaults in the model.
            # Ensure userId is correctly mapped if Firestore field is different from Pydantic model.
            # If firestore 'userId' field is firebase_uid, this is fine.
            # Our UserProgressResponse model has 'userId', and we populate it with firebase_uid.
            return UserProgressResponse(**progress_data)
        else:
            # No progress document found, return a default empty state
            return UserProgressResponse(
                userId=firebase_uid,
                email=current_user.email, # Get email from the auth user
                # Other fields will use Pydantic model defaults (0, {}, etc.)
            )
    except Exception as e:
        print(f"Error fetching progress for user {firebase_uid}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching progress data: {str(e)}")

import os
from datetime import datetime, timedelta, timezone # Keep for other uses if any, but not for JWT expiry here
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import RedirectResponse # No longer used
# from sqlalchemy import create_engine, Column, Integer, String, select # Keep select, Column, etc.
from sqlalchemy import create_engine, Column, Integer, String, select

from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.orm import declarative_base
# from jose import jwt, JWTError # No longer used for custom JWTs
# from google.oauth2 import credentials as google_credentials # No longer used
# from google_auth_oauthlib.flow import Flow as GoogleFlow # No longer used
# import requests # No longer used for fetching user info from Google API
from fastapi.security import OAuth2PasswordBearer
# from fastapi import Request as FastAPIRequest # No longer needed for state cookie
# from starlette.responses import Response as StarletteResponse # No longer needed for state cookie
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal as LiteralType, List # Added Literal
from datetime import datetime # Ensure this specific import is present

# from itsdangerous import URLSafeTimedSerializer # No longer used

import firebase_admin
from firebase_admin import credentials as firebase_credentials, auth as firebase_auth, firestore # Added firestore
import asyncio
import aiohttp
import json
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
    # Curriculum settings
    grade_level = Column(String, nullable=True)  # e.g. "Grade 5"
    curriculum_framework = Column(String, nullable=True)  # e.g. "Common Core"
    # Parent dashboard linking
    user_role = Column(String, nullable=True, default='student')  # 'student' or 'parent'
    parent_email = Column(String, nullable=True)  # Email of linked parent for students

def create_db_and_tables():
    Base.metadata.create_all(bind=engine)

class UserResponse(BaseModel):
    id: int
    firebase_uid: str # Add firebase_uid
    email: str
    full_name: str | None = None
    picture_url: str | None = None
    grade_level: str | None = None
    curriculum_framework: str | None = None
    model_config = {"from_attributes": True}

app = FastAPI(title="AI Tutor API", version="1.0.0")

# CORS Configuration for Production
origins = [
    "http://localhost:3000",      # Development
    "http://127.0.0.1:3000",      # Development with IP
    "https://dazl.ai",            # Production
    "https://www.dazl.ai",        # Production with www
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
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

    model_config = {"from_attributes": True}


# Curriculum Data Models
class CurriculumStandard(BaseModel):
    id: str  # e.g. "CCSS.MATH.5.NBT.A.1"
    subject: str  # e.g. "Math"
    grade: str  # e.g. "Grade 5" 
    topic: str  # e.g. "Number and Operations in Base Ten"
    description: str  # Human readable description
    prerequisites: List[str] = []  # List of prerequisite standard IDs

class UserCurriculumSettings(BaseModel):
    grade_level: str
    curriculum_framework: str  # e.g. "Common Core", "Cambridge", etc.

class CurriculumProgressResponse(BaseModel):
    standard_id: str
    status: str  # "not_started", "in_progress", "mastered"
    progress_percentage: float = 0.0
    last_practiced: Optional[datetime] = None

# Sample curriculum data (in production, this would be from a database)
SAMPLE_CURRICULUM_STANDARDS = {
    "Grade 1": {
        "Math": [
            CurriculumStandard(
                id="CCSS.MATH.1.OA.A.1",
                subject="Math",
                grade="Grade 1",
                topic="Operations and Algebraic Thinking",
                description="Use addition and subtraction within 20 to solve word problems"
            ),
            CurriculumStandard(
                id="CCSS.MATH.1.NBT.A.1",
                subject="Math", 
                grade="Grade 1",
                topic="Number and Operations in Base Ten",
                description="Count to 120, starting at any number less than 120"
            )
        ],
        "English": [
            CurriculumStandard(
                id="CCSS.ELA.1.RL.1",
                subject="English",
                grade="Grade 1", 
                topic="Reading Literature",
                description="Ask and answer questions about key details in a text"
            )
        ]
    },
    "Grade 2": {
        "Math": [
            CurriculumStandard(
                id="CCSS.MATH.2.OA.A.1",
                subject="Math",
                grade="Grade 2",
                topic="Operations and Algebraic Thinking", 
                description="Use addition and subtraction within 100 to solve problems"
            )
        ]
    },
    "Grade 3": {
        "Math": [
            CurriculumStandard(
                id="CCSS.MATH.3.NF.A.1",
                subject="Math",
                grade="Grade 3",
                topic="Number and Operations—Fractions",
                description="Understand a fraction 1/b as the quantity formed by 1 part when a whole is partitioned into b equal parts"
            )
        ]
    }
}


# Gemini API Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")
GEMINI_LIVE_API_ENDPOINT_URL = os.getenv("GEMINI_LIVE_API_ENDPOINT_URL", f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}")

# Initialize Google AI SDK for text generation
import google.generativeai as genai
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print(f"Gemini API configured with key: {GEMINI_API_KEY[:10]}...")
else:
    print("WARNING: GEMINI_API_KEY not set")


async def client_to_gemini_task(client_ws: WebSocket, gemini_ws: aiohttp.ClientWebSocketResponse):
    print("client_to_gemini_task started - listening for client messages")
    try:
        while True:
            # First, check what type of message we're receiving
            print("Waiting for message from client...")
            message = await client_ws.receive()
            print(f"Received message from client: {type(message)}")
            
            if "text" in message:
                # Handle text messages (like setup JSON)
                text_data = message["text"]
                print(f"Forwarding text message to Gemini: {text_data[:100]}...")
                await gemini_ws.send_str(text_data)
                print("Text message sent to Gemini successfully")
            elif "bytes" in message:
                # Handle binary audio data
                data = message["bytes"]
                print(f"Forwarding {len(data)} bytes of audio data to Gemini")
                await gemini_ws.send_bytes(data)
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
    print("gemini_to_client_task started - listening for Gemini responses")
    try:
        async for msg in gemini_ws:
            print(f"Received message from Gemini: {msg.type}")
            
            if client_ws.client_state == client_ws.client_state.DISCONNECTED:
                print("Client already disconnected, stopping gemini_to_client_task.")
                break

            if msg.type == aiohttp.WSMsgType.TEXT:
                print(f"Forwarding text response to client: {msg.data[:100]}...")
                await client_ws.send_text(msg.data)
            elif msg.type == aiohttp.WSMsgType.BINARY:
                print(f"Forwarding binary response to client: {len(msg.data)} bytes")
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
    """
    Simple voice tutor WebSocket endpoint using regular Gemini API
    """
    await client_ws.accept()
    print(f"[{datetime.now()}] Client WebSocket connected to /ws/voice_tutor")
    
    if not GEMINI_API_KEY:
        await client_ws.send_json({
            "type": "error",
            "message": "Voice service not configured. Please check API key."
        })
        await client_ws.close(code=1008)
        return
    
    # Use regular Gemini API - much more reliable
    model = genai.GenerativeModel('gemini-1.5-flash')
    chat = model.start_chat(history=[])
    
    try:
        # Send ready message to client
        await client_ws.send_json({
            "type": "setup_complete",
            "message": "Voice service ready"
        })
        
        # Handle client messages
        while True:
            message = await client_ws.receive()
            
            if "text" in message:
                try:
                    data = json.loads(message["text"])
                    
                    if data.get("type") == "user_transcript":
                        # User speech was transcribed by browser
                        user_text = data.get("text", "")
                        print(f"[{datetime.now()}] User said: {user_text}")
                        
                        # Generate response using Gemini
                        response = chat.send_message(
                            f"You are a helpful AI tutor for K-12 students. "
                            f"Respond in a friendly, educational manner to: {user_text}"
                        )
                        ai_response = response.text
                        print(f"[{datetime.now()}] AI response: {ai_response}")
                        
                        # Send response back to client
                        await client_ws.send_json({
                            "type": "tutor_transcript",
                            "text": ai_response
                        })
                        
                    elif data.get("setup"):
                        # Setup message - acknowledge
                        await client_ws.send_json({
                            "type": "setup_complete",
                            "message": "Setup acknowledged"
                        })
                        
                except json.JSONDecodeError:
                    print(f"[{datetime.now()}] Invalid JSON received: {message['text']}")
                    
            elif "bytes" in message:
                # Handle audio data - for now, just acknowledge
                audio_data = message["bytes"]
                print(f"[{datetime.now()}] Received {len(audio_data)} bytes of audio data")
                # Audio processing would go here if needed
                
    except WebSocketDisconnect:
        print(f"[{datetime.now()}] Client disconnected from voice tutor")
    except Exception as e:
        print(f"[{datetime.now()}] Error in voice tutor: {e}")
        try:
            await client_ws.send_json({
                "type": "error",
                "message": f"Voice service error: {str(e)}"
            })
        except:
            pass


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
    server_timestamp = datetime.now(timezone.utc)

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

    except HTTPException:
        # Re-raise HTTPExceptions (like 400 Bad Request) without wrapping them
        raise
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


# --- Curriculum Endpoints ---

@app.get("/api/curriculum/standards/{grade}", tags=["Curriculum"])
async def get_curriculum_standards(
    grade: str,
    subject: Optional[str] = None
):
    """Get curriculum standards for a specific grade and optionally subject"""
    try:
        if grade not in SAMPLE_CURRICULUM_STANDARDS:
            raise HTTPException(status_code=404, detail=f"No curriculum found for {grade}")
        
        grade_standards = SAMPLE_CURRICULUM_STANDARDS[grade]
        
        if subject:
            if subject not in grade_standards:
                raise HTTPException(status_code=404, detail=f"No {subject} curriculum found for {grade}")
            return grade_standards[subject]
        
        # Return all subjects for the grade
        return grade_standards
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching curriculum standards: {e}")
        raise HTTPException(status_code=500, detail="Error fetching curriculum standards")


@app.put("/api/users/me/curriculum", tags=["Users"])
async def update_user_curriculum_settings(
    settings: UserCurriculumSettings,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update user's curriculum settings"""
    try:
        # Update the user's curriculum settings in the database
        current_user.grade_level = settings.grade_level
        current_user.curriculum_framework = settings.curriculum_framework
        db.commit()
        db.refresh(current_user)
        
        return {"status": "success", "message": "Curriculum settings updated"}
    except Exception as e:
        db.rollback()
        print(f"Error updating curriculum settings: {e}")
        raise HTTPException(status_code=500, detail="Error updating curriculum settings")


@app.get("/api/curriculum/progress", tags=["Curriculum"])
async def get_curriculum_progress(
    current_user: User = Depends(get_current_active_user),
    db_fs: firestore.Client = Depends(get_firestore_db)
):
    """Get user's progress on curriculum standards"""
    try:
        firebase_uid = current_user.firebase_uid
        grade_level = current_user.grade_level or "Grade 1"  # Default to Grade 1
        
        # Get user's progress data
        user_progress_doc_ref = db_fs.collection("UserProgress").document(firebase_uid)
        doc_snapshot = user_progress_doc_ref.get()
        
        progress_data = {}
        if doc_snapshot.exists:
            progress_data = doc_snapshot.to_dict()
        
        # Get curriculum standards for user's grade
        if grade_level not in SAMPLE_CURRICULUM_STANDARDS:
            return []
        
        curriculum_progress = []
        grade_standards = SAMPLE_CURRICULUM_STANDARDS[grade_level]
        
        for subject, standards in grade_standards.items():
            for standard in standards:
                # Check if this standard has been practiced
                standard_progress = CurriculumProgressResponse(
                    standard_id=standard.id,
                    status="not_started",
                    progress_percentage=0.0
                )
                
                # Check if user has practiced topics related to this standard
                if "topics" in progress_data:
                    for topic_name, topic_data in progress_data["topics"].items():
                        # Simple matching - in production this would be more sophisticated
                        if (standard.topic.lower() in topic_name.lower() or 
                            topic_name.lower() in standard.topic.lower()):
                            attempted = topic_data.get("questionsAttempted", 0)
                            correct = topic_data.get("questionsCorrect", 0)
                            
                            if attempted > 0:
                                standard_progress.status = "in_progress"
                                standard_progress.progress_percentage = round((correct / attempted) * 100, 1)
                                
                                # Consider mastered if 80% accuracy with at least 5 attempts
                                if correct / attempted >= 0.8 and attempted >= 5:
                                    standard_progress.status = "mastered"
                                    standard_progress.progress_percentage = 100.0
                                
                                if "lastPracticed" in topic_data:
                                    standard_progress.last_practiced = topic_data["lastPracticed"]
                
                curriculum_progress.append(standard_progress)
        
        return curriculum_progress
        
    except Exception as e:
        print(f"Error fetching curriculum progress: {e}")
        raise HTTPException(status_code=500, detail="Error fetching curriculum progress")


# --- Parent Dashboard Endpoints ---

@app.get("/api/parent/children", tags=["Parent Dashboard"])
async def get_linked_children(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get list of children linked to parent account"""
    try:
        # Find all students linked to this parent's email
        children = db.execute(
            select(User).where(User.parent_email == current_user.email)
        ).scalars().all()
        
        # Return basic info for each child
        children_data = []
        for child in children:
            children_data.append({
                "id": child.id,
                "firebase_uid": child.firebase_uid,
                "full_name": child.full_name,
                "email": child.email,
                "grade_level": child.grade_level,
                "curriculum_framework": child.curriculum_framework
            })
        
        return children_data
        
    except Exception as e:
        print(f"Error fetching linked children: {e}")
        raise HTTPException(status_code=500, detail="Error fetching linked children")


@app.get("/api/parent/child/{child_firebase_uid}/progress", tags=["Parent Dashboard"])
async def get_child_progress(
    child_firebase_uid: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    db_fs: firestore.Client = Depends(get_firestore_db)
):
    """Get progress data for a specific child (parent access only)"""
    try:
        # Verify parent has access to this child
        child = db.execute(
            select(User).where(
                User.firebase_uid == child_firebase_uid,
                User.parent_email == current_user.email
            )
        ).scalar_one_or_none()
        
        if not child:
            raise HTTPException(status_code=404, detail="Child not found or not linked to your account")
        
        # Get child's progress data from Firestore
        user_progress_doc_ref = db_fs.collection("UserProgress").document(child_firebase_uid)
        doc_snapshot = user_progress_doc_ref.get()
        
        if doc_snapshot.exists:
            progress_data = doc_snapshot.to_dict()
            # Add child info to progress data
            progress_data['child_info'] = {
                'name': child.full_name,
                'email': child.email,
                'grade_level': child.grade_level,
                'curriculum_framework': child.curriculum_framework
            }
            return progress_data
        else:
            # Return empty progress with child info
            return {
                'child_info': {
                    'name': child.full_name,
                    'email': child.email,
                    'grade_level': child.grade_level,
                    'curriculum_framework': child.curriculum_framework
                },
                'totalSessions': 0,
                'totalTimeSpentSeconds': 0,
                'topics': {},
                'lastActivityTimestamp': None
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching child progress: {e}")
        raise HTTPException(status_code=500, detail="Error fetching child progress")


class LinkParentRequest(BaseModel):
    parent_email: str

@app.post("/api/users/me/link-parent", tags=["Users"])
async def link_parent_account(
    request: LinkParentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Link a parent email to current student account"""
    try:
        # Validate email format (basic check)
        if "@" not in request.parent_email:
            raise HTTPException(status_code=400, detail="Invalid email format")
        
        # Update current user's parent_email
        current_user.parent_email = request.parent_email
        db.commit()
        db.refresh(current_user)
        
        return {"status": "success", "message": f"Parent account {request.parent_email} linked successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error linking parent account: {e}")
        raise HTTPException(status_code=500, detail="Error linking parent account")


# --- AI Chat Endpoints ---

class ChatMessage(BaseModel):
    message: str
    context: Optional[str] = None  # Optional context like curriculum topic

class ChatResponse(BaseModel):
    response: str
    context: Optional[str] = None

@app.post("/api/chat/ask", response_model=ChatResponse, tags=["AI Chat"])
async def ask_tutor(
    chat_request: ChatMessage,
    current_user: User = Depends(get_current_active_user),
    db_fs: firestore.Client = Depends(get_firestore_db)
):
    """Ask the AI tutor a question with curriculum-aware responses"""
    try:
        if not GEMINI_API_KEY:
            raise HTTPException(status_code=503, detail="AI service not configured")
        
        # Get user's curriculum context
        grade_level = current_user.grade_level or "Grade 1"
        curriculum_framework = current_user.curriculum_framework or "Common Core"
        
        # Create curriculum-aware system prompt
        system_prompt = f"""You are a helpful AI tutor for K-12 students. Here's important context about your student:

- Grade Level: {grade_level}
- Curriculum: {curriculum_framework}
- Student Name: {current_user.full_name or 'Student'}

Guidelines for your responses:
1. Keep explanations appropriate for {grade_level} level
2. Use encouraging and patient tone suitable for children
3. Align with {curriculum_framework} standards when applicable
4. Break down complex concepts into simple steps
5. Use examples and analogies that kids can understand
6. If asked about topics beyond their grade level, gently redirect to age-appropriate content
7. Always be supportive and positive

Current topic context: {chat_request.context or 'General learning'}

Student's question: {chat_request.message}

Provide a helpful, educational response:"""

        # Use Gemini to generate response
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Configure safety settings for child-safe content
        safety_settings = [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
        
        response = model.generate_content(
            system_prompt,
            safety_settings=safety_settings
        )
        
        # Log the interaction for progress tracking
        try:
            await log_chat_interaction(
                current_user.firebase_uid,
                chat_request.message,
                response.text,
                chat_request.context,
                db_fs
            )
        except Exception as log_error:
            print(f"Failed to log chat interaction: {log_error}")
            # Continue even if logging fails
        
        return ChatResponse(
            response=response.text,
            context=chat_request.context
        )
        
    except Exception as e:
        print(f"Error in AI chat: {e}")
        # Provide a fallback response
        return ChatResponse(
            response="I'm sorry, I'm having trouble right now. Please try asking your question again or try a simpler version of your question.",
            context=chat_request.context
        )

async def log_chat_interaction(firebase_uid: str, question: str, answer: str, context: Optional[str], db_fs):
    """Log chat interactions for learning analytics"""
    try:
        interaction_data = {
            'timestamp': datetime.now(timezone.utc),
            'question': question,
            'answer_length': len(answer),
            'context': context,
            'interaction_type': 'chat'
        }
        
        # Store in Firestore under user's chat history
        chat_collection = db_fs.collection("ChatHistory").document(firebase_uid).collection("interactions")
        chat_collection.add(interaction_data)
        
        # Also update progress if context relates to a curriculum topic
        if context:
            progress_doc_ref = db_fs.collection("UserProgress").document(firebase_uid)
            progress_doc_ref.update({
                'lastActivityTimestamp': datetime.now(timezone.utc),
                # Optionally increment a chat counter
                'totalChatInteractions': firestore.Increment(1)
            })
            
    except Exception as e:
        print(f"Error logging chat interaction: {e}")
        # Don't raise - logging is not critical


@app.get("/api/chat/history", tags=["AI Chat"])
async def get_chat_history(
    current_user: User = Depends(get_current_active_user),
    db_fs: firestore.Client = Depends(get_firestore_db),
    limit: int = 20
):
    """Get recent chat history for the user"""
    try:
        firebase_uid = current_user.firebase_uid
        
        # Get recent chat interactions
        chat_collection = db_fs.collection("ChatHistory").document(firebase_uid).collection("interactions")
        
        # Order by timestamp, most recent first
        query = chat_collection.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(limit)
        docs = query.stream()
        
        interactions = []
        for doc in docs:
            data = doc.to_dict()
            interactions.append({
                'id': doc.id,
                'timestamp': data.get('timestamp'),
                'question': data.get('question'),
                'answer_length': data.get('answer_length'),
                'context': data.get('context'),
                'interaction_type': data.get('interaction_type')
            })
        
        return interactions
        
    except Exception as e:
        print(f"Error fetching chat history: {e}")
        raise HTTPException(status_code=500, detail="Error fetching chat history")

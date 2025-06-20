import os
from datetime import datetime, timedelta, timezone # Ensure datetime is imported for UserCurriculumProgress
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy import create_engine, Column, Integer, String, select, ForeignKey, DateTime # Added ForeignKey, DateTime
from sqlalchemy.orm import Session, sessionmaker
# from sqlalchemy.orm import relationship # Optional, if relationships are needed later
from sqlalchemy.ext.declarative import declarative_base
from jose import jwt, JWTError
from google.oauth2 import credentials as google_credentials
from google_auth_oauthlib.flow import Flow as GoogleFlow
import requests
from fastapi.security import OAuth2PasswordBearer
from fastapi import Request as FastAPIRequest # Renamed to avoid conflict with 'requests' library
from starlette.responses import Response as StarletteResponse # For setting cookies
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional, Dict # Added
import google.generativeai as genai # Added
from google.generativeai.types import HarmCategory, HarmBlockThreshold # For safety settings
import os # Already present, but good to ensure
from itsdangerous import URLSafeTimedSerializer
import curriculum_utils # Added for curriculum alignment

load_dotenv()

# Gemini API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Environment Variables
# IMPORTANT: For production, ensure GOOGLE_CLIENT_SECRET and JWT_SECRET_KEY are securely managed (e.g., via secrets manager)
# and not hardcoded or exposed in version control.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "YOUR_GOOGLE_CLIENT_SECRET")
# IMPORTANT: GOOGLE_REDIRECT_URI must be HTTPS in production.
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# JWT Settings
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your_super_secret_key_please_change_me_for_real") # Ensure this is strong and from env
ALGORITHM = "HS256" # HS256 is symmetric, ensure key is protected. Consider RS256 (asymmetric) for more complex setups.
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")) # Ensure it's an int

# OAuth State Serializer (uses JWT_SECRET_KEY for signing state cookie)
# It's okay to reuse JWT_SECRET_KEY here if it's strong, or use a dedicated STATE_SECRET_KEY
STATE_SERIALIZER = URLSafeTimedSerializer(JWT_SECRET_KEY, salt="oauth-state-salt")


# SQLAlchemy Setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Define User Model (SQLAlchemy)
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)
    selected_grade_level = Column(String, nullable=True)
    curriculum_framework = Column(String, nullable=True) # e.g., "Common Core", "StateX"

# Define UserCurriculumProgress Model (SQLAlchemy)
class UserCurriculumProgress(Base):
    __tablename__ = "user_curriculum_progress"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    standard_id = Column(String, nullable=False, index=True) # e.g., "CCSS.MATH.CONTENT.5.NF.A.1"
    status = Column(String, nullable=False, default="practiced") # e.g., "practiced", "mastered"
    last_practiced_on = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # user = relationship("User") # Optional: if you want to access User object from progress entries

def create_db_and_tables():
    Base.metadata.create_all(bind=engine)
# create_db_and_tables() # Call if DB is available; for tests, conftest handles this.

# Pydantic model for User response
class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    picture_url: str | None = None
    selected_grade_level: Optional[str] = None
    curriculum_framework: Optional[str] = None
    class Config:
        from_attributes = True

# Pydantic model for Profile Update
class ProfileUpdateRequest(BaseModel):
    selected_grade_level: Optional[str] = None
    curriculum_framework: Optional[str] = None

# Pydantic models for Tutor API
class ChatMessage(BaseModel):
    role: str # "user" or "model"
    parts: List[str]

class TutorQueryRequest(BaseModel):
    query: str
    history: Optional[List[ChatMessage]] = None
    grade_level: Optional[str] = "middle school"

class TutorQueryResponse(BaseModel):
    reply: str

app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire_time = datetime.now(timezone.utc) + (expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire_time})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None: raise credentials_exception
    return user

@app.get("/")
async def root():
    return {"message": "AI Tutor Backend - Enhanced"}

@app.get("/auth/google/login")
async def login_google(response: StarletteResponse): # Inject Starlette Response for setting cookie
    client_config = { "web": {
        "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [GOOGLE_REDIRECT_URI], "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    }}
    flow = GoogleFlow(
        client_config=client_config,
        scopes=["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
        redirect_uri=GOOGLE_REDIRECT_URI
    )
    # Generate state for CSRF protection
    oauth_state = os.urandom(16).hex()
    authorization_url, state_from_flow = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        state=oauth_state # Pass our generated state to the flow
    )

    # Store state in a signed, HTTPOnly cookie
    # Max age for state cookie (e.g., 5 minutes = 300 seconds)
    signed_oauth_state = STATE_SERIALIZER.dumps(oauth_state)
    response.set_cookie(
        key="oauth_state",
        value=signed_oauth_state,
        httponly=True,
        max_age=300,
        samesite="lax", # Lax is usually fine for OAuth redirects
        secure=False # IMPORTANT: Set to True in production (requires HTTPS)
    )
    # Comment regarding HTTPS for cookies:
    # In production, the 'secure=True' attribute must be set for cookies to ensure they are only sent over HTTPS.
    # This requires the application to be running behind an HTTPS proxy or directly with HTTPS.

    return RedirectResponse(authorization_url)

@app.get("/auth/google/callback")
async def auth_google_callback(code: str, state: str, request: FastAPIRequest, db: Session = Depends(get_db)): # state from query params, request for cookie
    # Retrieve original state from cookie
    signed_original_state = request.cookies.get("oauth_state")
    if not signed_original_state:
        raise HTTPException(status_code=400, detail="OAuth state cookie not found.")

    try:
        original_state = STATE_SERIALIZER.loads(signed_original_state, max_age=300) # Check signature and expiration
    except Exception: # Catches BadSignature, SignatureExpired
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    # Compare provided state with stored state
    if original_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch (CSRF suspected).")

    # State is valid, proceed with token fetching
    client_config = { "web": {
        "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token",
    }}
    flow = GoogleFlow(
        client_config=client_config,
        scopes=["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
        redirect_uri=GOOGLE_REDIRECT_URI,
        state=state # Pass the received state to the flow for some internal checks if any
    )

    response = StarletteResponse() # Create a response object to clear the cookie

    try:
        flow.fetch_token(code=code) # This call might use the 'state' if library supports it for CSRF at this stage too.
        credentials = flow.credentials
        credentials = flow.credentials # Get credentials after successful fetch_token

        user_info_res = requests.get(
            "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
            headers={"Authorization": f"Bearer {credentials.token}"})
        user_info_res.raise_for_status()
        user_info = user_info_res.json()
        email = user_info.get("email")
        if not email: raise HTTPException(status_code=400, detail="Email not found in Google profile")

        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            user = User(email=email, full_name=user_info.get("name"), picture_url=user_info.get("picture"))
            db.add(user)
        else:
            user.full_name = user_info.get("name")
            user.picture_url = user_info.get("picture")
        db.commit(); db.refresh(user)

        access_token = create_access_token(data={"sub": user.email})

        # Clear the oauth_state cookie as it's single-use
        response.delete_cookie("oauth_state", httponly=True, samesite="lax", secure=False) # secure=True in prod

        # Redirect to frontend with token
        # Note: RedirectResponse doesn't directly allow setting cookies for the *redirected* domain.
        # The cookie set on `response` here is for the current domain (backend).
        # We need to return the redirect and let the browser handle it.
        # If we were setting a session cookie for the frontend, it would be different.
        # Here, we're clearing a cookie on the backend's domain.

        final_redirect = RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={access_token}&token_type=bearer")
        # Copy headers from our response (like delete_cookie) to the final_redirect if they are for the same domain.
        # However, delete_cookie is for the current request's response processing by the browser.
        # The browser will process the set-cookie from this response, then follow the redirect.
        final_redirect.delete_cookie("oauth_state", httponly=True, samesite="lax", secure=False) # secure=True in prod
        return final_redirect

    except Exception as e:
        # Also try to clear cookie on error if possible
        response_on_error = StarletteResponse(status_code=500) # Or an HTML error page
        response_on_error.delete_cookie("oauth_state", httponly=True, samesite="lax", secure=False) # secure=True in prod
        # This won't work as expected because we are raising HTTPException.
        # A custom exception handler or middleware would be needed to set cookies on error responses from exceptions.
        # For now, the cookie might remain if an error occurs before explicit deletion.
        raise HTTPException(status_code=500, detail=f"Failed to authenticate with Google: {str(e)}")

@app.get("/api/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/api/users/me/profile", response_model=UserResponse)
async def update_user_profile(
    profile_data: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Update fields if they are provided in the request
    if profile_data.selected_grade_level is not None:
        current_user.selected_grade_level = profile_data.selected_grade_level
    if profile_data.curriculum_framework is not None:
        current_user.curriculum_framework = profile_data.curriculum_framework

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user

@app.post("/api/askTutor", response_model=TutorQueryResponse)
async def ask_tutor(
    request: TutorQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    try:
        # 1. Determine effective grade_level and framework
        effective_grade_level = current_user.selected_grade_level if current_user.selected_grade_level else request.grade_level
        effective_framework = current_user.curriculum_framework if current_user.curriculum_framework else None

        # 2. Initial Topic/Standard Identification (Placeholder)
        identified_standard_id = None
        identified_standard_description = None

        # 3. Construct Persona Prompt with Curriculum Context
        persona_parts = [
            "You are a helpful and friendly AI tutor for K-12 students."
        ]
        if effective_grade_level:
            persona_parts.append(f"Your current student is in {effective_grade_level}.")
        if effective_framework:
            persona_parts.append(f"They are following the {effective_framework} curriculum.")

        if identified_standard_description:
            persona_parts.append(f"The current learning focus is on: '{identified_standard_description}'. Please ensure your explanation aligns with this topic.")

        persona_parts.append(
            "Your primary goal is to explain concepts clearly, provide age-appropriate examples, "
            "and stay aligned with their specified curriculum (grade and framework). "
            "If a question seems to deviate significantly from their academic scope or curriculum, "
            "politely acknowledge it, and then gently guide them back to topics relevant to their studies, "
            "or clearly state that it's outside the current educational focus. Avoid answering off-topic questions directly."
        )
        persona_prompt = " ".join(persona_parts)

        # Prepare conversation history
        generation_history = []
        if request.history:
            for msg in request.history:
                generation_history.append({'role': msg.role, 'parts': [" ".join(msg.parts)]})

        # Configure safety settings
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        }

        # Initialize model with system instruction
        instructed_model = genai.GenerativeModel(
            model_name='gemini-pro',
            safety_settings=safety_settings,
            system_instruction=persona_prompt
        )

        # Start chat session and send message
        chat_session = instructed_model.start_chat(history=generation_history if generation_history else [])
        response = chat_session.send_message(request.query)

        # Handle response
        if not response.parts:
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                print(f"Gemini content generation blocked. Reason: {response.prompt_feedback.block_reason}")
                raise HTTPException(status_code=400, detail="The request was blocked by content safety filters. Please rephrase your query.")
            else:
                print("Gemini response was empty without a specific block reason.")
                raise HTTPException(status_code=500, detail="Received an empty response from the AI. Please try again.")

        ai_reply = response.text # Accessing .text directly concatenates parts

        # Basic Curriculum Progress Tagging (Placeholder - active when identified_standard_id is available)
        # identified_standard_id would come from a more advanced topic/standard identification logic
        # For example:
        # identified_standard_id = "CCSS.MATH.CONTENT.5.NF.A.1" # This would be dynamically determined

        if identified_standard_id: # This will be False for now, as identified_standard_id is None
            progress_entry = db.execute(
                select(UserCurriculumProgress).where(
                    UserCurriculumProgress.user_id == current_user.id,
                    UserCurriculumProgress.standard_id == identified_standard_id
                )
            ).scalar_one_or_none()

            if progress_entry:
                progress_entry.status = "practiced" # Or update based on more complex logic
                progress_entry.last_practiced_on = datetime.utcnow()
            else:
                progress_entry = UserCurriculumProgress(
                    user_id=current_user.id,
                    standard_id=identified_standard_id,
                    status="practiced"
                )
                db.add(progress_entry)

            try:
                db.commit()
            except Exception as e_progress: # Use a different variable name for the exception
                db.rollback()
                print(f"Error saving curriculum progress: {e_progress}") # Log error, but don't fail the tutor response

        return TutorQueryResponse(reply=ai_reply)

    except Exception as e:
        print(f"Error in ask_tutor endpoint: {e}")
        if isinstance(e, HTTPException):
            raise
        # For other types of errors, ensure a generic but informative message is sent.
        raise HTTPException(status_code=500, detail=f"An error occurred while processing your request with the AI tutor.")

@app.post("/api/auth/logout")
async def logout_user(current_user: User = Depends(get_current_user)):
    print(f"User {current_user.email} (ID: {current_user.id}) requested logout.")
    return {"message": "Logout acknowledged successfully"}

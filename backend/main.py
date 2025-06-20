import os
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy import create_engine, Column, Integer, String, select
from sqlalchemy.orm import Session, sessionmaker
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

def create_db_and_tables():
    Base.metadata.create_all(bind=engine)
# create_db_and_tables() # Call if DB is available; for tests, conftest handles this.

# Pydantic model for User response
class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    picture_url: str | None = None
    class Config:
        from_attributes = True

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

@app.post("/api/askTutor", response_model=TutorQueryResponse)
async def ask_tutor(
    request: TutorQueryRequest,
    current_user: User = Depends(get_current_user) # Ensure endpoint is protected
):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    try:
        # Construct conversation history for the model
        generation_history = []
        if request.history:
            for msg in request.history:
                generation_history.append({'role': msg.role, 'parts': [" ".join(msg.parts)]})

        persona_prompt = (
            f"You are a helpful and friendly AI tutor for K-12 students. "
            f"Your current student is in {request.grade_level}. "
            f"Your goal is to explain concepts clearly and provide age-appropriate examples. "
            f"Please ensure your tone is encouraging and supportive. "
            f"If a question is outside an academic K-12 context, politely decline to answer."
        )

        # Configure safety settings
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        }

        # Re-initialize model with system instruction for better persona management
        instructed_model = genai.GenerativeModel(
            model_name='gemini-pro', # or gemini-1.5-flash etc.
            safety_settings=safety_settings,
            system_instruction=persona_prompt
        )

        # Re-initialize chat with the instructed model and actual history
        chat_session = instructed_model.start_chat(history=generation_history if generation_history else [])

        # Send the user's current query
        response = chat_session.send_message(request.query)

        # Check for empty or blocked response
        if not response.parts:
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                print(f"Gemini content generation blocked. Reason: {response.prompt_feedback.block_reason}")
                raise HTTPException(status_code=400, detail="The request was blocked by content safety filters. Please rephrase your query.")
            else:
                print("Gemini response was empty without a specific block reason.")
                raise HTTPException(status_code=500, detail="Received an empty response from the AI. Please try again.")

        ai_reply = response.text # Accessing .text directly concatenates parts

        return TutorQueryResponse(reply=ai_reply)

    except Exception as e:
        print(f"Error in ask_tutor endpoint: {e}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f"An error occurred while processing your request with the AI tutor: {str(e)}")

@app.post("/api/auth/logout")
async def logout_user(current_user: User = Depends(get_current_user)):
    print(f"User {current_user.email} (ID: {current_user.id}) requested logout.")
    return {"message": "Logout acknowledged successfully"}

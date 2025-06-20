# backend/google_api_utils.py

import os
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any # Added Any for db_session type hint initially
from sqlalchemy.orm import Session # For db_session type hint

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.auth.exceptions import RefreshError

# These would typically be loaded from your app's config (e.g., from main.py or a config module)
# For this utility, we'll load them from environment variables here using os.getenv,
# assuming .env is loaded by the main application (e.g., by main.py using python-dotenv).
# If this module were used completely independently, dotenv.load_dotenv() might be needed here too.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
# GOOGLE_TOKEN_URI is standard for Google OAuth2
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


def get_google_api_credentials(
    user_db_model: Any, # Represents the SQLAlchemy User model instance
    db_session: Session  # SQLAlchemy session for committing changes
) -> Optional[Credentials]:
    """
    Retrieves valid Google API credentials for a user.
    Refreshes the access token if it's expired and a refresh token is available.
    Updates the user model in the database if the token is refreshed.

    Args:
        user_db_model: The SQLAlchemy User object from the database.
                       Expected to have attributes: email, google_access_token,
                       google_refresh_token, google_token_expiry, google_granted_scopes.
        db_session: The SQLAlchemy Session object for database operations.

    Returns:
        A google.oauth2.credentials.Credentials object if valid credentials
        can be obtained/refreshed, otherwise None.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured in environment.")
        # This is a server configuration error, should ideally prevent app startup or be handled globally.
        return None

    if not user_db_model.google_access_token:
        print(f"User {user_db_model.email} missing Google access token.")
        return None

    creds = Credentials(
        token=user_db_model.google_access_token,
        refresh_token=user_db_model.google_refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=user_db_model.google_granted_scopes
    )

    # Check if token is expired.
    # creds.expiry is a datetime object. If it's None, it means token is already considered expired or non-expiring (not typical for user OAuth).
    # If user_db_model.google_token_expiry is None, creds.expiry will be None.
    # The google-auth library's creds.valid property also checks expiry.
    # Explicitly check expiry against current time to be sure.
    # Add a small buffer (e.g., 1 minute) to consider token expired a bit before actual time.
    is_expired = False
    if creds.expiry:
        if creds.expiry < (datetime.now(timezone.utc) + timedelta(minutes=1)):
            is_expired = True
    elif user_db_model.google_access_token: # Has access token but no expiry info? Treat as needing validation/refresh.
        is_expired = True
        # Or, if expiry is None but token exists, rely on creds.valid to make a decision.
        # For safety, if expiry is not set, better to try validating/refreshing.

    if is_expired and not creds.valid: # Token is expired and not generally valid (e.g. no refresh token)
        pass # Handled by creds.valid check below

    if not creds.valid: # This checks expiry and if refresh is needed and possible
        if creds.refresh_token:
            try:
                print(f"Refreshing Google token for user {user_db_model.email}...")
                creds.refresh(GoogleAuthRequest())

                # Update the user model with the new token and expiry
                user_db_model.google_access_token = creds.token
                # creds.expiry should be timezone-aware after refresh by google-auth library
                user_db_model.google_token_expiry = creds.expiry
                # A new refresh token might be issued, google-auth handles this if creds.refresh_token is updated
                if hasattr(creds, 'refresh_token') and creds.refresh_token:
                    user_db_model.google_refresh_token = creds.refresh_token

                db_session.add(user_db_model)
                db_session.commit()
                db_session.refresh(user_db_model)
                print(f"Successfully refreshed Google token for user {user_db_model.email}.")
            except RefreshError as e:
                print(f"Failed to refresh Google token for user {user_db_model.email} (Refresh token may be revoked or invalid): {e}")
                user_db_model.google_access_token = None
                user_db_model.google_refresh_token = None
                user_db_model.google_token_expiry = None
                # Optionally clear scopes or set a flag indicating re-authentication is needed
                # user_db_model.google_granted_scopes = None
                db_session.add(user_db_model)
                db_session.commit()
                db_session.refresh(user_db_model)
                return None
            except Exception as e:
                print(f"An unexpected error occurred during token refresh or DB commit for user {user_db_model.email}: {e}")
                db_session.rollback()
                return None
        else:
            print(f"Google access token for user {user_db_model.email} is invalid/expired, and no refresh token is available for renewal.")
            # Consider clearing the invalid access token from DB if it's expired and cannot be refreshed.
            # user_db_model.google_access_token = None
            # user_db_model.google_token_expiry = None
            # db_session.add(user_db_model)
            # db_session.commit()
            # db_session.refresh(user_db_model)
            return None

    return creds

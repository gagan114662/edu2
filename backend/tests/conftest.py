import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os

# Set environment variables for testing BEFORE app import
os.environ["GOOGLE_CLIENT_ID"] = "test_google_client_id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test_google_client_secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://localhost:8000/auth/google/callback"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["JWT_SECRET_KEY"] = "test_jwt_secret_key_for_pytest"
os.environ["DATABASE_URL"] = "sqlite:///:memory:" # Test specific DB URL

from backend.main import app, Base, get_db # User model also available from main

# Use the DATABASE_URL from environment for the test engine
engine = create_engine(
    os.environ["DATABASE_URL"],
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables in the in-memory database
Base.metadata.create_all(bind=engine)

# Dependency override for get_db
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Apply the DB override globally for the test session for the imported app
app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function") # Changed scope to "function"
def test_client():
    # The app instance imported from backend.main already has env vars set
    # and the get_db dependency overridden globally for this test session.
    # Re-applying override in function scope for clarity, though it's already global.
    # This ensures that if app was somehow reloaded or changed, this test client gets the override.
    app.dependency_overrides[get_db] = override_get_db

    print("\nDEBUG: conftest.py - test_client fixture - App routes:")
    for route in app.routes:
        if hasattr(route, "path"):
            print(f"  Route Path: {route.path}, Name: {getattr(route, 'name', 'N/A')}, Methods: {getattr(route, 'methods', '')}")
        else:
            print(f"  Non-path route (e.g. sub-app): {type(route)}")
    print("DEBUG: End of route list.\n")

    client = TestClient(app)
    yield client

    # Optional: Clean up global override if necessary, though for test sessions it's often fine.
    # app.dependency_overrides.pop(get_db, None)

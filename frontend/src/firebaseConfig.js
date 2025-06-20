// frontend/src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// IMPORTANT: Ensure these environment variables are set in your .env file for local development
// and in your hosting environment for production.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID // Optional
};

// Initialize Firebase
let app;
let auth;
let googleAuthProvider;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleAuthProvider = new GoogleAuthProvider();
  console.log("Firebase initialized successfully with provided config.");
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Handle cases where Firebase config might be missing or invalid,
  // though create-react-app build would fail if required env vars are missing.
  // You could set up dummy objects or throw a more specific error to halt app execution.
  // For now, auth and googleAuthProvider will be undefined if initializeApp fails.
  // Components using them should check for their existence.
  alert("Firebase configuration is missing or invalid. Please check your environment variables. The app may not function correctly.");
}

export { app, auth, googleAuthProvider };

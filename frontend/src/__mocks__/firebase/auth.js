// frontend/src/__mocks__/firebase/auth.js

let mockOnAuthStateChangedCallback = null;
let mockCurrentUser = null; // Store the current mock user for onAuthStateChanged

export const getAuth = jest.fn(() => {
  // console.log("Mock firebase/auth: getAuth called");
  return {
    // You can mock other properties of the auth object if needed,
    // e.g., currentUser, languageCode, etc.
    // currentUser: mockCurrentUser // This can be useful
  };
});

export const GoogleAuthProvider = jest.fn(() => {
  // console.log("Mock firebase/auth: GoogleAuthProvider constructor called");
  return {
    // Mock provider methods if needed, e.g., addScope
    addScope: jest.fn(),
  };
});

export const onAuthStateChanged = jest.fn((auth, callback) => {
  // console.log("Mock firebase/auth: onAuthStateChanged called");
  mockOnAuthStateChangedCallback = callback;
  // Immediately invoke with current mock user (or null if not set)
  // This simulates the immediate callback execution of onAuthStateChanged
  if (callback) {
    callback(mockCurrentUser);
  }
  const mockUnsubscribe = jest.fn();
  // console.log("Mock firebase/auth: onAuthStateChanged returning unsubscribe function");
  return mockUnsubscribe;
});

export const signInWithPopup = jest.fn(async (auth, provider) => {
  // console.log("Mock firebase/auth: signInWithPopup called");
  // Default behavior: simulate successful login
  // Tests can override this with mockResolvedValueOnce or mockRejectedValueOnce
  const mockUserCredential = {
    user: {
      uid: 'mock-uid-from-popup',
      displayName: 'Mock User from Popup',
      email: 'mock.user.popup@example.com',
      photoURL: 'http://example.com/mockpopup.jpg',
      getIdToken: jest.fn(() => Promise.resolve('mock-id-token-popup')),
    },
  };
  // Trigger onAuthStateChanged with the new user
  if (mockOnAuthStateChangedCallback) {
    mockCurrentUser = mockUserCredential.user;
    mockOnAuthStateChangedCallback(mockCurrentUser);
  }
  return Promise.resolve(mockUserCredential);
});

export const signOut = jest.fn(async (auth) => {
  // console.log("Mock firebase/auth: signOut called");
  // Default behavior: simulate successful logout
  if (mockOnAuthStateChangedCallback) {
    mockCurrentUser = null;
    mockOnAuthStateChangedCallback(null);
  }
  return Promise.resolve();
});

// Custom helper to manually trigger onAuthStateChanged from tests,
// and to set the initial mockCurrentUser for onAuthStateChanged's first call.
export const setMockUser = (user) => {
  // console.log("Mock firebase/auth: setMockUser called with", user);
  mockCurrentUser = user;
  if (mockOnAuthStateChangedCallback) {
    mockOnAuthStateChangedCallback(user);
  }
};

// Custom helper to clear all mock states (especially for mockCurrentUser)
export const clearFirebaseAuthState = () => {
  // console.log("Mock firebase/auth: clearFirebaseAuthState called");
  mockCurrentUser = null;
  mockOnAuthStateChangedCallback = null; // Reset this too, as it's captured by onAuthStateChanged calls
};

// Mock getIdToken if it's directly imported and used,
// though typically it's a method on the user object.
// The user objects returned by signInWithPopup or setMockUser should have their own mock getIdToken.
// export const getIdToken = jest.fn(async (user, forceRefresh) => { ... });
// However, AuthContext uses user.getIdToken(), so the mock on the user object is key.

// Ensure this file is treated as a module
export default {};

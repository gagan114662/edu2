// frontend/src/__mocks__/firebase/app.js

// Mock initializeApp
export const initializeApp = jest.fn(() => {
  // console.log("Mock firebase/app: initializeApp called");
  return {
    // Return a mock app object if needed, though often not directly interacted with
    // in the same way as auth() from 'firebase/auth'
  };
});

// You can mock other functions from 'firebase/app' if your app uses them
// For example, if you use getApp or deleteApp:
// export const getApp = jest.fn();
// export const deleteApp = jest.fn();

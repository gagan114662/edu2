// frontend/src/components/UserProfileDisplay.js
import React from 'react';

const UserProfileDisplay = ({ user, onLogout, isLoadingAuth }) => {
  if (isLoadingAuth) {
    // This component might not be rendered by HomePage if isLoadingAuth is true,
    // but good to have a graceful state if it were.
    return <p className="text-lg text-gray-700">Loading user...</p>;
  }

  if (!user) {
    // This case should ideally not be reached if HomePage logic is sound,
    // as this component would typically only be rendered when a user session exists.
    // However, including it makes the component more robust if used in other contexts.
    return <p className="text-lg text-gray-700">No user data available.</p>;
  }

  return (
    <div className="text-center p-4 border-b border-gray-300 mb-4"> {/* Added some basic styling */}
      {user.photoURL && (
        <img
          src={user.photoURL}
          alt={user.displayName || 'User Avatar'}
          className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-blue-400" // Slightly smaller avatar
        />
      )}
      <p className="text-lg mb-1">
        Hello, <span className="font-semibold">{user.displayName || 'User'}</span>!
      </p>
      {user.email && ( // Conditionally render email if it exists
        <p className="text-sm text-gray-500 mb-3">
          {user.email}
        </p>
      )}
      <button
        onClick={onLogout}
        className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded text-sm focus:outline-none focus:shadow-outline"
      >
        Logout
      </button>
    </div>
  );
};

export default UserProfileDisplay;

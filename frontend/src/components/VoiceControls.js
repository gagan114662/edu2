// frontend/src/components/VoiceControls.js
import React from 'react';

const VoiceControls = ({
  isListening,
  isConnecting,
  tutorIsSpeaking,
  statusMessage,
  micError,
  onToggleListen,
}) => {
  let buttonText = 'Start Talking';
  let buttonClassName = 'bg-green-500 hover:bg-green-600 text-white ring-green-300';

  if (isConnecting) {
    buttonText = 'Connecting...';
    buttonClassName = 'bg-gray-400 cursor-not-allowed text-white';
  } else if (isListening) {
    buttonText = 'Stop Listening';
    buttonClassName = 'bg-red-500 hover:bg-red-600 text-white ring-red-300';
  }

  // Disable button if connecting, or if tutor is speaking and user isn't already listening (to prevent interrupting self), or if there's a mic error.
  const isDisabled = isConnecting || (tutorIsSpeaking && !isListening) || !!micError;

  const handleButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleListen();
  };

  return (
    <div className="my-4 p-4 border rounded-md shadow-sm bg-gray-50">
      <div className="mb-3 text-center">
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={isDisabled}
          className={`px-6 py-3 font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClassName}`}
          style={{ minWidth: '180px' }}
        >
          {buttonText}
        </button>
      </div>
      <div className="mb-1 text-sm text-gray-700 text-center" style={{ minHeight: '1.25rem' }}>
        Status: <span className="font-semibold" data-testid="status-message">{statusMessage}</span>
      </div>
      {micError && (
        <div className="text-red-600 bg-red-100 p-3 rounded-md my-2 text-sm text-center" data-testid="mic-error">
          Error: {micError}
        </div>
      )}
      {tutorIsSpeaking && !isListening && (
        <div className="text-center text-sm text-blue-600 italic my-2" data-testid="tutor-speaking-indicator">
          Tutor is speaking... 🌀
        </div>
      )}
    </div>
  );
};

export default VoiceControls;

// frontend/src/components/TranscriptView.js
import React, { useEffect, useRef } from 'react';

const TranscriptView = ({ transcript }) => {
  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]); // Auto-scroll when transcript changes

  if (!transcript || transcript.length === 0) {
    return (
      <div
        className="h-64 overflow-y-scroll border border-gray-300 p-4 text-center text-gray-500 bg-gray-50 rounded-md shadow-sm"
        data-testid="transcript-view"
      >
        <p>No conversation yet. Click "Start Talking" to begin the session.</p>
      </div>
    );
  }

  return (
    <div
      className="h-64 w-full overflow-y-scroll border border-gray-300 p-4 mb-4 bg-gray-50 rounded-md shadow-sm"
      data-testid="transcript-view"
    >
      {transcript.map((entry, index) => (
        <div
          key={index}
          className={`mb-3 flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
          data-testid={`transcript-entry-${index}`}
        >
          <div
            className={`inline-block py-2 px-4 rounded-lg max-w-xs md:max-w-md lg:max-w-lg break-words shadow`}
            style={{
              backgroundColor: entry.speaker === 'user' ? '#dcf8c6' : (entry.speaker === 'tutor' ? '#ffffff' : '#e5e7eb'),
              border: entry.speaker === 'tutor' ? '1px solid #e5e7eb' : 'none',
            }}
          >
            <strong className="font-semibold capitalize">
              {entry.speaker === 'user' ? 'You' : entry.speaker}:
            </strong>
            <span style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{entry.text}</span>
          </div>
        </div>
      ))}
      <div ref={endOfMessagesRef} />
    </div>
  );
};

export default TranscriptView;

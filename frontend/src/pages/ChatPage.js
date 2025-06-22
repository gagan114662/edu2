import React from 'react';
import AIChat from '../components/AIChat';

const ChatPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">AI Chat Tutor</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <p className="text-gray-600 mb-4">
            Chat with your AI tutor to get help with any subject. Ask questions, solve problems, 
            or explore new topics at your own pace.
          </p>
          
          <AIChat />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
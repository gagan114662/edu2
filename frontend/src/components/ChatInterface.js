import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ChatInterface = () => {
    const [messages, setMessages] = useState([
        { id: Date.now(), sender: 'tutor', text: "Hello! I'm your AI Tutor. How can I help you today?" }
    ]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { token } = useAuth();

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSendMessage = async () => {
        if (!inputText.trim() || isLoading) return;

        const currentQuery = inputText.trim();
        // Capture messages before adding the new one for history
        const historySnapshot = [...messages];

        const userMessage = { id: Date.now(), sender: 'user', text: currentQuery };
        setMessages(prevMessages => [...prevMessages, userMessage]);

        setInputText('');
        setIsLoading(true);
        setError(null);

        const historyForAPI = historySnapshot.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [msg.text]
        }));

        try {
            const response = await fetch('/api/askTutor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: currentQuery,
                    history: historyForAPI,
                    grade_level: 'middle school'
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error occurred while parsing error response.' }));
                // Prefer detail from backend, fallback if parsing fails or detail is missing
                const errorMessageText = errorData.detail || `Error: ${response.status} ${response.statusText}`;
                throw new Error(errorMessageText);
            }

            const data = await response.json();
            // Ensure unique ID, e.g. by using response time or a more robust unique ID generator
            const tutorMessage = { id: Date.now() + 1, sender: 'tutor', text: data.reply };
            setMessages(prevMessages => [...prevMessages, tutorMessage]);

        } catch (err) {
            const displayErrorMessage = err.message || 'An unexpected error occurred.';
            setError(displayErrorMessage); // Set error state for display
            const errorResponseMessage = {
                id: Date.now() + 1, // Ensure unique ID
                sender: 'tutor',
                text: `Sorry, I encountered an error: ${displayErrorMessage}. Please try again.`
            };
            setMessages(prevMessages => [...prevMessages, errorResponseMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 bg-white shadow-md rounded-lg w-full max-w-2xl mx-auto my-4">
            <div className="h-96 overflow-y-auto mb-4 border p-3 rounded-md space-y-2 bg-gray-50">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-xl shadow-md ${
                            msg.sender === 'user'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-800' // Tutor bubble with better contrast
                        } whitespace-pre-wrap`}> {/* Added whitespace-pre-wrap */}
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} /> {/* For auto-scrolling */}
            </div>

            {isLoading && (
                <div className="text-center text-gray-500 mb-2 animate-pulse">Tutor is thinking...</div>
            )}
            {error && (
                <div className="text-left text-red-600 mb-2 p-3 bg-red-100 border border-red-400 rounded-md">
                    <strong>Error:</strong> {error}
                </div>
            )}

            <div className="flex mt-4">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter' && !isLoading) {
                            handleSendMessage();
                        }
                    }}
                    className="flex-grow p-3 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ask your question..."
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendMessage}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLoading}
                >
                    {isLoading ? 'Sending...' : 'Send'}
                </button>
            </div>
        </div>
    );
};

export default ChatInterface;

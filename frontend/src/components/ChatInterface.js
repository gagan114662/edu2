import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom'; // Add useNavigate

const ChatInterface = () => {
    const [messages, setMessages] = useState([
        // Initial message can be dynamic based on focus later
    ]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { token, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate(); // For clearing state

    const [currentFocusStandardId, setCurrentFocusStandardId] = useState(null);
    const [currentFocusDescription, setCurrentFocusDescription] = useState(null);

    const messagesEndRef = useRef(null);

    // Effect to handle initial message based on focus or welcome
    useEffect(() => {
        if (!currentFocusStandardId && messages.length === 0) {
             setMessages([{ id: Date.now() + Math.random(), sender: 'tutor', text: "Hello! I'm your AI Tutor. How can I help you today?" }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFocusStandardId]); // Run when focus changes, or on initial load if messages are empty

    useEffect(() => {
        if (location.state?.selectedStandardId || location.state?.selectedTopicName) {
            const { selectedStandardId, selectedStandardDescription, selectedTopicName, selectedTopicDescription } = location.state;

            let focusId = selectedStandardId || selectedTopicName;
            let focusDescription = selectedStandardDescription || selectedTopicDescription || focusId;

            setCurrentFocusStandardId(focusId); // Standard ID or Topic Name
            setCurrentFocusDescription(focusDescription);

            setMessages(prev => [
                // ...prev, // Optionally keep previous messages or clear them for new focus
                {
                    id: Date.now() + Math.random(),
                    sender: 'system',
                    text: `Now focusing on: ${focusDescription}. Ask a question or type 'explain'.`
                }
            ]);
            // Clear the location state
            const { state, ...rest } = location;
            navigate(location.pathname, { ...rest, replace: true, state: {} });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]); // Removed navigate from deps, it's stable

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSendMessage = async (queryOverride) => {
        const queryToSend = typeof queryOverride === 'string' ? queryOverride : inputText.trim();

        // Allow sending if a focus is set, even with empty queryToSend (backend handles default prompt)
        if (!queryToSend && !currentFocusStandardId) {
            console.log("No query and no focus standard ID.");
            return;
        }
        if (isLoading) return;

        const userMessageText = queryToSend;
        // Add user message to UI only if it's a user-typed message (not programmatic)
        if (typeof queryOverride !== 'string' && userMessageText) {
            const userMessage = { id: Date.now(), sender: 'user', text: userMessageText };
            setMessages(prevMessages => [...prevMessages, userMessage]);
        }
        if (typeof queryOverride !== 'string') setInputText(''); // Clear input only for user-typed messages

        setIsLoading(true);
        setError(null);

        // Prepare history from messages state, excluding any system messages
        const historyForAPI = messages
            .filter(msg => msg.sender === 'user' || msg.sender === 'tutor') // Only user/tutor messages for history
            .map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [msg.text]
            }));

        const gradeLevelForAPI = (user?.selected_grade_level) || 'middle school';

        try {
            const response = await fetch('/api/askTutor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: queryToSend,
                    history: historyForAPI,
                    grade_level: gradeLevelForAPI,
                    selected_standard_id: currentFocusStandardId
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
        <div className="p-4 bg-white shadow-lg rounded-lg w-full max-w-2xl mx-auto my-4">
            {currentFocusDescription && (
                <div className="p-3 mb-4 bg-indigo-100 text-indigo-800 rounded-lg shadow-sm border border-indigo-200">
                    <div className="flex justify-between items-center">
                        <div>
                            <strong className="font-semibold">Current Focus:</strong>
                            <span className="ml-2 text-sm">{currentFocusDescription}</span>
                        </div>
                        <button
                            onClick={() => {
                                setCurrentFocusStandardId(null);
                                setCurrentFocusDescription(null);
                                setMessages(prev => [...prev, {id: Date.now() + Math.random(), sender: 'system', text: "Curriculum focus cleared."}]);
                            }}
                            className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white py-1 px-3 rounded-full shadow-md transition-colors"
                            title="Clear current curriculum focus"
                        >
                            Clear Focus
                        </button>
                    </div>
                </div>
            )}
            <div className="h-96 overflow-y-auto mb-4 border p-3 rounded-md space-y-2 bg-gray-50 shadow-inner">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-xl shadow-md ${
                            msg.sender === 'user'
                                ? 'bg-blue-500 text-white'
                                : msg.sender === 'tutor'
                                    ? 'bg-gray-200 text-gray-800'
                                    : 'bg-yellow-100 text-yellow-800 text-xs italic' // System message style
                        } whitespace-pre-wrap`}>
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

// frontend/src/pages/HomePage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Import Child UI Components
import UserProfileDisplay from '../components/UserProfileDisplay';
import VoiceControls from '../components/VoiceControls';
import TranscriptView from '../components/TranscriptView';

// Import Custom Hooks
import useMicrophone from '../hooks/useMicrophone';
import useVoiceSocket from '../hooks/useVoiceSocket';

const HomePage = () => {
    const { user, isAuthenticated, isLoadingAuth, logout } = useAuth(); // Removed getIdToken if not directly used here
    const navigate = useNavigate();

    // --- States managed by HomePage (or derived from hooks) ---
    const [statusMessage, setStatusMessage] = useState("Idle. Click 'Start Talking' to speak.");
    const [conversationTranscript, setConversationTranscript] = useState([]);
    const [tutorIsSpeaking, setTutorIsSpeaking] = useState(false); // Overall tutor speaking status

    // Refs for audio playback (still managed by HomePage for now)
    const playbackAudioContextRef = useRef(null); // Separate AudioContext for playback
    const audioQueueRef = useRef([]);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const audioPlaybackNodeRef = useRef(null);

    const TARGET_SAMPLE_RATE = 16000;
    const BACKEND_WS_URL = process.env.REACT_APP_BACKEND_WS_URL || 'ws://localhost:8000/ws/voice_tutor';

    // --- Logic for Audio Playback (remains in HomePage for now) ---
    const processAudioQueueInternal = useCallback(async () => {
        if (isPlayingAudio || audioQueueRef.current.length === 0) {
            if (audioQueueRef.current.length === 0 && !isPlayingAudio && tutorIsSpeaking) {
                // This implies tutor_speaking_started was true, but queue emptied/finished.
                // A 'tutor_speaking_finished' message is preferred to definitively set this.
            }
            return;
        }

        setIsPlayingAudio(true);
        // setTutorIsSpeaking(true); // Let onTutorSpeakingChange from useVoiceSocket manage this based on messages

        const audioChunk = audioQueueRef.current.shift();

        try {
            if (!playbackAudioContextRef.current || playbackAudioContextRef.current.state === 'closed') {
                playbackAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TARGET_SAMPLE_RATE });
                if (playbackAudioContextRef.current.state === 'suspended') { // Handle browser autoplay policies
                    await playbackAudioContextRef.current.resume();
                }
            }

            const pcmInt16Data = new Int16Array(audioChunk);
            const pcmFloat32Data = new Float32Array(pcmInt16Data.length);
            for (let i = 0; i < pcmInt16Data.length; i++) {
                pcmFloat32Data[i] = pcmInt16Data[i] / (pcmInt16Data[i] < 0 ? 0x8000 : 0x7FFF);
            }

            const audioBuffer = playbackAudioContextRef.current.createBuffer(1, pcmFloat32Data.length, TARGET_SAMPLE_RATE);
            if (audioBuffer.copyToChannel) {
                audioBuffer.copyToChannel(pcmFloat32Data, 0, 0);
            } else {
                audioBuffer.getChannelData(0).set(pcmFloat32Data);
            }


            const sourceNode = playbackAudioContextRef.current.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(playbackAudioContextRef.current.destination);
            audioPlaybackNodeRef.current = sourceNode;

            sourceNode.onended = () => {
                setIsPlayingAudio(false);
                audioPlaybackNodeRef.current = null;
                if (audioQueueRef.current.length > 0) {
                    processAudioQueueInternal();
                } else {
                    // If queue is empty, onTutorSpeakingChange(false) should have been called by socket if it was the end
                    // Or we can infer it here if no explicit end message.
                    // setTutorIsSpeaking(false); // This is now handled by onTutorSpeakingChange callback from useVoiceSocket
                    setStatusMessage("Idle. Click 'Start Talking' to speak.");
                }
            };
            sourceNode.start();
        } catch (error) {
            console.error('Error playing audio:', error);
            setStatusMessage('Error playing tutor audio.');
            setIsPlayingAudio(false);
            // setTutorIsSpeaking(false); // Handled by onTutorSpeakingChange
            audioQueueRef.current = [];
        }
    }, [isPlayingAudio, tutorIsSpeaking]);


    // --- Custom Hook Instantiations & Wiring ---

    const handleWebSocketError = useCallback((errorMessage) => {
        setStatusMessage(errorMessage || "Voice connection error.");
        // Potentially set a more specific error state for VoiceControls if needed
    }, []);

    const handleWebSocketConnectionChange = useCallback((connState, isUnexpected) => {
        if (connState === 'connected') {
            // This status might be overridden by mic status or listening status later
            // setStatusMessage("Connected to voice service.");
        } else if (connState === 'disconnected') {
            setStatusMessage(isUnexpected ? "Disconnected unexpectedly. Click 'Start Talking' to reconnect." : "Disconnected. Click 'Start Talking' to reconnect.");
            // If disconnected, ensure we stop listening locally
            if (isListening) { // isListening from useMicrophone hook
                stopRecording(); // This will also update mic states
            }
        } else if (connState === 'error') {
            setStatusMessage("Voice service connection error.");
        } else if (connState === 'connecting') {
            setStatusMessage("Connecting to voice service...");
        }
    }, []); // Removed isListening and stopRecording as they come from another hook


    const {
        connectionState,
        connectSocket,
        disconnectSocket,
        sendAudioData
    } = useVoiceSocket(
        BACKEND_WS_URL,
        useCallback((audioChunk) => {
            audioQueueRef.current.push(audioChunk);
            if (!isPlayingAudio) processAudioQueueInternal();
        }, [isPlayingAudio, processAudioQueueInternal]),
        useCallback((transcriptEntry) => {
            setConversationTranscript(prev => [...prev, transcriptEntry]);
        }, []),
        useCallback((isSpeaking) => {
            setTutorIsSpeaking(isSpeaking);
            // Status message update for tutor speaking is now handled in the main useEffect for status
        }, []),
        handleWebSocketError, // Use the memoized error handler
        handleWebSocketConnectionChange // Use the memoized connection state handler
    );

    const {
        isListening,
        isMicConnecting,
        micError,
        startRecording,
        stopRecording
    } = useMicrophone(
        useCallback((audioBuffer) => {
            if (connectionState === 'connected') {
                sendAudioData(audioBuffer);
            }
        }, [connectionState, sendAudioData])
    );

    // Update the handleWebSocketConnectionChange to include stopRecording from useMicrophone
    // This needs to be done carefully due to useCallback dependencies.
    // For now, the previous definition of handleWebSocketConnectionChange is used.
    // A useEffect might be better to react to connectionState changes that require stopping mic.
    useEffect(() => {
        if (connectionState === 'disconnected' || connectionState === 'error') {
            if (isListening) {
                stopRecording(); // stopRecording from useMicrophone
            }
        }
    }, [connectionState, isListening, stopRecording]);


    // --- Combined State Logic & Event Handlers for UI ---

    const isOverallConnecting = isMicConnecting || connectionState === 'connecting';
    const currentDisplayError = micError || (connectionState === 'error' ? "Voice service connection error." : null);

    const handleToggleListen = useCallback(async () => {
        if (isListening) { // If microphone is listening
            await stopRecording(); // Stop microphone first
            // Consider if WebSocket should be disconnected immediately or wait for server
            // For now, we assume user stopping listening means they want to end the WS session too.
            if (connectionState === 'connected' || connectionState === 'connecting') {
                disconnectSocket(1000, "User stopped listening via UI toggle.");
            }
            setStatusMessage("Idle. Click 'Start Talking' to speak.");
        } else { // Not listening, try to start
            setConversationTranscript([]);
            audioQueueRef.current = [];
            setIsPlayingAudio(false);
            setTutorIsSpeaking(false);
            // setStatusMessage("Initiating..."); // This will be set by hooks
            // Mic error is cleared by useMicrophone's startRecording
            await startRecording();
            // useEffect below will attempt to connect socket if mic started successfully
        }
    }, [isListening, stopRecording, startRecording, connectionState, disconnectSocket]);

    useEffect(() => {
        // If mic started successfully (isListening is true) and socket isn't connected/connecting, then connect.
        if (isListening && !micError && connectionState !== 'connected' && connectionState !== 'connecting') {
            connectSocket();
        }
    }, [isListening, micError, connectionState, connectSocket]);

    // Centralized useEffect for statusMessage updates based on hook states
    useEffect(() => {
        if (currentDisplayError) { // Prioritize errors
            setStatusMessage("Error state. See message above."); // Error is shown separately
        } else if (isMicConnecting) {
            setStatusMessage("Accessing microphone...");
        } else if (connectionState === 'connecting') {
            setStatusMessage("Connecting to voice service...");
        } else if (isListening && connectionState === 'connected') {
            setStatusMessage("Listening...");
        } else if (tutorIsSpeaking) { // This might override "Listening..." if tutor speaks while user listens
            setStatusMessage("Tutor is speaking...");
        } else if (connectionState === 'connected' && !isListening && !tutorIsSpeaking) {
            setStatusMessage("Connected. Click 'Start Talking'.");
        } else if ((connectionState === 'idle' || connectionState === 'disconnected') && !isListening && !isMicConnecting) {
             setStatusMessage("Idle. Click 'Start Talking' to speak.");
        }
    }, [isMicConnecting, connectionState, isListening, tutorIsSpeaking, currentDisplayError]);


    // Cleanup audio context for playback on unmount
    useEffect(() => {
        return () => {
            if (playbackAudioContextRef.current && playbackAudioContextRef.current.state !== 'closed') {
                playbackAudioContextRef.current.close().catch(e => console.error("Error closing playback AudioContext on unmount:", e));
            }
            // useMicrophone and useVoiceSocket have their own internal cleanup for their resources
        };
    }, []);

    const handleLogoutCallback = useCallback(async () => {
        if (isListening) await stopRecording();
        if (connectionState === 'connected' || connectionState === 'connecting') {
            disconnectSocket(1000, "User logging out.");
        }
        await logout();
        navigate('/login');
    }, [isListening, connectionState, stopRecording, disconnectSocket, logout, navigate]);

    // --- Render Logic ---
    if (isLoadingAuth) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
                <p className="text-lg text-gray-700">Loading user information...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        navigate('/login');
        return null;
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-100">
            <header className="p-4 bg-white shadow-md w-full">
                <UserProfileDisplay user={user} onLogout={handleLogoutCallback} isLoadingAuth={isLoadingAuth} />
            </header>

            <main className="flex flex-col items-center flex-grow p-4 w-full">
                <div className="w-full max-w-2xl bg-white p-6 rounded-lg shadow-xl">
                    <h1 className="text-2xl font-bold mb-6 text-center text-gray-700">AI Voice Tutor</h1>

                    <VoiceControls
                        isListening={isListening}
                        isConnecting={isOverallConnecting}
                        tutorIsSpeaking={tutorIsSpeaking}
                        statusMessage={statusMessage}
                        micError={currentDisplayError}
                        onToggleListen={handleToggleListen}
                    />

                    <TranscriptView transcript={conversationTranscript} />
                </div>
            </main>
            <footer className="text-center p-4 text-sm text-gray-500">
                AI Tutor App
            </footer>
        </div>
    );
};

export default HomePage;
```

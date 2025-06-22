import { useState, useRef, useCallback, useEffect } from 'react';

const useSimpleVoice = () => {
    const [isListening, setIsListening] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    
    const wsRef = useRef(null);
    const recognitionRef = useRef(null);
    const synthesisRef = useRef(window.speechSynthesis);
    
    // Initialize speech recognition
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';
            
            recognitionRef.current.onresult = (event) => {
                const last = event.results.length - 1;
                const transcript = event.results[last][0].transcript;
                
                if (event.results[last].isFinal) {
                    // Send final transcript to backend
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            type: 'transcript',
                            text: transcript
                        }));
                        
                        // Add to transcript display
                        setTranscript(prev => [...prev, {
                            speaker: 'user',
                            text: transcript,
                            timestamp: new Date().toLocaleTimeString()
                        }]);
                    }
                }
            };
            
            recognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setError(`Speech recognition error: ${event.error}`);
                setIsListening(false);
            };
            
            recognitionRef.current.onend = () => {
                // Restart if we're still supposed to be listening
                if (isListening) {
                    try {
                        recognitionRef.current.start();
                    } catch (e) {
                        console.error('Failed to restart recognition:', e);
                    }
                }
            };
        } else {
            setError('Speech recognition not supported in this browser');
        }
    }, [isListening]);
    
    // Connect to WebSocket
    const connect = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            return;
        }
        
        wsRef.current = new WebSocket('ws://localhost:8000/ws/voice_tutor');
        
        wsRef.current.onopen = () => {
            console.log('Voice WebSocket connected');
            setIsConnected(true);
            setError(null);
        };
        
        wsRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'response') {
                    // Add AI response to transcript
                    setTranscript(prev => [...prev, {
                        speaker: 'ai',
                        text: data.text,
                        timestamp: new Date().toLocaleTimeString()
                    }]);
                    
                    // Speak the response
                    const utterance = new SpeechSynthesisUtterance(data.text);
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    
                    // Select a voice (prefer female voices)
                    const voices = synthesisRef.current.getVoices();
                    const femaleVoice = voices.find(voice => 
                        voice.name.includes('Female') || 
                        voice.name.includes('Samantha') ||
                        voice.name.includes('Victoria') ||
                        voice.name.includes('Karen')
                    );
                    
                    if (femaleVoice) {
                        utterance.voice = femaleVoice;
                    }
                    
                    synthesisRef.current.speak(utterance);
                } else if (data.type === 'error') {
                    setError(data.message);
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        
        wsRef.current.onerror = (event) => {
            console.error('WebSocket error:', event);
            setError('Connection error');
        };
        
        wsRef.current.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            setIsConnected(false);
            
            if (event.code !== 1000) {
                setError(`Connection closed unexpectedly (${event.code})`);
            }
        };
    }, []);
    
    // Start/stop listening
    const toggleListening = useCallback(() => {
        if (!isConnected) {
            connect();
            return;
        }
        
        if (isListening) {
            // Stop listening
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsListening(false);
        } else {
            // Start listening
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.start();
                    setIsListening(true);
                    setError(null);
                } catch (e) {
                    console.error('Failed to start recognition:', e);
                    setError('Failed to start speech recognition');
                }
            }
        }
    }, [isConnected, isListening, connect]);
    
    // Disconnect
    const disconnect = useCallback(() => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
        
        if (wsRef.current) {
            wsRef.current.close(1000, 'User disconnected');
        }
        
        setIsListening(false);
        setIsConnected(false);
    }, [isListening]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current && isListening) {
                recognitionRef.current.stop();
            }
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close(1000, 'Component unmounting');
            }
        };
    }, [isListening]);
    
    return {
        isListening,
        isConnected,
        transcript,
        error,
        toggleListening,
        disconnect,
        clearTranscript: () => setTranscript([])
    };
};

export default useSimpleVoice;
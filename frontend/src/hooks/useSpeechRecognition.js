import { useState, useRef, useCallback, useEffect } from 'react';

const useSpeechRecognition = (onTranscript, isActive = false) => {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [error, setError] = useState(null);
    
    const recognitionRef = useRef(null);
    const lastTranscriptRef = useRef('');
    
    // Initialize speech recognition
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            
            // Configure recognition
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';
            
            // Handle results
            recognitionRef.current.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Only send final transcripts to avoid duplicates
                if (finalTranscript && finalTranscript !== lastTranscriptRef.current) {
                    lastTranscriptRef.current = finalTranscript;
                    if (onTranscript) {
                        onTranscript(finalTranscript.trim());
                    }
                }
            };
            
            // Handle errors
            recognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                
                // Don't show error for 'aborted' - it's normal when stopping/starting
                if (event.error !== 'aborted') {
                    setError(`Speech recognition error: ${event.error}`);
                }
                
                // Try to restart if it's a network or audio-capture error
                if (event.error === 'network' || event.error === 'audio-capture') {
                    setTimeout(() => {
                        if (isActive && recognitionRef.current) {
                            try {
                                recognitionRef.current.start();
                            } catch (e) {
                                console.error('Failed to restart recognition:', e);
                            }
                        }
                    }, 1000);
                }
            };
            
            // Handle end event
            recognitionRef.current.onend = () => {
                console.log('Speech recognition ended');
                setIsListening(false);
                
                // Disable auto-restart to prevent loops - manual restart only
                // Auto-restart causes too many conflicts with browser speech recognition
            };
            
            // Handle start
            recognitionRef.current.onstart = () => {
                console.log('Speech recognition started');
                setIsListening(true);
                setError(null);
            };
            
            setIsSupported(true);
        } else {
            setIsSupported(false);
            setError('Speech recognition not supported in this browser');
        }
        
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [onTranscript]);
    
    // Start/stop recognition based on isActive prop
    useEffect(() => {
        if (!isSupported || !recognitionRef.current) return;
        
        if (isActive && !isListening) {
            // Add small delay to prevent race conditions
            const startTimer = setTimeout(() => {
                if (recognitionRef.current && isActive) {
                    try {
                        recognitionRef.current.start();
                    } catch (e) {
                        console.error('Failed to start recognition:', e);
                        // Ignore "already started" errors
                        if (!e.message.includes('already started')) {
                            setError('Failed to start speech recognition');
                        }
                    }
                }
            }, 100);
            
            return () => clearTimeout(startTimer);
        } else if (!isActive && isListening) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                console.error('Failed to stop recognition:', e);
            }
            setIsListening(false);
        }
    }, [isActive, isSupported, isListening]);
    
    const startRecognition = useCallback(() => {
        if (!isSupported || !recognitionRef.current) {
            setError('Speech recognition not available');
            return;
        }
        
        // Don't start if already listening
        if (isListening) {
            console.log('Speech recognition already active, not starting again');
            return;
        }
        
        try {
            recognitionRef.current.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
            if (e.name === 'InvalidStateError') {
                console.log('Speech recognition already started, ignoring error');
                return; // Don't set error for this case
            }
            if (!e.message.includes('already started')) {
                setError('Failed to start speech recognition');
            }
        }
    }, [isSupported, isListening]);
    
    const stopRecognition = useCallback(() => {
        if (recognitionRef.current && isListening) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                console.error('Error stopping recognition:', e);
            }
        }
        setIsListening(false);
        setError(null); // Clear any previous errors
    }, [isListening]);
    
    return {
        isListening,
        isSupported,
        error,
        startRecognition,
        stopRecognition
    };
};

export default useSpeechRecognition;
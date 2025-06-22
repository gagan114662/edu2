import { useState, useRef, useCallback, useEffect } from 'react';

const useTextToSpeech = () => {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [voices, setVoices] = useState([]);
    
    const synthRef = useRef(null);
    
    useEffect(() => {
        if ('speechSynthesis' in window) {
            synthRef.current = window.speechSynthesis;
            setIsSupported(true);
            
            // Load voices
            const loadVoices = () => {
                const availableVoices = synthRef.current.getVoices();
                setVoices(availableVoices);
            };
            
            loadVoices();
            
            // Voices might load asynchronously
            if (synthRef.current.onvoiceschanged !== undefined) {
                synthRef.current.onvoiceschanged = loadVoices;
            }
        } else {
            setIsSupported(false);
        }
        
        return () => {
            if (synthRef.current) {
                synthRef.current.cancel();
            }
        };
    }, []);
    
    const speak = useCallback((text, options = {}) => {
        console.log('TTS speak called with:', text);
        console.log('TTS isSupported:', isSupported);
        
        if (!isSupported || !synthRef.current || !text) {
            console.log('TTS not available or no text');
            return;
        }
        
        // Cancel any ongoing speech
        synthRef.current.cancel();
        console.log('TTS starting to speak');
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configure utterance
        utterance.rate = options.rate || 0.9;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;
        
        // Select voice (prefer female voices for tutoring)
        if (voices.length > 0) {
            const preferredVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Samantha') ||
                voice.name.includes('Victoria') ||
                voice.name.includes('Karen') ||
                voice.name.includes('Moira') ||
                (voice.gender && voice.gender === 'female')
            ) || voices.find(voice => voice.lang.startsWith('en'));
            
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
        }
        
        // Event handlers
        utterance.onstart = () => {
            setIsSpeaking(true);
        };
        
        utterance.onend = () => {
            setIsSpeaking(false);
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            setIsSpeaking(false);
        };
        
        // Speak
        synthRef.current.speak(utterance);
    }, [isSupported, voices]);
    
    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            setIsSpeaking(false);
        }
    }, []);
    
    const pause = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.pause();
        }
    }, []);
    
    const resume = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.resume();
        }
    }, []);
    
    return {
        speak,
        stop,
        pause,
        resume,
        isSpeaking,
        isSupported,
        voices
    };
};

export default useTextToSpeech;
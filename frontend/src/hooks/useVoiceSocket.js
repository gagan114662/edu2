// frontend/src/hooks/useVoiceSocket.js
import { useState, useRef, useCallback, useEffect } from 'react';

const useVoiceSocket = (
    backendWsUrl,
    onAudioChunkForPlayback, // (arrayBuffer) => void
    onTranscriptUpdate,      // ({speaker, text}) => void
    onTutorSpeakingChange,   // (isSpeaking: boolean) => void
    onErrorChange,           // (errorMessage: string | null) => void
    onConnectionStateChange  // (state: 'idle'|'connecting'|'connected'|'disconnected'|'error', wasUnexpected?: boolean) => void
) => {
  const [connectionState, setConnectionState] = useState('idle');
  const webSocketRef = useRef(null);

  const updateConnectionState = useCallback((newState, wasUnexpected = false) => {
    setConnectionState(newState);
    if (onConnectionStateChange) {
      onConnectionStateChange(newState, wasUnexpected);
    }
  }, [onConnectionStateChange]);

  const connectSocket = useCallback(() => {
    if (webSocketRef.current &&
        (webSocketRef.current.readyState === WebSocket.OPEN ||
         webSocketRef.current.readyState === WebSocket.CONNECTING)) {
      console.log("useVoiceSocket: WebSocket already open or connecting.");
      return;
    }
    
    console.log(`useVoiceSocket: Attempting to connect to ${backendWsUrl}`);
    updateConnectionState('connecting');
    if(onTranscriptUpdate) onTranscriptUpdate({speaker: 'system', text: 'Connecting to voice service...'});

    try {
      webSocketRef.current = new WebSocket(backendWsUrl);
      console.log("useVoiceSocket: WebSocket object created successfully");
    } catch (error) {
      console.error("useVoiceSocket: Failed to create WebSocket:", error);
      updateConnectionState('error');
      if(onErrorChange) onErrorChange(`Failed to create WebSocket connection: ${error.message}`);
      return;
    }

    webSocketRef.current.onopen = () => {
      console.log("useVoiceSocket: WebSocket connected.");
      
      // Send initial setup message for Gemini Live API
      const setupMessage = {
        setup: {
          model: "models/gemini-1.5-flash"
        }
      };
      
      console.log("useVoiceSocket: Sending setup message to Gemini Live API");
      webSocketRef.current.send(JSON.stringify(setupMessage));
      
      updateConnectionState('connected');
      if(onTranscriptUpdate) onTranscriptUpdate({speaker: 'system', text: 'Voice connection established.'});
    };

    webSocketRef.current.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
            const message = JSON.parse(event.data);
            console.log("WebSocket message received:", message);
            
            if (message.type === 'user_transcript') {
                if(onTranscriptUpdate) onTranscriptUpdate({ speaker: 'user', text: message.text });
            } else if (message.type === 'tutor_transcript') {
                if(onTranscriptUpdate) onTranscriptUpdate({ speaker: 'tutor', text: message.text });
                // Start TTS speaking indication
                if(onTutorSpeakingChange) onTutorSpeakingChange(true);
            } else if (message.type === 'tutor_speaking_started') {
                if(onTutorSpeakingChange) onTutorSpeakingChange(true);
            } else if (message.type === 'tutor_speaking_finished') {
                if(onTutorSpeakingChange) onTutorSpeakingChange(false);
            } else if (message.type === 'setup_complete') {
                console.log("Gemini Live API setup complete:", message.message);
                if(onTranscriptUpdate) onTranscriptUpdate({ speaker: 'system', text: 'Voice service ready - you can start speaking!' });
            } else if (message.type === 'error') {
                if(onErrorChange) onErrorChange(message.message || "Error from voice service.");
            }
        } catch (e) {
            console.warn("useVoiceSocket: Received non-JSON/malformed JSON:", event.data, e);
            if(onTranscriptUpdate) onTranscriptUpdate({ speaker: 'system', text: `Sys (raw/error): ${event.data}` });
        }
      } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          // Handle audio data from Gemini Live API
          console.log("Received audio data:", event.data);
          if(onAudioChunkForPlayback) onAudioChunkForPlayback(event.data);
      } else { 
          console.warn("useVoiceSocket: Unknown message type from backend:", event.data); 
      }
    };

    webSocketRef.current.onerror = (errorEvent) => {
      console.error("useVoiceSocket: WebSocket Error:", errorEvent);
      updateConnectionState('error');
      if(onErrorChange) onErrorChange("Voice connection error. Please check console or try again.");
    };

    webSocketRef.current.onclose = (closeEvent) => {
      console.log("useVoiceSocket: WebSocket Closed:", closeEvent.code, closeEvent.reason, closeEvent.wasClean);
      const wasUnexpected = !closeEvent.wasClean && closeEvent.code !== 1000 && closeEvent.code !== 1005;
      updateConnectionState('disconnected', wasUnexpected);
      if(wasUnexpected && onErrorChange) {
        onErrorChange(`Voice service disconnected (Code: ${closeEvent.code}).`);
      }
      webSocketRef.current = null;
    };
  }, [backendWsUrl, onAudioChunkForPlayback, onTranscriptUpdate, onTutorSpeakingChange, onErrorChange, updateConnectionState]);

  const disconnectSocket = useCallback((code = 1000, reason = "User disconnected") => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      console.log(`useVoiceSocket: Closing WebSocket with code ${code} and reason "${reason}"`);
      webSocketRef.current.close(code, reason);
    } else if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.CONNECTING) {
      console.log(`useVoiceSocket: Closing connecting WebSocket with code ${code} and reason "${reason}"`);
      // For a connecting socket, just nullify handlers and ref, browser will handle the close.
      webSocketRef.current.onopen = null;
      webSocketRef.current.onmessage = null;
      webSocketRef.current.onerror = null;
      webSocketRef.current.onclose = null;
      webSocketRef.current.close(code, reason); // Attempt close
      webSocketRef.current = null;
      updateConnectionState('disconnected'); // Manually update state as onclose might not fire reliably for connecting sockets being closed.
    }
  }, [updateConnectionState]);

  const sendAudioData = useCallback((data) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(data);
    } else {
      // console.warn("useVoiceSocket: WebSocket not open, cannot send audio data.");
      // Optionally notify via onErrorChange or let the microphone hook handle this if it's an issue.
    }
  }, []);

  const sendTranscript = useCallback((text) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: 'user_transcript',
        text: text
      };
      console.log('Sending transcript to backend:', message);
      webSocketRef.current.send(JSON.stringify(message));
    } else {
      console.log('Cannot send transcript - WebSocket not open:', webSocketRef.current?.readyState);
    }
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      console.log("useVoiceSocket: Cleaning up WebSocket on unmount.");
      disconnectSocket(1000, "Component unmounting");
    };
  }, [disconnectSocket]);

  return { connectionState, connectSocket, disconnectSocket, sendAudioData, sendTranscript };
};
export default useVoiceSocket;

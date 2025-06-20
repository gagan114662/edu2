// frontend/src/hooks/useMicrophone.js
import { useState, useRef, useCallback, useEffect } from 'react';

const TARGET_SAMPLE_RATE = 16000; // Or get from config/props

const useMicrophone = (onAudioProcess) => {
  const [isListening, setIsListening] = useState(false);
  const [isMicConnecting, setIsMicConnecting] = useState(false);
  const [micError, setMicError] = useState(null);

  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const mediaStreamSourceRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const stopRecording = useCallback(async (closeAudioContext = true) => {
    setIsListening(false);
    setIsMicConnecting(false);
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed' && closeAudioContext) {
        try { await audioContextRef.current.close(); } catch(e) { console.error("useMicrophone: Error closing AudioContext", e); }
        audioContextRef.current = null;
    }
    console.log("Microphone recording stopped.");
  }, []);

  const processAudio = useCallback((event) => {
    if (!isListening) return;

    const inputBuffer = event.inputBuffer;
    const pcmFloat32Data = inputBuffer.getChannelData(0);
    let resampledData = pcmFloat32Data;

    if (audioContextRef.current && audioContextRef.current.sampleRate !== TARGET_SAMPLE_RATE) {
        const ratio = audioContextRef.current.sampleRate / TARGET_SAMPLE_RATE;
        const newLength = Math.round(pcmFloat32Data.length / ratio);
        resampledData = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            resampledData[i] = pcmFloat32Data[Math.floor(i * ratio)] || 0;
        }
    }
    const pcmInt16Data = new Int16Array(resampledData.length);
    for (let i = 0; i < resampledData.length; i++) {
        let s = Math.max(-1, Math.min(1, resampledData[i]));
        pcmInt16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    if (onAudioProcess && typeof onAudioProcess === 'function') {
      onAudioProcess(pcmInt16Data.buffer);
    }
  }, [isListening, onAudioProcess]);


  const startRecording = useCallback(async () => {
    if (isListening || isMicConnecting) {
        console.log("useMicrophone: Recording or connection already in progress.");
        return;
    }
    setMicError(null);
    setIsMicConnecting(true);

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        try {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TARGET_SAMPLE_RATE });
            if (audioContextRef.current.state === 'suspended') { // Handle browser autoplay policies
                await audioContextRef.current.resume();
            }
        } catch (e) {
            console.error("useMicrophone: Error creating/resuming AudioContext:", e);
            setMicError(`AudioContext error: ${e.message}. Try interacting with the page or refreshing.`);
            setIsMicConnecting(false);
            return;
        }
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError("getUserMedia not supported on your browser!");
        setIsMicConnecting(false);
        return;
    }

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: TARGET_SAMPLE_RATE, channelCount: 1, echoCancellation: true } });

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
         console.error("useMicrophone: AudioContext became closed before stream processing setup.");
         setMicError("Audio system error after mic access. Please try again.");
         setIsMicConnecting(false);
         if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
         mediaStreamRef.current = null;
         return;
      }

      mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      // Buffer size, input channels, output channels. 4096 for 16kHz gives ~250ms latency.
      const bufferSize = 4096;
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current.onaudioprocess = processAudio;
      mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination); // Necessary for onaudioprocess to fire
      setIsListening(true);
      setIsMicConnecting(false);
    } catch (err) {
      console.error("useMicrophone: Mic/setup error:", err.name, err.message);
        let friendlyError = "Could not access mic. Please try again.";
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            friendlyError = "No microphone found. Please connect a microphone and try again.";
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            friendlyError = "Microphone access denied. Please enable permissions in your browser settings and refresh the page.";
        }
        setMicError(friendlyError);
        setIsMicConnecting(false);
        setIsListening(false); // Ensure isListening is also false on error
    }
  }, [isListening, isMicConnecting, processAudio, onAudioProcess]); // Added onAudioProcess to deps of startRecording indirectly via processAudio

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Ensure all resources are released on unmount
      stopRecording(true);
    };
  }, [stopRecording]); // stopRecording is memoized

  return { isListening, isMicConnecting, micError, startRecording, stopRecording };
};
export default useMicrophone;

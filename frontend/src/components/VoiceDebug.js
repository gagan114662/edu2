import React, { useState, useRef } from 'react';

const VoiceDebug = () => {
  const [micStatus, setMicStatus] = useState('Not started');
  const [wsStatus, setWsStatus] = useState('Not connected');
  const [audioLevel, setAudioLevel] = useState(0);
  const [errors, setErrors] = useState([]);
  const [logs, setLogs] = useState([]);
  
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const wsRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-10), `${timestamp}: ${message}`]);
  };

  const addError = (error) => {
    const timestamp = new Date().toLocaleTimeString();
    setErrors(prev => [...prev.slice(-5), `${timestamp}: ${error}`]);
  };

  const testMicrophone = async () => {
    try {
      setMicStatus('Requesting permission...');
      addLog('Testing microphone access');
      
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported');
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, 
          channelCount: 1, 
          echoCancellation: true 
        } 
      });
      
      setMicStatus('Permission granted');
      addLog('Microphone permission granted');
      
      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Create analyser for audio level monitoring
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      mediaStreamRef.current = stream;
      setMicStatus('Recording');
      addLog('Audio context created and recording started');
      
      // Start audio level monitoring
      const monitorAudio = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.round(average));
        
        animationRef.current = requestAnimationFrame(monitorAudio);
      };
      
      monitorAudio();
      
    } catch (error) {
      setMicStatus(`Error: ${error.message}`);
      addError(`Microphone test failed: ${error.message}`);
    }
  };

  const testWebSocket = () => {
    try {
      setWsStatus('Connecting...');
      addLog('Testing WebSocket connection');
      
      const wsUrl = process.env.REACT_APP_BACKEND_WS_URL || 'ws://localhost:8000/ws/voice_tutor';
      addLog(`Connecting to: ${wsUrl}`);
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setWsStatus('Connected');
        addLog('WebSocket connected successfully');
      };
      
      wsRef.current.onmessage = (event) => {
        addLog(`WebSocket message: ${event.data}`);
      };
      
      wsRef.current.onerror = (error) => {
        setWsStatus('Error');
        addError('WebSocket connection error');
        addLog('WebSocket error occurred');
      };
      
      wsRef.current.onclose = (event) => {
        setWsStatus(`Closed (${event.code})`);
        addLog(`WebSocket closed with code: ${event.code}`);
      };
      
    } catch (error) {
      setWsStatus(`Error: ${error.message}`);
      addError(`WebSocket test failed: ${error.message}`);
    }
  };

  const stopTests = () => {
    // Stop microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Stop WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setMicStatus('Stopped');
    setWsStatus('Disconnected');
    setAudioLevel(0);
    addLog('Tests stopped');
  };

  const clearLogs = () => {
    setLogs([]);
    setErrors([]);
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="font-bold text-yellow-800 mb-3">🎤 Voice Tutor Debug</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <h4 className="font-semibold mb-2">Status</h4>
          <div className="space-y-1 text-sm">
            <p><strong>Microphone:</strong> <span className={micStatus.includes('Error') ? 'text-red-600' : micStatus === 'Recording' ? 'text-green-600' : 'text-gray-600'}>{micStatus}</span></p>
            <p><strong>WebSocket:</strong> <span className={wsStatus.includes('Error') ? 'text-red-600' : wsStatus === 'Connected' ? 'text-green-600' : 'text-gray-600'}>{wsStatus}</span></p>
            <p><strong>Audio Level:</strong> <span className="text-blue-600">{audioLevel}/255</span></p>
          </div>
        </div>
        
        <div>
          <h4 className="font-semibold mb-2">Controls</h4>
          <div className="space-x-2 space-y-2">
            <button 
              onClick={testMicrophone}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
            >
              Test Mic
            </button>
            <button 
              onClick={testWebSocket}
              className="bg-green-500 text-white px-3 py-1 rounded text-sm"
            >
              Test WebSocket
            </button>
            <button 
              onClick={stopTests}
              className="bg-red-500 text-white px-3 py-1 rounded text-sm"
            >
              Stop All
            </button>
            <button 
              onClick={clearLogs}
              className="bg-gray-500 text-white px-3 py-1 rounded text-sm"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>

      {/* Audio Level Indicator */}
      <div className="mb-4">
        <div className="bg-gray-200 rounded-full h-4">
          <div 
            className="bg-green-500 h-4 rounded-full transition-all duration-100"
            style={{ width: `${(audioLevel / 255) * 100}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-600 mt-1">Audio level indicator (speak to see activity)</p>
      </div>

      {/* Error Log */}
      {errors.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-red-800 mb-2">Errors</h4>
          <div className="bg-red-50 rounded p-2 max-h-24 overflow-y-auto">
            {errors.map((error, index) => (
              <p key={index} className="text-xs text-red-700">{error}</p>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div>
        <h4 className="font-semibold mb-2">Activity Log</h4>
        <div className="bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-gray-500">No activity yet</p>
          ) : (
            logs.map((log, index) => (
              <p key={index} className="text-xs text-gray-700">{log}</p>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceDebug;
# 🔍 Voice Tutor Debug Instructions

## 🚨 **Current Issue: WebSocket Closes Immediately**

I've added comprehensive logging to identify why the WebSocket closes with code 1000. Let's debug this step by step.

## 📋 **Step 1: Test with Enhanced Logging**

1. **Refresh the Voice Tutor page**: http://localhost:3000
2. **Click "Test WebSocket" in the debug box**
3. **Watch the backend terminal** (where uvicorn is running)

### **What to Look For in Backend Logs:**

The backend will now show detailed logs like:
```
Client WebSocket connected to /ws/voice_tutor.
GEMINI_API_KEY present: True
GEMINI_LIVE_API_ENDPOINT_URL: wss://generativelanguage.googleapis.com/ws/...
Attempting to connect to Gemini Live API at wss://...
Successfully connected to Gemini Live API WebSocket.
Starting bidirectional message forwarding tasks...
client_to_gemini_task started - listening for client messages
gemini_to_client_task started - listening for Gemini responses
```

## 📋 **Step 2: Test Setup Message**

After the WebSocket connects, the frontend should send a setup message.

**Look for these logs:**
```
Waiting for message from client...
Received message from client: <class 'dict'>
Forwarding text message to Gemini: {"setup":{"model":"models/gemini-1.5-flash"}}
Text message sent to Gemini successfully
```

## 📋 **Step 3: Check for Gemini Responses**

If setup is successful, you should see:
```
Received message from Gemini: <WSMsgType.TEXT: 1>
Forwarding text response to client: {"setupComplete":...}
```

## 🚨 **Error Patterns to Watch For:**

### **If you see:**
- `"Backend not configured for Gemini Live API"` → API key issue
- `"Failed to connect to AI voice service"` → Gemini connection failed
- `"Error in client_to_gemini_task"` → Message handling issue
- `"Gemini WS connection closed by remote"` → Gemini rejected our request

### **If logs stop after:**
- `"Starting bidirectional message forwarding tasks..."` → One of the tasks crashed
- `"Waiting for message from client..."` → Frontend not sending setup message

## 📋 **Step 4: Try the Main Voice Tutor**

1. **Click the microphone button** in the main app (not just the debug box)
2. **Allow microphone permission**
3. **Start speaking**
4. **Watch backend logs** for audio data forwarding

**Expected logs when speaking:**
```
Forwarding X bytes of audio data to Gemini
Received message from Gemini: <WSMsgType.BINARY: 2>
Forwarding binary response to client: X bytes
```

## 🔧 **Next Steps**

**Please run the test and tell me:**

1. **What you see in the backend terminal** (copy the log output)
2. **Does the WebSocket stay connected longer now?**
3. **Any error messages in the logs?**
4. **Does the frontend receive the setup confirmation?**

This detailed logging will show us exactly where the voice tutor is failing! 🔍
# 🎤 Voice Tutor Debug Guide

## 🚨 **Problem: "Nothing happens when I speak"**

I've added comprehensive debugging tools to help identify why the voice tutor isn't working.

## 🔧 **Debug the Voice Tutor**

### **Step 1: Go to Voice Tutor Page**
1. **Visit**: http://localhost:3000 (home page)
2. **Look for the yellow "Voice Tutor Debug" box** at the top
3. **This will help us diagnose the exact issue**

### **Step 2: Test Microphone**
1. **Click "Test Mic" button** in the debug box
2. **Grant microphone permission** when prompted
3. **Speak and watch the audio level bar** - it should move when you talk
4. **Report what you see:**
   - Microphone status: [what does it show]?
   - Audio level: Does the green bar move when you speak?
   - Any error messages?

### **Step 3: Test WebSocket**
1. **Click "Test WebSocket" button**
2. **Watch the WebSocket status**
3. **Report what you see:**
   - WebSocket status: [what does it show]?
   - Any connection errors in the activity log?

### **Step 4: Check Activity Log**
The debug box shows a real-time activity log that will help identify exactly where the problem is:
- Look for any error messages in red
- Check the activity log for connection attempts
- Note any permission issues

## 🎯 **Expected Results**

**✅ Working properly:**
- Microphone: "Recording" 
- Audio Level: Green bar moves when speaking (10-100+ range)
- WebSocket: "Connected"
- Activity log shows successful connections

**❌ Common Issues:**

### **Microphone Issues:**
- **"Permission denied"** → Click "Test Mic" and allow access
- **"getUserMedia not supported"** → Browser compatibility issue
- **Audio level stays at 0** → Microphone not working or wrong device

### **WebSocket Issues:**
- **"Connection failed"** → Backend not running or wrong URL
- **"Closed (1008)"** → Backend authentication/API key issue
- **"Error"** → Network connectivity problem

## 🔧 **Quick Fixes**

### **For Microphone:**
1. **Check browser permissions**: Click the 🔒 icon in address bar → Allow microphone
2. **Try different browser**: Chrome, Firefox, Edge
3. **Check system microphone**: Test with other apps (Zoom, Discord, etc.)

### **For WebSocket:**
1. **Verify backend is running**: Should see logs in terminal
2. **Check backend URL**: Should be `ws://localhost:8000/ws/voice_tutor`
3. **Restart backend server**: Stop and start the uvicorn process

## 📋 **What to Report**

Please test the debug tools and tell me:

1. **Microphone test results:**
   - Status message
   - Audio level activity (does it move?)
   - Any errors

2. **WebSocket test results:**
   - Connection status
   - Activity log messages
   - Any errors

3. **Browser console errors:**
   - Press F12 → Console tab
   - Look for red error messages
   - Copy any error text

This will help me pinpoint exactly why the voice tutor isn't responding to your speech! 🔍
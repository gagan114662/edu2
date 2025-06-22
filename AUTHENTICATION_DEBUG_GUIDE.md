# 🔧 Authentication Debug Guide

## 🚨 **Current Issues**

1. **"No authentication token found"** in Curriculum Settings
2. **Voice tutor not working**
3. **Chat working** (indicating partial auth success)

## 📋 **Debugging Steps**

### **Step 1: Check Authentication Status**

1. **Go to Settings page**: http://localhost:3000/settings
2. **Look for "Authentication Debug" section** at the top
3. **Click "Test Get Token" button**
4. **Report what you see:**
   - User authenticated: Yes/No?
   - User object: Present/None?
   - User email: [what email]?
   - Token Test: [what result]?

### **Step 2: Check Browser Console**

1. **Open browser Developer Tools** (F12)
2. **Go to Console tab**
3. **Look for any red error messages**
4. **Specifically look for:**
   - Firebase authentication errors
   - CORS errors
   - Network request failures
   - Token refresh errors

### **Step 3: Check Authentication Flow**

Try logging out and back in:

1. **Clear browser data**: 
   - Press F12 → Application tab → Storage → Clear site data
2. **Refresh page**: Should redirect to login
3. **Sign in again**: Complete Google OAuth
4. **Test features immediately after login**

### **Step 4: Voice Tutor Debugging**

1. **Go to Voice Tutor page** (home page)
2. **Click microphone button**
3. **Check for these specific errors:**
   - Microphone permission denied
   - WebSocket connection failed
   - "Backend not configured for Gemini Live API"
   - Network connectivity issues

### **Step 5: Specific Error Patterns**

**If you see in console:**
- `"Firebase not initialized"` → Environment variable issue
- `"auth/user-token-expired"` → Need to refresh login
- `"CORS error"` → Backend connection issue  
- `"WebSocket connection failed"` → Voice service issue
- `"Backend not configured"` → Gemini API key issue

## 🔧 **Common Solutions**

### **For Token Issues:**
1. **Refresh the page** (F5)
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Log out and log back in**

### **For Voice Issues:**
1. **Allow microphone permission** when prompted
2. **Check if backend is running** (should see Uvicorn logs)
3. **Verify WebSocket endpoint** (backend should show connection logs)

### **For Firebase Issues:**
1. **Check Firebase Console settings**
2. **Verify authorized domains include localhost**
3. **Ensure Google Sign-in is enabled**

## 📊 **What to Report**

Please provide:

1. **Authentication Debug results** (from Settings page)
2. **Browser console errors** (screenshot or copy text)
3. **Specific error messages** when trying features
4. **Which features work vs don't work**

This will help identify the exact authentication issue! 🔍
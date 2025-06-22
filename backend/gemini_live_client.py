"""
Gemini Live API Client - Real-time audio streaming implementation
Based on Google AI Studio Live Audio example
"""
import asyncio
import aiohttp
import json
import base64
from typing import Optional, Callable, Dict, Any


class GeminiLiveClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def connect(self) -> bool:
        """Connect to Gemini Live API"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Gemini Live API WebSocket URL
            url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={self.api_key}"
            
            self.ws = await self.session.ws_connect(url)
            
            # Send initial setup
            setup_message = {
                "setup": {
                    "model": "models/gemini-2.0-flash-exp",
                    "generation_config": {
                        "response_modalities": ["AUDIO", "TEXT"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": "Aoede"
                                }
                            }
                        }
                    },
                    "system_instruction": {
                        "parts": [{
                            "text": "You are a helpful AI tutor for K-12 students. Provide clear, educational responses appropriate for the student's level. Be encouraging and patient."
                        }]
                    }
                }
            }
            
            await self.ws.send_str(json.dumps(setup_message))
            print("Gemini Live API setup sent")
            return True
            
        except Exception as e:
            print(f"Failed to connect to Gemini Live API: {e}")
            return False
    
    async def send_audio_chunk(self, audio_data: bytes) -> bool:
        """Send audio data to Gemini Live API"""
        if not self.ws:
            return False
            
        try:
            # Convert audio data to base64
            audio_b64 = base64.b64encode(audio_data).decode('utf-8')
            
            message = {
                "realtime_input": {
                    "media_chunks": [{
                        "mime_type": "audio/pcm",
                        "data": audio_b64
                    }]
                }
            }
            
            await self.ws.send_str(json.dumps(message))
            return True
            
        except Exception as e:
            print(f"Failed to send audio chunk: {e}")
            return False
    
    async def send_text(self, text: str) -> bool:
        """Send text message to Gemini Live API"""
        if not self.ws:
            return False
            
        try:
            message = {
                "client_content": {
                    "turns": [{
                        "role": "user",
                        "parts": [{
                            "text": text
                        }]
                    }],
                    "turn_complete": True
                }
            }
            
            await self.ws.send_str(json.dumps(message))
            return True
            
        except Exception as e:
            print(f"Failed to send text: {e}")
            return False
    
    async def listen_for_responses(self, 
                                 on_text_response: Callable[[str], None] = None,
                                 on_audio_response: Callable[[bytes], None] = None,
                                 on_error: Callable[[str], None] = None):
        """Listen for responses from Gemini Live API"""
        if not self.ws:
            return
            
        try:
            async for msg in self.ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        await self._handle_response(data, on_text_response, on_audio_response)
                    except json.JSONDecodeError as e:
                        print(f"Failed to parse response: {e}")
                        if on_error:
                            on_error(f"Invalid response format: {e}")
                            
                elif msg.type == aiohttp.WSMsgType.BINARY:
                    # Handle binary audio data
                    if on_audio_response:
                        on_audio_response(msg.data)
                        
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    error_msg = f"WebSocket error: {self.ws.exception()}"
                    print(error_msg)
                    if on_error:
                        on_error(error_msg)
                    break
                    
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    print("Gemini Live API connection closed")
                    break
                    
        except Exception as e:
            print(f"Error listening for responses: {e}")
            if on_error:
                on_error(str(e))
    
    async def _handle_response(self, data: Dict[Any, Any], 
                             on_text_response: Optional[Callable[[str], None]],
                             on_audio_response: Optional[Callable[[bytes], None]]):
        """Handle parsed response from Gemini Live API"""
        try:
            # Handle setup complete
            if "setupComplete" in data:
                print("Gemini Live API setup completed")
                return
            
            # Handle server content (AI responses)
            if "serverContent" in data:
                server_content = data["serverContent"]
                
                if "modelTurn" in server_content:
                    model_turn = server_content["modelTurn"]
                    
                    # Handle text parts
                    if "parts" in model_turn:
                        for part in model_turn["parts"]:
                            if "text" in part and on_text_response:
                                on_text_response(part["text"])
                            elif "inlineData" in part:
                                # Handle audio data
                                inline_data = part["inlineData"]
                                if inline_data.get("mimeType") == "audio/pcm" and on_audio_response:
                                    audio_data = base64.b64decode(inline_data["data"])
                                    on_audio_response(audio_data)
            
            # Handle turn complete
            if "turnComplete" in data:
                print("Turn completed")
                
        except Exception as e:
            print(f"Error handling response: {e}")
    
    async def close(self):
        """Close the connection"""
        if self.ws:
            await self.ws.close()
        if self.session:
            await self.session.close()
        print("Gemini Live API connection closed")
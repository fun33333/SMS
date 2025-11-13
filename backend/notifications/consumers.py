import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from jwt import decode as jwt_decode
from django.conf import settings

User = get_user_model()


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        """Handle WebSocket connection with JWT authentication"""
        # Get token from query string
        query_string = self.scope.get('query_string', b'').decode()
        token = None
        
        # Parse query string to get token (handle URL encoding)
        from urllib.parse import unquote
        for param in query_string.split('&'):
            if param.startswith('token='):
                token = unquote(param.split('=', 1)[1])
                break
        
        if not token:
            print("WebSocket: No token provided")
            await self.close(code=4001)
            return
        
        # Authenticate user
        user = await self.authenticate_user(token)
        if not user:
            print(f"WebSocket: Authentication failed for token")
            await self.close(code=4003)
            return
        
        # Set user in scope
        self.scope['user'] = user
        self.user = user
        
        # Join user-specific channel group
        self.room_group_name = f'user_{user.id}'
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        print(f"WebSocket: User {user.id} connected to notifications")
        await self.accept()
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        # Leave channel group
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle messages received from WebSocket"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                # Respond to ping with pong
                await self.send(text_data=json.dumps({
                    'type': 'pong'
                }))
        except json.JSONDecodeError:
            pass
    
    async def notification_message(self, event):
        """Send notification to WebSocket"""
        message = event['message']
        await self.send(text_data=json.dumps(message))
    
    @database_sync_to_async
    def authenticate_user(self, token):
        """Authenticate user from JWT token"""
        try:
            # Validate token
            UntypedToken(token)
            
            # Decode token to get user ID
            decoded_data = jwt_decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"]
            )
            
            # Get user
            user_id = decoded_data.get('user_id')
            if user_id:
                try:
                    return User.objects.get(id=user_id)
                except User.DoesNotExist:
                    return None
            return None
        except (InvalidToken, TokenError, Exception) as e:
            print(f"WebSocket authentication error: {e}")
            return None


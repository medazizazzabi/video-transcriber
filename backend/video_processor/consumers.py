import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ProgressConsumer(AsyncWebsocketConsumer):
    # Called when a new WebSocket connection is established
    async def connect(self):
        await self.accept() # Accept the WebSocket connection

        # Add this consumer's channel to a group called "progress_group"
        # This allows us to send messages to all consumers in this group
        await self.channel_layer.group_add(
            "progress_group",
            self.channel_name
        )
        
        # Send an initial message to the frontend to confirm connection
        await self.send(text_data=json.dumps({
            'type': 'connection_status',
            'message': 'Connected to processing service.',
            'status': 'connected'
        }))

    # Called when the WebSocket connection is closed
    async def disconnect(self, close_code):
        # Remove this consumer's channel from the "progress_group"
        await self.channel_layer.group_discard(
            "progress_group",
            self.channel_name
        )

    # Called when a message is received from the WebSocket (from frontend)
    # We don't expect messages from the frontend for this MVP, so it's empty
    async def receive(self, text_data):
        pass

    # Custom method to send progress updates to the frontend
    # This method is called by our views/tasks via the channel layer
    async def send_progress_update(self, event):
        message_data = event['message'] # The 'message' key contains the full JSON payload for the frontend
        await self.send(text_data=json.dumps(message_data))
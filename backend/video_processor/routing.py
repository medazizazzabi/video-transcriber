from django.urls import re_path
from . import consumers

# Defines the URL patterns for WebSocket connections
websocket_urlpatterns = [
    re_path(r'ws/progress/$', consumers.ProgressConsumer.as_asgi()), # Maps '/ws/progress/' to our consumer
]
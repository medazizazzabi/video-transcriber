import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack # Required for AuthMiddlewareStack

# Import your app's routing file
from video_processor import routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'video_transcriber.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(), # Handles regular HTTP requests (e.g., your file upload POST)
    "websocket": AuthMiddlewareStack( # Handles WebSocket connections
        URLRouter(
            routing.websocket_urlpatterns # Routes WebSocket connections to your consumer
        )
    ),
})
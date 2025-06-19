from django.urls import path, include

urlpatterns = [
    path('api/', include('video_processor.urls')),
]
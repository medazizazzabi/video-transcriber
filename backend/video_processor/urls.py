from django.urls import path
from .views import VideoUploadProcessView # Import your view

urlpatterns = [
    # This maps the URL '/api/upload-video/' to your VideoUploadProcessView
    path('upload-video/', VideoUploadProcessView.as_view(), name='upload-video'),
]
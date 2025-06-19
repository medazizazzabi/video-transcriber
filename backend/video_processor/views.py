import os
import uuid
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
from django.http import JsonResponse
from moviepy.editor import VideoFileClip
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import tempfile

import time # Used to simulate work delays for better progress visualization

# --- Helper functions for sending WebSocket messages ---

# Sends a progress update message to the frontend
def send_ws_progress(channel_layer, step_id, status, message_text, overall_progress=None):
    async_to_sync(channel_layer.group_send)(
        "progress_group",
        {
            "type": "send_progress_update", # This is the consumer method name
            "message": { # This dictionary is the actual payload sent to the frontend
                "type": "progress_update",
                "step": step_id,
                "status": status,
                "message": message_text,
                "overall_progress": overall_progress
            }
        }
    )

# Sends an error message to the frontend
def send_ws_error(channel_layer, message_text, step_id=None):
    async_to_sync(channel_layer.group_send)(
        "progress_group",
        {
            "type": "send_progress_update",
            "message": {
                "type": "error",
                "message": message_text,
                "step": step_id,
                "status": "failed"
            }
        }
    )

# --- Main View for Video Upload and Processing ---
@method_decorator(csrf_exempt, name='dispatch')
class VideoUploadProcessView(View):
    def post(self, request, *args, **kwargs):
        # Check if a file named 'video' was sent in the request (matches frontend formData.append("video", selectedFile))
        if 'video' not in request.FILES:
            return JsonResponse({'error': 'No video file provided'}, status=400)

        video_file = request.FILES['video']
        original_filename = video_file.name
        
        # Generate a unique filename to prevent conflicts
        unique_filename = f"{uuid.uuid4()}_{original_filename}"
        
        # Create a temporary path for saving the uploaded video
        # We use tempfile.gettempdir() for cross-platform temporary directory
        # In a more robust system, consider using Django's MEDIA_ROOT
        temp_video_path = os.path.join(tempfile.gettempdir(), unique_filename)

        channel_layer = get_channel_layer() # Get the channel layer instance to send WebSocket messages

        try:
            # Step 1: Upload the video to a temporary local directory
            send_ws_progress(channel_layer, "upload_video", "in_progress", f"Uploading video: {original_filename}...", 10)
            
            # Save the uploaded file in chunks to handle large files efficiently
            with open(temp_video_path, 'wb+') as destination:
                for chunk in video_file.chunks():
                    destination.write(chunk)
            
            send_ws_progress(channel_layer, "upload_video", "completed", "Video uploaded successfully.", 20)
            time.sleep(0.5) # Simulate a small delay

            # Step 2: Extract the audio from the video
            send_ws_progress(channel_layer, "extract_audio", "in_progress", "Starting audio extraction...", 30)
            audio_filename = f"{uuid.uuid4()}.mp3"
            temp_audio_path = os.path.join(tempfile.gettempdir(), audio_filename)

            try:
                video_clip = VideoFileClip(temp_video_path)
                if video_clip.audio: # Check if the video actually has an audio track
                    video_clip.audio.write_audiofile(temp_audio_path)
                    video_clip.close() # Important: close the clip to release resources
                else:
                    raise Exception("Video does not contain an audio track. Cannot extract audio.")
            except Exception as e:
                raise Exception(f"Failed to extract audio. Ensure FFmpeg is installed and video has an audio track. Details: {e}")

            send_ws_progress(channel_layer, "extract_audio", "completed", "Audio extracted.", 50)
            time.sleep(0.5)

            # Step 3: Generate a dummy transcript (replaces actual OpenAI API call)
            send_ws_progress(channel_layer, "get_transcript", "in_progress", "Generating dummy transcript...", 70)
            dummy_transcript = (
                f"This is a dummy transcript for the video '{original_filename}'. The audio was successfully extracted. "
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et "
                "dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip "
                "ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore "
                "eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia "
                "deserunt mollit anim id est laborum."
            )
            send_ws_progress(channel_layer, "get_transcript", "completed", "Dummy transcript generated.", 100)
            time.sleep(0.5)

            # Optional: Mark other frontend steps as completed if they are not part of this basic flow,
            # to make the frontend's progress bar look fully completed.
            # If you prefer these steps to remain 'pending' or be removed from frontend, comment these out.
            send_ws_progress(channel_layer, "summarize_transcript", "completed", "Skipped in basic version.", 100)
            send_ws_progress(channel_layer, "upload_to_s3", "completed", "Skipped in basic version.", 100)

            # Return a JSON response to the HTTP request indicating success
            return JsonResponse(
                {
                    'message': 'Video processed successfully (dummy transcript)',
                    'original_filename': original_filename,
                    'transcript': dummy_transcript,
                },
                status=200
            )

        except Exception as e:
            error_message = f"Processing failed: {str(e)}"
            send_ws_error(channel_layer, error_message, "upload_video") # Send error through WS, potentially linking to the step that failed
            return JsonResponse({'error': error_message}, status=500)
        finally:
            # Ensure temporary files are cleaned up, regardless of success or failure
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            if os.path.exists(temp_audio_path): # Only if audio was successfully created
                os.remove(temp_audio_path)
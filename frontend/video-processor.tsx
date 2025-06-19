"use client"

import type React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, XCircle, Loader2, Clock, Upload, Play, RotateCcw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

// replace these URLs with your actual backend URLs
const WEBSOCKET_URL = "ws://34.46.223.48:8000/ws/progress/"
const UPLOAD_API_URL = "http://34.46.223.48:8000/api/upload-video/"


// Define the structure for a processing step
interface Step {
  id: string
  name: string
  status: "pending" | "in_progress" | "completed" | "failed"
  message?: string
}

// Define the structure for a WebSocket message from the backend
interface WebSocketMessage {
  type: "progress_update" | "error" | "connection_status"
  step?: string
  status?: "in_progress" | "completed" | "failed"
  message?: string
  overall_progress?: number
}

export default function VideoProcessor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([
    { id: "upload_video", name: "Upload Video", status: "pending" },
    { id: "extract_audio", name: "Extract Audio", status: "pending" },
    { id: "get_transcript", name: "Get Transcript", status: "pending" },
    { id: "summarize_transcript", name: "Summarize Transcript", status: "pending" },
    { id: "upload_to_s3", name: "Upload to S3", status: "pending" },
  ])
  const [overallProgress, setOverallProgress] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<
    "not_connected" | "connecting" | "connected" | "disconnected" | "error"
  >("not_connected")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStartTime, setProcessStartTime] = useState<number | null>(null)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to format time in milliseconds to a readable string
  const formatTime = useCallback((ms: number): string => {
    if (ms < 0) return "0s"
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${remainingSeconds}s`
  }, [])

  // Function to reset the component state
  const resetState = useCallback(() => {
    setSelectedFile(null)
    setVideoThumbnailUrl(null)
    setSteps([
      { id: "upload_video", name: "Upload Video", status: "pending" },
      { id: "extract_audio", name: "Extract Audio", status: "pending" },
      { id: "get_transcript", name: "Get Transcript", status: "pending" },
      { id: "summarize_transcript", name: "Summarize Transcript", status: "pending" },
      { id: "upload_to_s3", name: "Upload to S3", status: "pending" },
    ])
    setOverallProgress(0)
    setErrorMessage(null)
    setFeedbackMessage(null)
    setIsProcessing(false)
    setConnectionStatus("not_connected")
    setProcessStartTime(null)
    setEstimatedTimeRemaining(null)

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      ws.current.close()
    }
    ws.current = null
  }, [])

  // Helper to update a single step's status and message
  const updateStep = useCallback(
    (stepId: string, status: Step["status"], message?: string) => {
      setSteps((prevSteps) => {
        const updatedSteps = prevSteps.map((step) => {
          if (step.id === stepId) {
            return { ...step, status, message: message || step.message }
          }
          return step
        })

        const completedSteps = updatedSteps.filter((s) => s.status === "completed").length
        const newProgress = (completedSteps / updatedSteps.length) * 100
        setOverallProgress(newProgress)

        if (processStartTime && newProgress > 0 && newProgress < 100) {
          const elapsed = Date.now() - processStartTime
          const estimatedTotal = (elapsed / newProgress) * 100
          const remaining = estimatedTotal - elapsed
          setEstimatedTimeRemaining(formatTime(remaining))
        } else if (newProgress === 100) {
          setEstimatedTimeRemaining("Completed!")
        } else if (updatedSteps.some((s) => s.status === "failed")) {
          setEstimatedTimeRemaining("Failed.")
        }

        if (newProgress === 100) {
          setFeedbackMessage("Video processing completed successfully!")
          setIsProcessing(false)
        } else if (updatedSteps.some((s) => s.status === "failed")) {
          setFeedbackMessage("Video processing failed.")
          setIsProcessing(false)
        }

        return updatedSteps
      })
    },
    [processStartTime, formatTime],
  )

  // Function to generate video thumbnail
  const generateVideoThumbnail = useCallback((file: File) => {
    setVideoThumbnailUrl(null)
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")

    video.autoplay = true
    video.muted = true
    video.src = URL.createObjectURL(file)
    video.crossOrigin = "anonymous"

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2)
      video.onseeked = () => {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
        setVideoThumbnailUrl(dataUrl)
        URL.revokeObjectURL(video.src)
      }
    }

    video.onerror = () => {
      setErrorMessage("Could not generate video thumbnail.")
      URL.revokeObjectURL(video.src)
    }
  }, [])

  // Handle file selection from input or drag-and-drop
  const handleFile = (file: File | null) => {
    resetState()
    if (!file) {
      return
    }

    const allowedTypes = ["video/mp4", "video/quicktime", "video/x-msvideo"]
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Invalid file type. Please select a video file (.mp4, .mov, .avi).")
      return
    }

    setSelectedFile(file)
    setFeedbackMessage(`Selected file: ${file.name}`)
    generateVideoThumbnail(file)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    handleFile(file || null)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const file = event.dataTransfer.files?.[0]
    handleFile(file || null)
  }

  // WebSocket Connection Logic
  const connectWebSocket = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        setConnectionStatus("connected")
        resolve()
        return
      }

      setConnectionStatus("connecting")
      setErrorMessage(null)
      setFeedbackMessage("Connecting to processing service...")

      ws.current = new WebSocket(WEBSOCKET_URL)

      ws.current.onopen = () => {
        setConnectionStatus("connected")
        setFeedbackMessage("Connected to processing service.")
        console.log("WebSocket connected.")
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        resolve()
      }

      ws.current.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data)
          console.log("Received WS message:", data)

          if (data.type === "progress_update" && data.step && data.status) {
            updateStep(data.step, data.status, data.message)
          } else if (data.type === "error" && data.message) {
            setErrorMessage(`Processing Error: ${data.message}`)
            setIsProcessing(false)
            setSteps((prev) =>
              prev.map((s) => (s.status === "in_progress" ? { ...s, status: "failed", message: data.message } : s)),
            )
            setEstimatedTimeRemaining("Failed.")
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e)
          setErrorMessage("Failed to parse progress update from server.")
        }
      }

      ws.current.onclose = (event) => {
        setConnectionStatus("disconnected")
        setErrorMessage(`Disconnected from processing service. Code: ${event.code}, Reason: ${event.reason}`)
        console.log("WebSocket disconnected:", event)
        if (ws.current?.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket closed before connection was established."))
        }
      }

      ws.current.onerror = (event) => {
        setConnectionStatus("error")
        setErrorMessage(
          `WebSocket connection failed. Please ensure your backend is running and accessible at ${WEBSOCKET_URL}. Check your browser console for more details.`,
        )
        console.error("WebSocket error event:", event)
        reject(new Error("WebSocket connection error."))
      }
    })
  }, [updateStep])

  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("No file selected for upload.")
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    setFeedbackMessage("Initiating connection and upload...")

    try {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        setFeedbackMessage("Connecting to processing service...")
        await connectWebSocket()
        setFeedbackMessage("Connected. Starting upload...")
      }

      setProcessStartTime(Date.now())
      setEstimatedTimeRemaining("Calculating ETA...")

      const formData = new FormData()
      formData.append("video", selectedFile)

      const response = await fetch(UPLOAD_API_URL, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown upload error" }))
        throw new Error(errorData.message || `Upload failed with status: ${response.status}`)
      }

      const result = await response.json()
      setFeedbackMessage(`Upload successful: ${result.message || "Processing initiated."}`)
    } catch (error: any) {
      setErrorMessage(`Upload Error: ${error.message || "Unknown error"}`)
      setIsProcessing(false)
      updateStep("upload_video", "failed", "Upload failed.")
      setEstimatedTimeRemaining("Failed.")
      setConnectionStatus("error")
    }
  }

  const getStatusIcon = (status: Step["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      case "in_progress":
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />
      case "pending":
      default:
        return <Clock className="w-5 h-5 text-slate-400" />
    }
  }

  const getConnectionStatusBadge = () => {
    switch (connectionStatus) {
      case "not_connected":
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
            Not Connected
          </div>
        )
      case "connecting":
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            Connecting...
          </div>
        )
      case "connected":
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            Connected
          </div>
        )
      case "disconnected":
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            Disconnected
          </div>
        )
      case "error":
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-600 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            Error
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent mb-3">
            Video Processing Studio
          </h1>
          <p className="text-slate-600 text-lg">Transform your videos with AI-powered processing</p>
          <div className="flex justify-center mt-4">{getConnectionStatusBadge()}</div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column - Upload & Controls */}
          <div className="space-y-6">
            {/* File Upload Card */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardContent className="p-8">
                <div
                  className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer group ${
                    !selectedFile
                      ? "border-slate-300 hover:border-blue-400 hover:bg-blue-50/50"
                      : "border-blue-200 bg-blue-50/30"
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="video/mp4,video/quicktime,video/x-msvideo"
                    className="hidden"
                  />

                  {!selectedFile ? (
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Upload className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-slate-700 mb-2">Drop your video here</p>
                        <p className="text-slate-500">or click to browse files</p>
                        <p className="text-xs text-slate-400 mt-2">Supports MP4, MOV, AVI formats</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {videoThumbnailUrl && (
                        <div className="relative mx-auto w-48 h-32 rounded-xl overflow-hidden shadow-lg">
                          <img
                            src={videoThumbnailUrl || "/placeholder.svg"}
                            alt="Video Thumbnail"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <Play className="w-8 h-8 text-white opacity-80" />
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-700 mb-1">{selectedFile.name}</p>
                        <p className="text-sm text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          fileInputRef.current?.click()
                        }}
                        className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      >
                        Change File
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Action Button */}
            {selectedFile && (
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  {!isProcessing && connectionStatus !== "connecting" && (
                    <Button
                      onClick={handleUpload}
                      className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      Start Processing
                    </Button>
                  )}
                  {!isProcessing && connectionStatus === "connecting" && (
                    <Button disabled className="w-full h-14 text-lg font-semibold">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Connecting...
                    </Button>
                  )}
                  {isProcessing && (
                    <Button disabled className="w-full h-14 text-lg font-semibold">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Messages */}
            {(errorMessage || feedbackMessage) && (
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  {errorMessage && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                      <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-red-800">Error</p>
                        <p className="text-red-700 text-sm mt-1">{errorMessage}</p>
                      </div>
                    </div>
                  )}
                  {feedbackMessage && !errorMessage && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                      <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-blue-800">Status</p>
                        <p className="text-blue-700 text-sm mt-1">{feedbackMessage}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Progress */}
          <div className="space-y-6">
            {/* Overall Progress */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-800">Overall Progress</h3>
                    <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {overallProgress.toFixed(0)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <Progress value={overallProgress} className="h-3 bg-slate-200" />
                    {isProcessing && estimatedTimeRemaining && (
                      <p className="text-sm text-slate-600 text-right">{estimatedTimeRemaining} remaining</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Processing Steps */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardContent className="p-8">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Processing Steps</h3>
                <div className="space-y-4">
                  {steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`relative flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
                        step.status === "in_progress"
                          ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-md"
                          : step.status === "completed"
                            ? "bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200"
                            : step.status === "failed"
                              ? "bg-gradient-to-r from-red-50 to-pink-50 border border-red-200"
                              : "bg-slate-50 border border-slate-200"
                      }`}
                    >
                      <div className="flex-shrink-0">{getStatusIcon(step.status)}</div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold ${
                            step.status === "completed"
                              ? "text-emerald-800"
                              : step.status === "failed"
                                ? "text-red-800"
                                : step.status === "in_progress"
                                  ? "text-blue-800"
                                  : "text-slate-700"
                          }`}
                        >
                          {step.name}
                        </p>
                        {step.message && <p className="text-sm text-slate-600 mt-1 truncate">{step.message}</p>}
                      </div>
                      <div className="text-sm font-medium text-slate-500">
                        {index + 1}/{steps.length}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Reset Button */}
            {(overallProgress === 100 || errorMessage) && (
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <Button
                    onClick={resetState}
                    variant="outline"
                    className="w-full h-12 text-slate-700 border-slate-300 hover:bg-slate-50"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Process Another Video
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

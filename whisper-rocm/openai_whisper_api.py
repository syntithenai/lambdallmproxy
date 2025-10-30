#!/usr/bin/env python3
"""
OpenAI-compatible Whisper API server using faster-whisper with AMD ROCm support.
Compatible with OpenAI's /v1/audio/transcriptions endpoint.
"""

import os
import tempfile
import logging
from typing import Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import faster_whisper
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Whisper ROCm API",
    description="OpenAI-compatible Whisper transcription API with AMD ROCm GPU support",
    version="1.0.0"
)

# Global model instance
whisper_model: Optional[faster_whisper.WhisperModel] = None


def load_model():
    """Load the Whisper model on startup."""
    global whisper_model
    
    model_name = os.getenv("MODEL_NAME", "distil-small.en")
    device = os.getenv("DEVICE", "cuda")
    compute_type = os.getenv("COMPUTE_TYPE", "default")
    data_dir = os.getenv("DATA_DIR", "/data")
    
    logger.info(f"Loading Whisper model: {model_name}")
    logger.info(f"Device: {device}, Compute type: {compute_type}")
    logger.info(f"Data directory: {data_dir}")
    
    try:
        whisper_model = faster_whisper.WhisperModel(
            model_name,
            download_root=data_dir,
            device=device,
            compute_type=compute_type,
        )
        logger.info("Model loaded successfully!")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


@app.on_event("startup")
async def startup_event():
    """Load model on startup."""
    load_model()


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "message": "Whisper ROCm API Server",
        "model": os.getenv("MODEL_NAME", "distil-small.en"),
        "device": os.getenv("DEVICE", "cuda")
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/v1/audio/transcriptions")
async def transcribe_audio(
    file: UploadFile = File(...),
    model: str = Form(default="whisper-1"),
    language: Optional[str] = Form(default=None),
    prompt: Optional[str] = Form(default=None),
    response_format: str = Form(default="json"),
    temperature: float = Form(default=0.0),
):
    """
    Transcribe audio file to text (OpenAI-compatible endpoint).
    
    Compatible with OpenAI's Whisper API format:
    - file: The audio file to transcribe (required)
    - model: Model to use (ignored, uses server's configured model)
    - language: Language code (e.g., 'en', 'es', 'fr')
    - prompt: Initial prompt to guide transcription
    - response_format: Format of response ('json', 'text', 'srt', 'vtt', 'verbose_json')
    - temperature: Sampling temperature (0.0 to 1.0)
    """
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Save uploaded file to temporary location
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
        tmp_file.write(await file.read())
        tmp_file_path = tmp_file.name
    
    try:
        logger.info(f"Transcribing file: {file.filename}, language: {language}")
        
        # Transcribe using faster-whisper
        # Handle temperature parameter - faster-whisper expects a list or tuple
        # Default to [0.0, 0.2, 0.4, 0.6, 0.8, 1.0] for temperature fallback
        if temperature is not None and temperature > 0:
            temp_value = temperature
        else:
            temp_value = 0.0
        
        segments, info = whisper_model.transcribe(
            tmp_file_path,
            language=language,
            initial_prompt=prompt,
            beam_size=5,
            temperature=temp_value,
        )
        
        # Collect all segments
        transcription_segments = []
        full_text = []
        
        for segment in segments:
            try:
                seg_dict = {
                    "start": float(segment.start) if segment.start is not None else 0.0,
                    "end": float(segment.end) if segment.end is not None else 0.0,
                    "text": str(segment.text) if segment.text is not None else "",
                }
                
                # Add optional fields safely
                if hasattr(segment, 'id'):
                    seg_dict["id"] = segment.id if segment.id is not None else 0
                if hasattr(segment, 'seek'):
                    seg_dict["seek"] = segment.seek if segment.seek is not None else 0
                if hasattr(segment, 'tokens'):
                    seg_dict["tokens"] = segment.tokens if segment.tokens is not None else []
                if hasattr(segment, 'temperature'):
                    seg_dict["temperature"] = segment.temperature if segment.temperature is not None else 0.0
                if hasattr(segment, 'avg_logprob'):
                    seg_dict["avg_logprob"] = segment.avg_logprob if segment.avg_logprob is not None else 0.0
                if hasattr(segment, 'compression_ratio'):
                    seg_dict["compression_ratio"] = segment.compression_ratio if segment.compression_ratio is not None else 0.0
                if hasattr(segment, 'no_speech_prob'):
                    seg_dict["no_speech_prob"] = segment.no_speech_prob if segment.no_speech_prob is not None else 0.0
                
                transcription_segments.append(seg_dict)
                full_text.append(segment.text)
            except Exception as seg_error:
                logger.warning(f"Error processing segment: {seg_error}, skipping")
                continue
        
        text = " ".join(full_text).strip()
        
        logger.info(f"Transcription complete. Detected language: {info.language}")
        
        # Format response based on requested format
        if response_format == "text":
            return JSONResponse(content={"text": text})
        
        elif response_format == "verbose_json":
            return JSONResponse(content={
                "task": "transcribe",
                "language": info.language,
                "duration": info.duration,
                "text": text,
                "segments": transcription_segments,
            })
        
        elif response_format == "srt":
            # SRT subtitle format
            srt_output = []
            for i, seg in enumerate(transcription_segments, 1):
                start_time = format_timestamp(seg["start"], srt=True)
                end_time = format_timestamp(seg["end"], srt=True)
                srt_output.append(f"{i}\n{start_time} --> {end_time}\n{seg['text'].strip()}\n")
            return JSONResponse(content={"text": "\n".join(srt_output)})
        
        elif response_format == "vtt":
            # WebVTT subtitle format
            vtt_output = ["WEBVTT\n"]
            for seg in transcription_segments:
                start_time = format_timestamp(seg["start"])
                end_time = format_timestamp(seg["end"])
                vtt_output.append(f"{start_time} --> {end_time}\n{seg['text'].strip()}\n")
            return JSONResponse(content={"text": "\n".join(vtt_output)})
        
        else:  # Default: json
            return JSONResponse(content={
                "text": text,
                "language": info.language,
                "duration": info.duration,
            })
    
    except Exception as e:
        import traceback
        logger.error(f"Transcription failed: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    finally:
        # Clean up temporary file
        if os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)


def format_timestamp(seconds: float, srt: bool = False) -> str:
    """Format seconds as timestamp for subtitles."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    
    if srt:
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
    else:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )

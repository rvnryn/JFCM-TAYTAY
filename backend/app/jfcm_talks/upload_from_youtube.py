import logging
import re
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from database.deps import get_db
from app.auth.me import get_current_user
from app.models.userModel import User
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Create Router
router = APIRouter(prefix="/api/jfcm-talks", tags=["JFCM Talks - YouTube"])

# Pydantic models for request/response
class YouTubeUploadRequest(BaseModel):
    title: str
    youtubeLink: str
    topic: str
    customTopic: Optional[str] = None
    description: Optional[str] = None

class YouTubeValidateRequest(BaseModel):
    youtubeLink: str

class VideoResponse(BaseModel):
    id: int
    title: str
    videoId: str
    thumbnailUrl: str
    topic: str
    uploadedAt: Optional[datetime]

def extract_youtube_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'youtube\.com\/watch\?.*v=([^&\n?#]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_youtube_thumbnail(video_id: str) -> str:
    """Generate YouTube thumbnail URL"""
    return f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

# Test endpoint to check authentication
@router.get("/test-auth")
async def test_auth(
    current_user: User = Depends(get_current_user)
):
    """Test endpoint to verify authentication is working"""
    return {
        "message": "Authentication successful",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "is_active": current_user.is_active
        }
    }

@router.post("/upload/youtube", status_code=status.HTTP_201_CREATED)
async def upload_youtube_video(
    data: YouTubeUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a YouTube video to JFCM Talks
    
    Requires JWT authentication
    """
    try:
        logger.debug("Upload YouTube request by user_id=%s username=%s", current_user.id, current_user.username)
        
        # Extract YouTube video ID
        video_id = extract_youtube_id(data.youtubeLink)
        if not video_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid YouTube URL"
            )
        
        # Check if video already exists
        existing_video = db.execute(
            text("""
                SELECT id FROM jfcm_talks 
                WHERE youtube_video_id = :video_id
            """),
            {'video_id': video_id}
        ).fetchone()
        
        if existing_video:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This video has already been uploaded"
            )
        
        # Get thumbnail URL
        thumbnail_url = get_youtube_thumbnail(video_id)
        
        # Handle custom topic if "other" is selected
        final_topic = data.topic
        final_custom_topic = None
        if data.topic == 'other' and data.customTopic:
            final_custom_topic = data.customTopic.strip()
        
        # Insert into database using current_user.id
        result = db.execute(
            text("""
                INSERT INTO jfcm_talks (
                    title, 
                    video_type, 
                    youtube_video_id, 
                    youtube_link, 
                    youtube_thumbnail_url,
                    topic, 
                    custom_topic,
                    description, 
                    uploaded_by, 
                    status
                ) VALUES (
                    :title, 
                    'youtube', 
                    :video_id, 
                    :youtube_link, 
                    :thumbnail_url,
                    :topic, 
                    :custom_topic,
                    :description, 
                    :uploaded_by, 
                    'active'
                )
                RETURNING id, title, youtube_video_id, youtube_thumbnail_url, topic, uploaded_at
            """),
            {
                'title': data.title,
                'video_id': video_id,
                'youtube_link': data.youtubeLink,
                'thumbnail_url': thumbnail_url,
                'topic': final_topic,
                'custom_topic': final_custom_topic,
                'description': data.description,
                'uploaded_by': current_user.id  # Use current_user.id directly
            }
        )
        
        db.commit()
        
        # Get the inserted record
        new_video = result.fetchone()
        
        # Return success response
        return {
            'message': 'Video uploaded successfully',
            'video': {
                'id': new_video[0],
                'title': new_video[1],
                'videoId': new_video[2],
                'thumbnailUrl': new_video[3],
                'topic': new_video[4],
                'uploadedAt': new_video[5].isoformat() if new_video[5] else None
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error uploading YouTube video: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload video: {str(e)}"
        )

@router.get("/videos")
async def get_all_videos(
    db: Session = Depends(get_db),
    topic: Optional[str] = None,
    sort: Optional[str] = "newest",
    skip: int = 0,
    limit: int = 50
):
    """
    Get all JFCM Talks videos
    
    Optional filters: topic, sort (newest/oldest)
    """
    try:
        # Build query
        query = """
            SELECT 
                id, title, video_type, youtube_video_id, youtube_link, 
                youtube_thumbnail_url, topic, custom_topic, description, 
                uploaded_by, uploaded_at, views, status
            FROM jfcm_talks
            WHERE status = 'active'
        """
        
        params = {}
        
        # Add topic filter if provided
        if topic and topic != 'all':
            query += " AND topic = :topic"
            params['topic'] = topic
        
        # Add sorting
        if sort == "oldest":
            query += " ORDER BY uploaded_at ASC"
        else:
            query += " ORDER BY uploaded_at DESC"

        query += " LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip
        
        # Execute query
        result = db.execute(text(query), params)
        videos = result.fetchall()
        
        # Format response
        videos_list = []
        for video in videos:
            video_data = {
                'id': video[0],
                'title': video[1],
                'videoType': video[2],
                'youtubeVideoId': video[3],
                'youtubeLink': video[4],
                'thumbnailUrl': video[5],
                'topic': video[6],
                'customTopic': video[7],
                'description': video[8],
                'uploadedBy': video[9],
                'uploadedAt': video[10].isoformat() if video[10] else None,
                'views': video[11],
                'status': video[12],
                'embedUrl': f'https://www.youtube.com/embed/{video[3]}' if video[3] else None
            }
            videos_list.append(video_data)
        
        return {
            'success': True,
            'count': len(videos_list),
            'videos': videos_list
        }
        
    except Exception as e:
        logger.error("Error fetching videos: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch videos: {str(e)}"
        )

@router.post("/validate-youtube")
async def validate_youtube_url(
    data: YouTubeValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validate a YouTube URL and return video information
    
    Requires JWT authentication
    """
    try:
        # Extract video ID
        video_id = extract_youtube_id(data.youtubeLink)
        
        if not video_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid YouTube URL"
            )
        
        # Check if video already exists in database
        existing = db.execute(
            text("""
                SELECT id, title FROM jfcm_talks 
                WHERE youtube_video_id = :video_id
            """),
            {'video_id': video_id}
        ).fetchone()
        
        if existing:
            return {
                'valid': False, 
                'error': 'This video has already been uploaded',
                'existingVideo': {
                    'id': existing[0],
                    'title': existing[1]
                }
            }
        
        # Return valid response with video info
        return {
            'valid': True,
            'videoId': video_id,
            'thumbnailUrl': get_youtube_thumbnail(video_id),
            'embedUrl': f'https://www.youtube.com/embed/{video_id}'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error validating YouTube URL: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate URL: {str(e)}"
        )

@router.delete("/videos/{video_id}", status_code=status.HTTP_200_OK)
async def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a video from JFCM Talks
    
    Requires JWT authentication
    Only the uploader or admin can delete the video
    """
    try:
        # Check if video exists
        video = db.execute(
            text("""
                SELECT id, title, uploaded_by FROM jfcm_talks 
                WHERE id = :video_id
            """),
            {'video_id': video_id}
        ).fetchone()
        
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video not found"
            )
        
        # Check if user has permission to delete
        # Allow deletion if user is the uploader or is an admin
        if video[2] != current_user.id and current_user.role != 'admin':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this video"
            )
        
        # Delete the video (hard delete)
        db.execute(
            text("""
                DELETE FROM jfcm_talks 
                WHERE id = :video_id
            """),
            {'video_id': video_id}
        )
        
        db.commit()
        
        return {
            'success': True,
            'message': f'Video "{video[1]}" deleted successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting video id=%s: %s", video_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete video: {str(e)}"
        )
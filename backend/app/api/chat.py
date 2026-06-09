"""Chat endpoint for movie booking chatbot."""

import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from app.db.session import AsyncSessionLocal
from app.services.chatbot_service import ChatbotService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

_chatbot_service = None

async def get_db():
    """Get database session."""
    async with AsyncSessionLocal() as session:
        yield session

def get_chatbot_service():
    global _chatbot_service
    if _chatbot_service is None:
        _chatbot_service = ChatbotService()
    return _chatbot_service


class ConversationMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    user_id: Optional[int] = None
    conversation_history: Optional[List[ConversationMessage]] = None


@router.post("")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Chat with the movie booking assistant."""
    try:
        service = get_chatbot_service()
        history = None
        if request.conversation_history:
            history = [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]
        
        response = await service.chat(
            message=request.message,
            db=db,
            user_id=request.user_id,
            conversation_history=history
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
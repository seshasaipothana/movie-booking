"""ChatbotService using Groq AI with Llama 3.3 model."""

import logging
from datetime import datetime
from typing import Any

from groq import Groq
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)


class ChatbotService:
    """Chatbot service with Groq using Llama 3.3."""

    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = "llama-3.3-70b-versatile"

    async def chat(
        self,
        message: str,
        db: AsyncSession,
        user_id: int | None = None,
        conversation_history: list[dict] | None = None
    ) -> dict[str, Any]:
        """Process user message and return response."""
        
        if conversation_history is None:
            conversation_history = []
        
        conversation_history.append({
            "role": "user",
            "content": message
        })
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=conversation_history,
                temperature=0.7,
                max_tokens=1000
            )
            
            assistant_message = response.choices[0].message.content
            
            return {
                "response": assistant_message,
                "status": "success",
                "timestamp": datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Groq API error: {str(e)}")
            return {
                "response": "Sorry, I encountered an error. Please try again.",
                "error": str(e),
                "status": "error",
                "timestamp": datetime.now().isoformat()
            }
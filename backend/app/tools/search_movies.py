"""ChatbotService using Groq AI with tools."""

import logging
from datetime import datetime
from typing import Any

from groq import Groq
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.tools.search_movies import search_movies

logger = logging.getLogger(__name__)


class ChatbotService:
    """Chatbot service with Groq and movie tools."""

    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = "mixtral-8x7b-32768"

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
        
        # Add user message to history
        conversation_history.append({
            "role": "user",
            "content": message
        })
        
        try:
            # Call Groq
            response = self.client.chat.completions.create(
                model=self.model,
                messages=conversation_history,
                temperature=0.7,
                max_tokens=1000
            )
            
            assistant_message = response.choices[0].message.content
            
            # Try to extract movie search intent and call tool if needed
            response_text = assistant_message
            tool_result = None
            
            if any(word in message.lower() for word in ["action", "movie", "film", "genre", "search"]):
                try:
                    # Extract genre or keywords from message
                    search_query = message.lower()
                    genre = None
                    
                    if "action" in search_query:
                        genre = "action"
                    elif "comedy" in search_query:
                        genre = "comedy"
                    elif "drama" in search_query:
                        genre = "drama"
                    elif "horror" in search_query:
                        genre = "horror"
                    
                    if genre:
                        tool_result = await search_movies(
                            user_id=user_id or 1,
                            genre=genre,
                            limit=5
                        )
                        
                        if tool_result.get("movies"):
                            movie_list = "\n".join([
                                f"- {m['title']} ({m['genre']}) - Rating: {m['rating']}"
                                for m in tool_result["movies"]
                            ])
                            response_text = f"Here are some {genre} movies:\n{movie_list}"
                except Exception as e:
                    logger.error(f"Tool error: {str(e)}")
            
            return {
                "response": response_text,
                "tool_result": tool_result,
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
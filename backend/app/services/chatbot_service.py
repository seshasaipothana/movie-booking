"""ChatbotService using Groq AI with proper tool calling."""
import logging
import json
from datetime import datetime
from typing import Any
from groq import Groq
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models import Movie, Showtime, Booking, Seat

logger = logging.getLogger(__name__)

class ChatbotService:
    """Chatbot service with Groq and tool calling."""
    
    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = "mixtral-8x7b-32768"
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "search_movies",
                    "description": "Search for movies by genre, title, or keyword",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Movie genre or title to search for"
                            }
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_showtimes",
                    "description": "Get showtimes for a specific movie",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "movie_id": {
                                "type": "integer",
                                "description": "The ID of the movie"
                            }
                        },
                        "required": ["movie_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "book_tickets",
                    "description": "Book movie tickets",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "showtime_id": {
                                "type": "integer",
                                "description": "The ID of the showtime"
                            },
                            "num_seats": {
                                "type": "integer",
                                "description": "Number of seats to book"
                            }
                        },
                        "required": ["showtime_id", "num_seats"]
                    }
                }
            }
        ]
    
    async def search_movies(self, query: str, db: AsyncSession) -> list[dict]:
        """Search for movies."""
        search_term = f"%{query.lower()}%"
        result = await db.execute(
            select(Movie).where(
                (Movie.title.ilike(search_term)) | (Movie.genre.ilike(search_term))
            ).limit(5)
        )
        movies = result.scalars().all()
        return [{"id": m.id, "title": m.title, "genre": m.genre} for m in movies]
    
    async def get_showtimes(self, movie_id: int, db: AsyncSession) -> list[dict]:
        """Get showtimes for a movie."""
        result = await db.execute(
            select(Showtime).where(Showtime.movie_id == movie_id).limit(3)
        )
        showtimes = result.scalars().all()
        return [
            {
                "id": s.id,
                "start_time": s.start_time.isoformat(),
                "price": float(s.price)
            }
            for s in showtimes
        ]
    
    async def book_tickets(
        self,
        showtime_id: int,
        num_seats: int,
        db: AsyncSession,
        user_id: int
    ) -> dict[str, Any]:
        """Book tickets."""
        try:
            result = await db.execute(
                select(Seat).where(
                    (Seat.showtime_id == showtime_id) &
                    (Seat.is_booked == False)
                ).limit(num_seats)
            )
            available_seats = result.scalars().all()
            
            if len(available_seats) < num_seats:
                return {"error": f"Only {len(available_seats)} seats available"}
            
            booking = Booking(user_id=user_id, showtime_id=showtime_id, status="confirmed")
            db.add(booking)
            
            for seat in available_seats:
                seat.is_booked = True
                seat.booking_id = booking.id
            
            await db.commit()
            
            showtime_result = await db.execute(select(Showtime).where(Showtime.id == showtime_id))
            showtime = showtime_result.scalar_one()
            
            return {
                "success": True,
                "booking_id": booking.id,
                "seats": num_seats,
                "total_price": num_seats * float(showtime.price)
            }
        except Exception as e:
            await db.rollback()
            return {"error": str(e)}
    
    async def _process_tool_call(
        self,
        tool_name: str,
        tool_input: dict,
        db: AsyncSession,
        user_id: int
    ) -> str:
        """Process a tool call."""
        try:
            if tool_name == "search_movies":
                result = await self.search_movies(tool_input["query"], db)
            elif tool_name == "get_showtimes":
                result = await self.get_showtimes(tool_input["movie_id"], db)
            elif tool_name == "book_tickets":
                result = await self.book_tickets(
                    tool_input["showtime_id"],
                    tool_input["num_seats"],
                    db,
                    user_id
                )
            else:
                result = {"error": f"Unknown tool: {tool_name}"}
            return json.dumps(result)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    async def chat(
        self,
        message: str,
        db: AsyncSession,
        user_id: int,
        conversation_history: list[dict] | None = None
    ) -> dict[str, Any]:
        """Process user message with tool calling."""
        
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
                tools=self.tools,
                temperature=0.7,
                max_tokens=1000
            )
            
            # Process tool calls if any
            while response.choices[0].message.tool_calls:
                tool_calls = response.choices[0].message.tool_calls
                
                # Add assistant response
                conversation_history.append({
                    "role": "assistant",
                    "content": response.choices[0].message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in tool_calls
                    ]
                })
                
                # Process each tool call
                for tool_call in tool_calls:
                    tool_input = json.loads(tool_call.function.arguments)
                    tool_result = await self._process_tool_call(
                        tool_call.function.name,
                        tool_input,
                        db,
                        user_id
                    )
                    
                    conversation_history.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": tool_result
                    })
                
                # Get next response
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=conversation_history,
                    tools=self.tools,
                    temperature=0.7,
                    max_tokens=1000
                )
            
            assistant_message = response.choices[0].message.content or "Booking complete!"
            
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

"""ChatbotService using Groq AI with Llama 3.3 model and tool calling."""
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
    """Chatbot service with Groq using Llama 3.3 and tool calling."""
    
    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = "llama-3.3-70b-versatile"
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
                                "description": "Search query (genre, title, or keyword)"
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
                    "description": "Get available showtimes for a movie",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "movie_id": {
                                "type": "integer",
                                "description": "ID of the movie"
                            }
                        },
                        "required": ["movie_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "book_movie",
                    "description": "Book a movie ticket for a specific showtime and seats",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "showtime_id": {
                                "type": "integer",
                                "description": "ID of the showtime"
                            },
                            "num_seats": {
                                "type": "integer",
                                "description": "Number of seats to book (1-10)"
                            }
                        },
                        "required": ["showtime_id", "num_seats"]
                    }
                }
            }
        ]
    
    async def search_movies(self, query: str, db: AsyncSession) -> list[dict]:
        """Search for movies by title or genre."""
        search_term = f"%{query.lower()}%"
        result = await db.execute(
            select(Movie).where(
                (Movie.title.ilike(search_term)) | (Movie.genre.ilike(search_term))
            ).limit(5)
        )
        movies = result.scalars().all()
        return [
            {
                "id": m.id,
                "title": m.title,
                "genre": m.genre,
                "duration_minutes": m.duration_minutes
            }
            for m in movies
        ]
    
    async def get_showtimes(self, movie_id: int, db: AsyncSession) -> list[dict]:
        """Get showtimes for a movie."""
        result = await db.execute(
            select(Showtime).where(Showtime.movie_id == movie_id).limit(5)
        )
        showtimes = result.scalars().all()
        return [
            {
                "id": s.id,
                "start_time": s.start_time.isoformat(),
                "screen_id": s.screen_id,
                "price": float(s.price)
            }
            for s in showtimes
        ]
    
    async def book_movie(
        self, 
        showtime_id: int, 
        num_seats: int,
        db: AsyncSession,
        user_id: int | None = None
    ) -> dict[str, Any]:
        """Book tickets for a showtime."""
        if not user_id:
            return {"error": "User not authenticated", "status": "error"}
        
        if num_seats < 1 or num_seats > 10:
            return {"error": "Invalid number of seats (1-10)", "status": "error"}
        
        try:
            # Get available seats
            result = await db.execute(
                select(Seat).where(
                    (Seat.showtime_id == showtime_id) & 
                    (Seat.is_booked == False)
                ).limit(num_seats)
            )
            available_seats = result.scalars().all()
            
            if len(available_seats) < num_seats:
                return {
                    "error": f"Only {len(available_seats)} seats available",
                    "status": "error"
                }
            
            # Create booking
            seat_ids = [s.id for s in available_seats]
            booking = Booking(
                user_id=user_id,
                showtime_id=showtime_id,
                status="confirmed"
            )
            db.add(booking)
            
            # Mark seats as booked
            for seat in available_seats:
                seat.is_booked = True
                seat.booking_id = booking.id
            
            await db.commit()
            
            return {
                "status": "success",
                "message": f"✅ Booked {num_seats} seat(s)",
                "booking_id": booking.id,
                "seats": seat_ids
            }
        except Exception as e:
            await db.rollback()
            logger.error(f"Booking error: {str(e)}")
            return {"error": str(e), "status": "error"}
    
    async def chat(
        self,
        message: str,
        db: AsyncSession,
        user_id: int | None = None,
        conversation_history: list[dict] | None = None
    ) -> dict[str, Any]:
        """Process user message with tool calling support."""
        
        if conversation_history is None:
            conversation_history = []
        
        conversation_history.append({
            "role": "user",
            "content": message
        })
        
        try:
            # First API call with tools
            response = self.client.chat.completions.create(
                model=self.model,
                messages=conversation_history,
                tools=self.tools,
                temperature=0.7,
                max_tokens=1000
            )
            
            # Check if model wants to use tools
            if response.choices[0].message.tool_calls:
                # Process tool calls
                tool_results = []
                for tool_call in response.choices[0].message.tool_calls:
                    result = await self._handle_tool_call(
                        tool_call.function.name,
                        json.loads(tool_call.function.arguments),
                        db,
                        user_id
                    )
                    tool_results.append({
                        "tool_call_id": tool_call.id,
                        "result": json.dumps(result)
                    })
                
                # Add assistant response and tool results to history
                conversation_history.append({
                    "role": "assistant",
                    "content": response.choices[0].message.content or "",
                    "tool_calls": response.choices[0].message.tool_calls
                })
                
                for tool_result in tool_results:
                    conversation_history.append({
                        "role": "tool",
                        "tool_call_id": tool_result["tool_call_id"],
                        "content": tool_result["result"]
                    })
                
                # Second API call to generate final response
                final_response = self.client.chat.completions.create(
                    model=self.model,
                    messages=conversation_history,
                    temperature=0.7,
                    max_tokens=500
                )
                
                assistant_message = final_response.choices[0].message.content
            else:
                # No tools needed, use direct response
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
    
    async def _handle_tool_call(
        self,
        tool_name: str,
        arguments: dict,
        db: AsyncSession,
        user_id: int | None
    ) -> dict[str, Any]:
        """Handle tool function calls."""
        try:
            if tool_name == "search_movies":
                results = await self.search_movies(arguments["query"], db)
                return {"movies": results, "count": len(results)}
            
            elif tool_name == "get_showtimes":
                results = await self.get_showtimes(arguments["movie_id"], db)
                return {"showtimes": results, "count": len(results)}
            
            elif tool_name == "book_movie":
                return await self.book_movie(
                    arguments["showtime_id"],
                    arguments["num_seats"],
                    db,
                    user_id
                )
            
            else:
                return {"error": f"Unknown tool: {tool_name}"}
        
        except Exception as e:
            logger.error(f"Tool call error: {str(e)}")
            return {"error": str(e)}

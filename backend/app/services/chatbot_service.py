"""ChatbotService using Groq AI with sequential tool calling."""
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

SYSTEM_PROMPT = """You are a movie booking assistant. Help users find movies and book tickets.

You have access to these tools:
1. search_movies(query) - Search movies by title or genre
2. get_showtimes(movie_id) - Get showtimes for a movie
3. book_tickets(showtime_id, num_seats) - Book tickets

IMPORTANT RULES:
- Call ONE tool at a time. Never nest function calls.
- Wait for tool results before calling the next tool.
- To book tickets, first search for the movie, then get showtimes, then book.
"""

class ChatbotService:
    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = "qwen/qwen3-32b"
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "search_movies",
                    "description": "Search for movies by title or genre. Returns movie id, title, genre.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Movie title or genre"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_showtimes",
                    "description": "Get available showtimes for a movie by its id.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "movie_id": {"type": "integer", "description": "The movie id"}
                        },
                        "required": ["movie_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "book_tickets",
                    "description": "Book tickets for a showtime.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "showtime_id": {"type": "integer", "description": "The showtime id"},
                            "num_seats": {"type": "integer", "description": "Number of seats to book"}
                        },
                        "required": ["showtime_id", "num_seats"]
                    }
                }
            }
        ]

    async def _search_movies(self, query: str, db: AsyncSession) -> list[dict]:
        search_term = f"%{query.lower()}%"
        result = await db.execute(
            select(Movie).where(
                (Movie.title.ilike(search_term)) | (Movie.genre.ilike(search_term))
            ).limit(5)
        )
        movies = result.scalars().all()
        return [{"id": m.id, "title": m.title, "genre": m.genre} for m in movies]

    async def _get_showtimes(self, movie_id: int, db: AsyncSession) -> list[dict]:
        from datetime import timezone
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Showtime).where(
                Showtime.movie_id == movie_id,
                Showtime.start_time > now
            ).limit(5)
        )
        showtimes = result.scalars().all()
        return [
            {"id": s.id, "start_time": s.start_time.isoformat(), "price": float(s.price)}
            for s in showtimes
        ]

    async def _book_tickets(self, showtime_id: int, num_seats: int, db: AsyncSession, user_id: int) -> dict:
        try:
            seats_result = await db.execute(
                select(Seat).where(
                    Seat.showtime_id == showtime_id,
                    Seat.is_booked == False
                ).limit(num_seats)
            )
            available = seats_result.scalars().all()

            if len(available) < num_seats:
                return {"error": f"Only {len(available)} seats available"}

            booking = Booking(user_id=user_id, showtime_id=showtime_id, status="confirmed")
            db.add(booking)
            await db.flush()

            for seat in available:
                seat.is_booked = True
                seat.booking_id = booking.id

            await db.commit()

            showtime = (await db.execute(
                select(Showtime).where(Showtime.id == showtime_id)
            )).scalar_one()

            return {
                "success": True,
                "booking_id": booking.id,
                "seats_booked": num_seats,
                "total_price": num_seats * float(showtime.price),
                "message": f"Successfully booked {num_seats} seat(s)!"
            }
        except Exception as e:
            await db.rollback()
            return {"error": str(e)}

    async def _run_tool(self, name: str, args: dict, db: AsyncSession, user_id: int) -> str:
        try:
            if name == "search_movies":
                result = await self._search_movies(args["query"], db)
            elif name == "get_showtimes":
                result = await self._get_showtimes(args["movie_id"], db)
            elif name == "book_tickets":
                result = await self._book_tickets(args["showtime_id"], args["num_seats"], db, user_id)
            else:
                result = {"error": f"Unknown tool: {name}"}
            return json.dumps(result)
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def chat(
        self,
        message: str,
        db: AsyncSession,
        user_id: int | None = None,
        conversation_history: list[dict] | None = None
    ) -> dict[str, Any]:
        if conversation_history is None:
            conversation_history = []

        # Add system prompt if first message
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversation_history
        messages.append({"role": "user", "content": message})

        try:
            max_iterations = 10
            for _ in range(max_iterations):
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=self.tools,
                    tool_choice="auto",
                    temperature=0.3,
                    max_tokens=1000
                )

                msg = response.choices[0].message

                if not msg.tool_calls:
                    return {
                        "response": msg.content or "Done!",
                        "status": "success",
                        "timestamp": datetime.now().isoformat()
                    }

                # Add assistant message with tool calls
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in msg.tool_calls
                    ]
                })

                # Execute each tool and add results
                for tc in msg.tool_calls:
                    args = json.loads(tc.function.arguments)
                    result = await self._run_tool(tc.function.name, args, db, user_id or 0)
                    logger.info(f"Tool {tc.function.name}({args}) -> {result}")
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result
                    })

            return {
                "response": "I completed your request.",
                "status": "success",
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Groq error: {e}")
            return {
                "response": "Sorry, I encountered an error.",
                "error": str(e),
                "status": "error",
                "timestamp": datetime.now().isoformat()
            }

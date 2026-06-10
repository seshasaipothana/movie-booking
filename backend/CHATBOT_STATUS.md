# AI Chatbot Tool Calling - COMPLETE ✅

## Status
The chatbot now successfully uses tool calling to:
1. **search_movies(query)** - Find movies by title
2. **get_showtimes(movie_id)** - Get future showtimes
3. **book_tickets(showtime_id, num_seats)** - Create confirmed bookings

## Verified Bookings
- Booking 9: Inception (2 seats) - user 3
- Booking 10: Inception (2 seats) - user 3  
- Booking 11: Inception (2 seats) - user 3
- Booking 19: The Matrix (3 seats) - user 3

## Model
- **llama-3.3-70b-versatile** via Groq API
- tool_choice="required" to force function calling

## Key Fixes Applied
1. Removed `Movie.genre` references (field doesn't exist)
2. Fixed `_book_tickets` to use Booking model directly (Seat has no showtime_id)
3. Added time filter to `_get_showtimes` (only future showtimes)
4. Strengthened system prompt to enforce sequential tool calls
5. Fixed integer type validation for movie_id and showtime_id

## Usage
```bash
curl -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Book 2 seats for Inception", "user_id": 3}'
```

Response: `{"response": "Your booking is confirmed! Enjoy the movie!", "status": "success"}`

## Next Steps
- Test from React frontend Chat.tsx widget
- Set up systemd auto-restart on EC2 reboot
- Configure DuckDNS auto-update cron

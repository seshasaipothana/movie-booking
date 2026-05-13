"""WebSocket endpoint for real-time seat updates."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json

router = APIRouter()

# Store active connections per showtime
# Format: {showtime_id: {websocket1, websocket2, ...}}
connections: Dict[int, Set[WebSocket]] = {}


@router.websocket("/ws/showtimes/{showtime_id}")
async def websocket_endpoint(websocket: WebSocket, showtime_id: int):
    """WebSocket connection for real-time seat updates."""
    await websocket.accept()
    
    # Add this connection to the showtime's connection pool
    if showtime_id not in connections:
        connections[showtime_id] = set()
    connections[showtime_id].add(websocket)
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Broadcast to all other clients viewing this showtime
            for connection in connections[showtime_id]:
                if connection != websocket:
                    await connection.send_text(json.dumps(message))
    
    except WebSocketDisconnect:
        # Remove connection when client disconnects
        connections[showtime_id].discard(websocket)
        if not connections[showtime_id]:
            del connections[showtime_id]
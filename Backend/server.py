# server.py
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from Backend.AthenaBE import respond_to_user
import asyncio

app = FastAPI()

@app.get("/")
async def stream(prompt: str):
    async def event_generator():
        # Imagine respond_to_user yields tokens instead of one big string
        reply = respond_to_user(prompt)
        for word in reply.split():
            yield f"data: {word} \n\n"
            await asyncio.sleep(0.2)  # simulate streaming delay
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
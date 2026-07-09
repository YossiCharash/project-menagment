"""Schemas for the in-app guidance assistant (עוזר הדרכה בצ'אט)."""
from typing import Literal

from pydantic import BaseModel, Field


class AssistantMessage(BaseModel):
    """A single turn in the conversation."""
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    """The recent conversation history; the last message is the new question."""
    messages: list[AssistantMessage] = Field(min_length=1, max_length=20)


class AssistantChatResponse(BaseModel):
    reply: str

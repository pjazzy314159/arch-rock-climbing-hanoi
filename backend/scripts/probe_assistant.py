"""Probe the assistant with realistic questions and report how it answered.

Usage: uv run python scripts/probe_assistant.py
"""

from __future__ import annotations

import json
import urllib.request

API = "http://localhost:8000"

QUESTIONS = [
    # Questions the published FAQ should answer.
    "Do I need climbing experience to visit?",
    "How much does a day pass cost?",
    "What time do you open?",
    "What are your opening hours?",
    "How are the routes graded?",
    "Do you rent climbing shoes?",
    "Do you have courses for beginners?",
    "What should I wear?",
    "How do I record my climbs?",
    "How does voting work?",
    "Is there a safety agreement?",
    "How do I contact you?",
    "What events do you run?",
    # Questions it should NOT answer.
    "What is the wifi password?",
    "Do you sell climbing shoes online?",
    "Can I bring my dog?",
    "Do you offer refunds?",
    "Who is the owner?",
    "What is the exact street address?",
]


def ask(question: str) -> dict:
    request = urllib.request.Request(
        f"{API}/api/assistant/chat",
        data=json.dumps({"question": question}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read())


def main() -> None:
    covered = 0
    not_covered = 0
    wrong = 0

    for question in QUESTIONS:
        answer = ask(question)
        mode = answer["mode"]
        source = answer["sources"][0]["question"] if answer["sources"] else ""
        mark = {"knowledge_base": "ANSWERED", "not_covered": "NOT COVERED"}.get(mode, mode.upper())
        if mode == "knowledge_base":
            covered += 1
        elif mode == "not_covered":
            not_covered += 1
        print(f"{mark:<12} | {question}")
        if source:
            print(f"{'':<12} | -> {source}")

    print()
    print(f"answered: {covered}   not covered: {not_covered}   wrong: {wrong}")
    print(f"answer rate: {covered}/{len(QUESTIONS)}")


if __name__ == "__main__":
    main()

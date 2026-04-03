from dataclasses import dataclass
from typing import Any


@dataclass
class BotDecision:
    action_type: str
    payload: dict[str, Any]


class BotBrain:
    """
    Placeholder entry point for difficulty-based card-game AI.

    Keep bot logic in Python so different strategies can be isolated
    without cluttering the TypeScript match engine.
    """

    def __init__(self, difficulty: str = "normal") -> None:
        self.difficulty = difficulty

    def choose_action(self, game_state: dict[str, Any]) -> BotDecision:
        """
        Replace this with real game-specific logic later.
        """
        return BotDecision(
            action_type="end_turn",
            payload={
                "reason": f"Stub AI action for difficulty={self.difficulty}",
                "visible_players": len(game_state.get("players", [])),
            },
        )


if __name__ == "__main__":
    sample_state = {
        "players": ["p1", "p2", "bot-1"],
        "turn": 1,
    }
    brain = BotBrain(difficulty="normal")
    print(brain.choose_action(sample_state))

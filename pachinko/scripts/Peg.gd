extends StaticBody2D

## 釘1本。玉との衝突を検知し、将来的なSE/発光演出のフックとして signal を発火する。

signal hit(peg: StaticBody2D, ball: Node)

@export var radius: float = 4.0

func notify_hit(ball: Node) -> void:
	hit.emit(self, ball)

func _draw() -> void:
	draw_circle(Vector2.ZERO, radius, Color(0.55, 0.42, 0.85))
	draw_circle(Vector2.ZERO, radius * 0.35, Color(0.85, 0.75, 1.0))

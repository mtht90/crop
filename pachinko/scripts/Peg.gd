extends StaticBody2D

## 釘1本。玉との衝突を検知し、将来的なSE/発光演出のフックとして signal を発火する。

signal hit(peg: StaticBody2D, ball: Node)

@export var radius: float = 4.0

func notify_hit(ball: Node) -> void:
	hit.emit(self, ball)

func _draw() -> void:
	draw_circle(Vector2.ZERO, radius, Color(0.23, 0.35, 0.47))
	draw_circle(Vector2.ZERO, radius * 0.35, Color(0.82, 0.24, 0.24))

extends StaticBody2D

## 釘1本。玉との衝突を検知し、将来的なSE/発光演出のフックとして signal を発火する。

signal hit(peg: StaticBody2D, ball: Node)

func notify_hit(ball: Node) -> void:
	hit.emit(self, ball)

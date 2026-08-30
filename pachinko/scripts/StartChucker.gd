extends Area2D

## 始動チャッカー。玉が入賞したら保留を1つ積んで玉を消費する。

signal entered(ball: Node)

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node) -> void:
	if not body.is_in_group("ball"):
		return
	entered.emit(body)
	body.queue_free()

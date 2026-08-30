extends RigidBody2D

## 発射された1個の玉。盤外(下端)に落下したら自身を破棄し GameManager に通知する。

signal ball_lost(ball: RigidBody2D)

@export var out_of_bounds_y: float = 1400.0
@export var radius: float = 6.0

func _ready() -> void:
	add_to_group("ball")
	contact_monitor = true
	max_contacts_reported = 8
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node) -> void:
	if body.has_method("notify_hit"):
		body.notify_hit(self)

func _physics_process(_delta: float) -> void:
	if global_position.y > out_of_bounds_y:
		ball_lost.emit(self)
		queue_free()

func _draw() -> void:
	draw_circle(Vector2.ZERO, radius, Color(0.85, 0.87, 0.94))
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 24, Color(0.5, 0.5, 0.6), 1.0, true)

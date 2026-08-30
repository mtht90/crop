extends Node
## AudioService: バス管理、3D ワンショット再生、同時発音数制限（Autoload）。

const MAX_CONCURRENT_ONE_SHOTS: int = 32

var _active_players: Array[AudioStreamPlayer3D] = []


func play_one_shot_3d(stream: AudioStream, world_position: Vector3, bus: StringName = &"SFX") -> void:
	if _active_players.size() >= MAX_CONCURRENT_ONE_SHOTS:
		_reclaim_oldest_player()
	var player := AudioStreamPlayer3D.new()
	player.stream = stream
	player.bus = String(bus)
	player.global_position = world_position
	add_child(player)
	player.finished.connect(_on_player_finished.bind(player))
	_active_players.append(player)
	player.play()


func _on_player_finished(player: AudioStreamPlayer3D) -> void:
	_active_players.erase(player)
	player.queue_free()


func _reclaim_oldest_player() -> void:
	if _active_players.is_empty():
		return
	var oldest: AudioStreamPlayer3D = _active_players.pop_front()
	oldest.stop()
	oldest.queue_free()

class_name AnimationDriver extends Node
## AnimationTree への状態流し込みのみを行う。ロジックを持たない（第3.2章）。
## Locomotion は AnimationNodeStateMachine（Idle/Walk/Run/Jump/Death）で表現する。
## 使用するクリップ名は KayKit CC0 アセットに対して実測確認済み
## （docs/ENGINE_BASELINE.md, docs/ANIMATION_PIPELINE.md 参照）。
## ルートモーションは使わず、MovementComponent.state（Simulation層）が
## 速度の権威を持つ。ここでは読み取るだけで一切の移動計算を行わない。

const WALK_SPEED_THRESHOLD_MPS: float = 1.0
const RUN_SPEED_THRESHOLD_MPS: float = 4.5
const LOCOMOTION_XFADE_SECONDS: float = 0.15
const DEATH_XFADE_SECONDS: float = 0.1

const LOCOMOTION_STATES: Array[StringName] = [&"idle", &"walk", &"run", &"jump"]
const CLIP_BY_STATE: Dictionary = {
	&"idle": &"Idle",
	&"walk": &"Walking_A",
	&"run": &"Running_A",
	&"jump": &"Jump_Idle",
	&"death": &"Death_A",
}

var _animation_tree: AnimationTree
var _playback: AnimationNodeStateMachinePlayback
var _movement_component: MovementComponent
var _is_dead: bool = false


func initialize(
	movement_component: MovementComponent, health_component: HealthComponent, animation_player: AnimationPlayer
) -> void:
	_movement_component = movement_component
	health_component.died.connect(_on_died)
	_build_animation_tree(animation_player)


func _build_animation_tree(animation_player: AnimationPlayer) -> void:
	var state_machine := AnimationNodeStateMachine.new()
	for state_name: StringName in CLIP_BY_STATE.keys():
		state_machine.add_node(state_name, _make_animation_node(CLIP_BY_STATE[state_name]), Vector2.ZERO)

	for from_state: StringName in LOCOMOTION_STATES:
		for to_state: StringName in LOCOMOTION_STATES:
			if from_state == to_state:
				continue
			state_machine.add_transition(from_state, to_state, _make_transition(LOCOMOTION_XFADE_SECONDS))
		state_machine.add_transition(from_state, &"death", _make_transition(DEATH_XFADE_SECONDS))

	_animation_tree = AnimationTree.new()
	_animation_tree.name = "AnimationTree"
	_animation_tree.tree_root = state_machine
	_animation_tree.anim_player = animation_player.get_path()
	add_child(_animation_tree)
	_animation_tree.active = true
	_playback = _animation_tree.get("parameters/playback")


func _make_animation_node(anim_name: StringName) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	node.animation = anim_name
	return node


func _make_transition(xfade_seconds: float) -> AnimationNodeStateMachineTransition:
	var transition := AnimationNodeStateMachineTransition.new()
	transition.xfade_time = xfade_seconds
	transition.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
	return transition


func _process(_delta: float) -> void:
	if _playback == null or _is_dead:
		return
	var target_state: StringName = _decide_locomotion_state()
	if _playback.get_current_node() != target_state:
		_playback.travel(target_state)


func _decide_locomotion_state() -> StringName:
	if not _movement_component.state.is_grounded:
		return &"jump"
	var horizontal_speed: float = Vector2(
		_movement_component.state.velocity.x, _movement_component.state.velocity.z
	).length()
	if horizontal_speed >= RUN_SPEED_THRESHOLD_MPS:
		return &"run"
	if horizontal_speed >= WALK_SPEED_THRESHOLD_MPS:
		return &"walk"
	return &"idle"


func _on_died(_killer_hero_id: int) -> void:
	_is_dead = true
	if _playback != null:
		_playback.travel(&"death")

class_name InputComponent extends Node
## ローカル入力（_input/_unhandled_input）から InputCommand を生成する。
## _process でのポーリングによる1フレーム遅延を作らないため、実装は Phase 2 でイベント駆動にする。

func build_input_command(tick: int, delta: float) -> InputCommand:
	var command := InputCommand.new()
	command.tick = tick
	command.delta = delta
	command.move = Vector2.ZERO
	command.look_yaw = 0.0
	command.look_pitch = 0.0
	command.buttons = 0
	return command

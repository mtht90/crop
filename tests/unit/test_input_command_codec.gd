extends GdUnitTestSuite
## InputCommand の量子化エンコード/デコードの往復精度を検証する（第5.2章 帯域最適化）。


func test_round_trip_preserves_tick_and_buttons_exactly() -> void:
	var cmd := InputCommand.new()
	cmd.tick = 123456
	cmd.move = Vector2(0.5, -0.25)
	cmd.look_yaw = 1.23
	cmd.look_pitch = -0.5
	cmd.buttons = InputButtons.FIRE | InputButtons.JUMP

	var encoded: PackedByteArray = InputCommandCodec.encode(cmd)
	assert_int(encoded.size()).is_equal(12)

	var decoded: InputCommand = InputCommandCodec.decode(encoded, 1.0 / 60.0)
	assert_int(decoded.tick).is_equal(cmd.tick)
	assert_int(decoded.buttons).is_equal(cmd.buttons)


func test_round_trip_move_and_angles_within_quantization_tolerance() -> void:
	var cmd := InputCommand.new()
	cmd.tick = 1
	cmd.move = Vector2(1.0, -1.0)
	cmd.look_yaw = 3.0
	cmd.look_pitch = 0.7
	cmd.buttons = 0

	var decoded: InputCommand = InputCommandCodec.decode(InputCommandCodec.encode(cmd), 0.0)

	assert_float(decoded.move.x).is_equal_approx(cmd.move.x, 0.01)
	assert_float(decoded.move.y).is_equal_approx(cmd.move.y, 0.01)
	assert_float(decoded.look_yaw).is_equal_approx(cmd.look_yaw, 0.001)
	assert_float(decoded.look_pitch).is_equal_approx(cmd.look_pitch, 0.001)

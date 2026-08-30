class_name InputCommandCodec extends RefCounted
## InputCommand の量子化エンコード/デコード（第5.2章）。
## move は int8 x2、look_yaw は uint16、look_pitch は int16、buttons は int8、
## tick は int32 として詰め、1入力あたりの帯域を切り詰める。

const MOVE_QUANTIZE_SCALE: float = 127.0
const YAW_RANGE_RADIANS: float = TAU
const PITCH_RANGE_RADIANS: float = PI
const PITCH_QUANTIZE_SCALE: float = 32767.0
const YAW_QUANTIZE_SCALE: float = 65535.0


static func encode(cmd: InputCommand) -> PackedByteArray:
	var bytes := PackedByteArray()
	bytes.resize(12)
	bytes.encode_s32(0, cmd.tick)
	bytes.encode_s8(4, int(clampf(cmd.move.x, -1.0, 1.0) * MOVE_QUANTIZE_SCALE))
	bytes.encode_s8(5, int(clampf(cmd.move.y, -1.0, 1.0) * MOVE_QUANTIZE_SCALE))
	var normalized_yaw: float = fposmod(cmd.look_yaw, YAW_RANGE_RADIANS)
	bytes.encode_u16(6, int((normalized_yaw / YAW_RANGE_RADIANS) * YAW_QUANTIZE_SCALE))
	var clamped_pitch: float = clampf(cmd.look_pitch, -PITCH_RANGE_RADIANS, PITCH_RANGE_RADIANS)
	bytes.encode_s16(8, int((clamped_pitch / PITCH_RANGE_RADIANS) * PITCH_QUANTIZE_SCALE))
	bytes.encode_s8(10, cmd.buttons)
	return bytes


static func decode(bytes: PackedByteArray, delta: float) -> InputCommand:
	var cmd := InputCommand.new()
	cmd.tick = bytes.decode_s32(0)
	cmd.move = Vector2(
		bytes.decode_s8(4) / MOVE_QUANTIZE_SCALE, bytes.decode_s8(5) / MOVE_QUANTIZE_SCALE
	)
	cmd.look_yaw = (bytes.decode_u16(6) / YAW_QUANTIZE_SCALE) * YAW_RANGE_RADIANS
	cmd.look_pitch = (bytes.decode_s16(8) / PITCH_QUANTIZE_SCALE) * PITCH_RANGE_RADIANS
	cmd.buttons = bytes.decode_s8(10)
	cmd.delta = delta
	return cmd

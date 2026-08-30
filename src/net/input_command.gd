class_name InputCommand extends RefCounted
## クライアント→サーバーに送信する量子化前の入力データ（第5.2章）。
## サーバーとクライアントは MovementSimulation を通じて必ず同一のこの構造体を消費する。

var tick: int
var move: Vector2
var look_yaw: float
var look_pitch: float
var buttons: int ## ビットフラグ: fire/ads/skill/ult/dash/reload/jump
var delta: float

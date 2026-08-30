extends SceneTree
## Godot API 存在確認スクリプト（第9章 API検証プロトコル）
## 使い方: godot --headless --script tools/verify_api.gd

const CLASSES_TO_CHECK: PackedStringArray = [
	"SkeletonIK3D",
	"SkeletonModifier3D",
	"LookAtModifier3D",
	"MultiplayerSynchronizer",
	"MultiplayerSpawner",
	"SceneMultiplayer",
	"ENetMultiplayerPeer",
	"GPUParticles3D",
	"CompositorEffect",
	"Compositor",
	"NavigationAgent3D",
	"FastNoiseLite",
	"SpringArm3D",
	"Camera3D",
	"PhysicsRayQueryParameters3D",
	"PhysicsDirectSpaceState3D",
	"Curve2D",
]


func _init() -> void:
	print("=== Godot API 存在確認: ", Engine.get_version_info(), " ===")
	for class_name_to_check: String in CLASSES_TO_CHECK:
		var exists: bool = ClassDB.class_exists(class_name_to_check)
		print("%-28s exists=%s" % [class_name_to_check, exists])
		if exists:
			var methods: Array[Dictionary] = ClassDB.class_get_method_list(class_name_to_check, true)
			var method_names: PackedStringArray = []
			for m: Dictionary in methods:
				method_names.append(String(m["name"]))
			print("    methods: ", method_names)
	quit()

extends SceneTree
## KayKit glTF アセットに実際どのアニメーションクリップが含まれているかを実測するための
## 一時検証スクリプト（第9章 API検証プロトコル）。

func _init() -> void:
	for glb_path: String in [
		"res://assets/characters/kaykit_adventurers/Knight.glb",
		"res://assets/characters/kaykit_adventurers/Rogue.glb",
	]:
		print("=== ", glb_path, " ===")
		var packed_scene: PackedScene = load(glb_path)
		var instance: Node = packed_scene.instantiate()
		var anim_players: Array[Node] = instance.find_children("*", "AnimationPlayer", true, false)
		for anim_player: AnimationPlayer in anim_players:
			print("AnimationPlayer path: ", anim_player.get_path())
			for anim_name: StringName in anim_player.get_animation_list():
				print("  - ", anim_name)
		instance.free()
	quit()

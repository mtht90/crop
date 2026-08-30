extends GdUnitTestSuite
## 第8.2章「メモリリークテスト」: ヒーローの生成/破棄を繰り返しても
## `Performance.OBJECT_COUNT` が単調増加しないことを検証する。
## 実運用では戦闘中に instantiate() を行わないためプールを使うが、
## このテストはコンポーネント配線自体（シグナル接続解除漏れ等）に
## リークがないことを保証する目的で HeroBase の生成/破棄を直接繰り返す。

const HERO_BASE_SCENE: PackedScene = preload("res://scenes/hero/hero_base.tscn")
const WARMUP_CYCLES: int = 3
const MEASURED_CYCLES: int = 20


func test_repeated_hero_spawn_despawn_does_not_leak_objects() -> void:
	var hero_data: HeroData = load("res://data/heroes/hero_vanguard.tres")

	# ウォームアップ: 初回ロードに伴うリソースキャッシュの変動を計測対象から除外する。
	_run_cycles(WARMUP_CYCLES, hero_data)
	await get_tree().process_frame
	await get_tree().process_frame

	var baseline_object_count: int = Performance.get_monitor(Performance.OBJECT_COUNT)

	_run_cycles(MEASURED_CYCLES, hero_data)
	await get_tree().process_frame
	await get_tree().process_frame

	var final_object_count: int = Performance.get_monitor(Performance.OBJECT_COUNT)

	assert_int(final_object_count).is_equal(baseline_object_count)


func _run_cycles(cycle_count: int, hero_data: HeroData) -> void:
	for _cycle: int in range(cycle_count):
		var hero: HeroBase = HERO_BASE_SCENE.instantiate() as HeroBase
		hero.hero_data = hero_data
		add_child(hero)
		remove_child(hero)
		hero.free()

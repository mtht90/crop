class_name EntityRegistry extends RefCounted
## エンティティの生成/破棄をサーバー主導で一元管理する（第5.8章）。
## `MultiplayerSpawner` とは併用せず、本レジストリに統一する（ADR-014参照）。
## Interest Management（遠距離/非可視エンティティの更新頻度低下）は Phase 4 時点では
## フックのみ用意し、実装は今後のパフォーマンスチューニングで行う。

var _entities: Dictionary = {} ## int entity_id -> Node
var _next_entity_id: int = 1


func register(node: Node) -> int:
	var entity_id: int = _next_entity_id
	_next_entity_id += 1
	_entities[entity_id] = node
	return entity_id


func unregister(entity_id: int) -> void:
	_entities.erase(entity_id)


func get_entity(entity_id: int) -> Node:
	return _entities.get(entity_id)


func get_all_entity_ids() -> Array[int]:
	var ids: Array[int] = []
	for entity_id: int in _entities.keys():
		ids.append(entity_id)
	return ids


func get_entity_count() -> int:
	return _entities.size()


## Interest Management フック（未実装）。将来的に視聴者の位置から
## 更新頻度を決定するロジックをここに実装する。
func get_update_priority_for(_entity_id: int, _viewer_position: Vector3) -> float:
	return 1.0

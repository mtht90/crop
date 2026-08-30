class_name ObjectPool extends RefCounted
## 汎用オブジェクトプール。戦闘中の instantiate()/new() を禁止するために、
## マズルフラッシュ・薬莢・ダメージ数値・キルフィード行等はこれを介して再利用する。

var _factory: Callable
var _reset_callback: Callable
var _available: Array[Node] = []
var _in_use: Array[Node] = []


func _init(factory: Callable, reset_callback: Callable = Callable()) -> void:
	_factory = factory
	_reset_callback = reset_callback


func prewarm(count: int) -> void:
	for _i: int in range(count):
		_available.append(_factory.call() as Node)


func acquire() -> Node:
	var instance: Node
	if _available.is_empty():
		instance = _factory.call() as Node
	else:
		instance = _available.pop_back() as Node
	_in_use.append(instance)
	return instance


func release(instance: Node) -> void:
	_in_use.erase(instance)
	if _reset_callback.is_valid():
		_reset_callback.call(instance)
	_available.append(instance)


func get_available_count() -> int:
	return _available.size()


func get_in_use_count() -> int:
	return _in_use.size()

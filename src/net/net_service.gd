extends Node
## NetService: ENetMultiplayerPeer による接続管理と RPC ルーティング（Autoload）。
## 本格的な予測/リコンサイル/ラグ補償の実装は Phase 4 で行う。

signal peer_connected_to_server(peer_id: int)
signal peer_disconnected_from_server(peer_id: int)

var _multiplayer_peer: ENetMultiplayerPeer


func start_server(port: int, max_clients: int) -> Result:
	var peer := ENetMultiplayerPeer.new()
	var error_code: Error = peer.create_server(port, max_clients)
	if error_code != OK:
		return Result.err("サーバー起動に失敗しました: error=%d" % error_code)
	_multiplayer_peer = peer
	multiplayer.multiplayer_peer = _multiplayer_peer
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	return Result.ok()


func start_client(address: String, port: int) -> Result:
	var peer := ENetMultiplayerPeer.new()
	var error_code: Error = peer.create_client(address, port)
	if error_code != OK:
		return Result.err("サーバーへの接続に失敗しました: error=%d" % error_code)
	_multiplayer_peer = peer
	multiplayer.multiplayer_peer = _multiplayer_peer
	return Result.ok()


func _on_peer_connected(peer_id: int) -> void:
	peer_connected_to_server.emit(peer_id)


func _on_peer_disconnected(peer_id: int) -> void:
	peer_disconnected_from_server.emit(peer_id)

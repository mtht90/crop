@tool
extends EditorPlugin

## 釘配置エディタ本体。
## 使い方:
##   1. シーンツリーで PegBoard.gd がアタッチされたノード(例: Main.tscn の "Pegs")を選択
##   2. 左Upperドックの「追加モード」をONにし、2Dビューポート上をクリックして釘を配置
##   3. 「削除モード」で最も近い釘をクリック削除
##   4. 「レイアウトを保存」でPegLayoutResource(.tres)として書き出し
##      (通常のシーン保存(Ctrl+S)でも配置結果はMain.tscnに直接残る)

var dock: Control
var add_mode_button: CheckButton
var remove_mode_button: CheckButton
var snap_spin: SpinBox
var status_label: Label

var add_mode: bool = false
var remove_mode: bool = false
var snap_size: float = 8.0

func _enter_tree() -> void:
	dock = _build_dock()
	add_control_to_dock(DOCK_SLOT_LEFT_UR, dock)

func _exit_tree() -> void:
	remove_control_from_docks(dock)
	dock.queue_free()

func _build_dock() -> Control:
	var panel := VBoxContainer.new()
	panel.name = "釘配置エディタ"

	var title := Label.new()
	title.text = "釘配置エディタ (富岳)"
	panel.add_child(title)

	add_mode_button = CheckButton.new()
	add_mode_button.text = "追加モード"
	add_mode_button.toggled.connect(_on_add_mode_toggled)
	panel.add_child(add_mode_button)

	remove_mode_button = CheckButton.new()
	remove_mode_button.text = "削除モード"
	remove_mode_button.toggled.connect(_on_remove_mode_toggled)
	panel.add_child(remove_mode_button)

	var snap_container := HBoxContainer.new()
	var snap_label := Label.new()
	snap_label.text = "グリッドスナップ(px)"
	snap_container.add_child(snap_label)
	snap_spin = SpinBox.new()
	snap_spin.min_value = 1
	snap_spin.max_value = 64
	snap_spin.step = 1
	snap_spin.value = snap_size
	snap_spin.value_changed.connect(func(v: float) -> void: snap_size = v)
	snap_container.add_child(snap_spin)
	panel.add_child(snap_container)

	panel.add_child(HSeparator.new())

	var save_button := Button.new()
	save_button.text = "レイアウトを保存 (.tres)"
	save_button.pressed.connect(_on_save_pressed)
	panel.add_child(save_button)

	var load_button := Button.new()
	load_button.text = "レイアウトを再読込"
	load_button.pressed.connect(_on_load_pressed)
	panel.add_child(load_button)

	var clear_button := Button.new()
	clear_button.text = "全消去"
	clear_button.pressed.connect(_on_clear_pressed)
	panel.add_child(clear_button)

	status_label = Label.new()
	status_label.text = "PegBoardノードを選択してください"
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	panel.add_child(status_label)

	return panel

func _on_add_mode_toggled(pressed: bool) -> void:
	add_mode = pressed
	if pressed and remove_mode:
		remove_mode = false
		remove_mode_button.button_pressed = false

func _on_remove_mode_toggled(pressed: bool) -> void:
	remove_mode = pressed
	if pressed and add_mode:
		add_mode = false
		add_mode_button.button_pressed = false

func _get_selected_peg_board() -> Node:
	var selection := get_editor_interface().get_selection().get_selected_nodes()
	for node in selection:
		if node is Node2D and node.has_method("add_peg"):
			return node
	return null

func _on_save_pressed() -> void:
	var board := _get_selected_peg_board()
	if board == null:
		status_label.text = "PegBoardノードを選択してください"
		return
	board.call("save_layout")
	status_label.text = "保存しました: %s" % board.get("layout_path")

func _on_load_pressed() -> void:
	var board := _get_selected_peg_board()
	if board == null:
		status_label.text = "PegBoardノードを選択してください"
		return
	board.call("load_layout")
	status_label.text = "読込しました: %s" % board.get("layout_path")

func _on_clear_pressed() -> void:
	var board := _get_selected_peg_board()
	if board == null:
		status_label.text = "PegBoardノードを選択してください"
		return
	board.call("clear_pegs")
	status_label.text = "全消去しました"

func _handles(object: Object) -> bool:
	return object is Node2D and object.has_method("add_peg")

func _forward_canvas_gui_input(event: InputEvent) -> bool:
	if not (add_mode or remove_mode):
		return false
	var board := _get_selected_peg_board()
	if board == null:
		return false
	if event is InputEventMouseButton \
			and event.button_index == MOUSE_BUTTON_LEFT \
			and event.pressed:
		# _forward_canvas_gui_inputのevent.positionは2Dエディタのワールド座標系で渡される。
		# PegBoardノードのローカル座標に変換してから釘を追加/削除する。
		var world_pos: Vector2 = event.position
		if snap_size > 0.0:
			world_pos = (world_pos / snap_size).round() * snap_size
		var local_pos: Vector2 = (board as Node2D).to_local(world_pos)
		if add_mode:
			board.call("add_peg", local_pos)
		else:
			board.call("remove_peg_near", local_pos)
		return true
	return false

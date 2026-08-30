extends GdUnitTestSuite
## EntityRegistry の登録/解除を検証する（第5.8章）。


func test_register_assigns_unique_ids_and_unregister_removes_entry() -> void:
	var registry := EntityRegistry.new()
	var node_a := Node.new()
	var node_b := Node.new()
	auto_free(node_a)
	auto_free(node_b)

	var id_a: int = registry.register(node_a)
	var id_b: int = registry.register(node_b)

	assert_int(id_a).is_not_equal(id_b)
	assert_int(registry.get_entity_count()).is_equal(2)
	assert_object(registry.get_entity(id_a)).is_same(node_a)

	registry.unregister(id_a)
	assert_int(registry.get_entity_count()).is_equal(1)
	assert_object(registry.get_entity(id_a)).is_null()

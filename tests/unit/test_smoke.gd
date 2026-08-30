extends GdUnitTestSuite
## Phase 0 の疎通確認用ダミーテスト。
## --headless でのテストランナー起動を検証する目的のみを持つ。

func test_project_boots() -> void:
	assert_int(1 + 1).is_equal(2)

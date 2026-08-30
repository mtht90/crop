extends GdUnitTestSuite
## SettingsService の永続化ラウンドトリップを検証する。


func test_load_without_saved_file_returns_defaults() -> void:
	# 他のテストが保存した user://settings.cfg が残っていないことを保証してから検証する。
	if FileAccess.file_exists(SettingsService.SETTINGS_FILE_PATH):
		DirAccess.remove_absolute(SettingsService.SETTINGS_FILE_PATH)

	var settings: SettingsService.Settings = SettingsService.load_settings()
	assert_float(settings.sensitivity).is_equal(SettingsService.DEFAULT_SENSITIVITY)
	assert_float(settings.fov_degrees).is_equal(SettingsService.DEFAULT_FOV_DEGREES)


func test_save_then_load_round_trips_all_fields() -> void:
	var settings := SettingsService.Settings.new()
	settings.sensitivity = 2.5
	settings.fov_degrees = 100.0
	settings.shake_scale = 0.5
	settings.frame_rate_cap = 144
	settings.colorblind_team_colors = true

	var save_result: Result = SettingsService.save_settings(settings)
	assert_bool(save_result.is_ok()).is_true()

	var loaded_settings: SettingsService.Settings = SettingsService.load_settings()
	assert_float(loaded_settings.sensitivity).is_equal(2.5)
	assert_float(loaded_settings.fov_degrees).is_equal(100.0)
	assert_float(loaded_settings.shake_scale).is_equal(0.5)
	assert_int(loaded_settings.frame_rate_cap).is_equal(144)
	assert_bool(loaded_settings.colorblind_team_colors).is_true()

class_name SettingsService extends RefCounted
## 設定メニューのデータ永続化（第5.5章「設定メニュー」）。Autoload 数上限（5個）を
## 消費しないよう、呼び出し側が `SettingsService.load_settings()` / `save_settings()`
## を直接呼ぶ静的APIとして実装する。実際の設定メニュー UI（Control）は Phase 5 の
## 残作業（レンダリング/UI一式、ADR-013参照）として別途実装する。

const SETTINGS_FILE_PATH: String = "user://settings.cfg"
const SECTION: String = "settings"

const DEFAULT_SENSITIVITY: float = 1.0
const DEFAULT_FOV_DEGREES: float = 90.0
const DEFAULT_SHAKE_SCALE: float = 1.0
const DEFAULT_FRAME_RATE_CAP: int = 0 ## 0 = 無制限


class Settings extends RefCounted:
	var sensitivity: float = DEFAULT_SENSITIVITY
	var fov_degrees: float = DEFAULT_FOV_DEGREES
	var shake_scale: float = DEFAULT_SHAKE_SCALE
	var frame_rate_cap: int = DEFAULT_FRAME_RATE_CAP
	var colorblind_team_colors: bool = false


static func load_settings() -> Settings:
	var settings := Settings.new()
	var config_file := ConfigFile.new()
	var error_code: Error = config_file.load(SETTINGS_FILE_PATH)
	if error_code != OK:
		return settings

	settings.sensitivity = config_file.get_value(SECTION, "sensitivity", DEFAULT_SENSITIVITY)
	settings.fov_degrees = config_file.get_value(SECTION, "fov_degrees", DEFAULT_FOV_DEGREES)
	settings.shake_scale = config_file.get_value(SECTION, "shake_scale", DEFAULT_SHAKE_SCALE)
	settings.frame_rate_cap = config_file.get_value(SECTION, "frame_rate_cap", DEFAULT_FRAME_RATE_CAP)
	settings.colorblind_team_colors = config_file.get_value(SECTION, "colorblind_team_colors", false)
	return settings


static func save_settings(settings: Settings) -> Result:
	var config_file := ConfigFile.new()
	config_file.set_value(SECTION, "sensitivity", settings.sensitivity)
	config_file.set_value(SECTION, "fov_degrees", settings.fov_degrees)
	config_file.set_value(SECTION, "shake_scale", settings.shake_scale)
	config_file.set_value(SECTION, "frame_rate_cap", settings.frame_rate_cap)
	config_file.set_value(SECTION, "colorblind_team_colors", settings.colorblind_team_colors)

	var error_code: Error = config_file.save(SETTINGS_FILE_PATH)
	if error_code != OK:
		return Result.err("設定の保存に失敗しました: error=%d" % error_code)
	return Result.ok()

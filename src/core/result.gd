class_name Result extends RefCounted
## 成功/失敗を明示的に表現する結果型。例外や null 判定による曖昧なエラー処理を避けるために使う。

var _is_ok: bool = false
var _value: Variant = null
var _error_message: String = ""


static func ok(value: Variant = null) -> Result:
	var result := Result.new()
	result._is_ok = true
	result._value = value
	return result


static func err(error_message: String) -> Result:
	var result := Result.new()
	result._is_ok = false
	result._error_message = error_message
	return result


func is_ok() -> bool:
	return _is_ok


func is_err() -> bool:
	return not _is_ok


func unwrap() -> Variant:
	return _value


func error_message() -> String:
	return _error_message

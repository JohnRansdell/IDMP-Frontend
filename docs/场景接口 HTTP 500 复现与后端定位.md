# 场景接口 HTTP 500 复现与后端定位

## 结论

2026-08-12 对 `http://192.168.123.14:8081` 重新测试后确认：符合接口文档格式的场景创建和指标集合请求都返回 HTTP 200。此前记录的两个 500 不是合法业务请求失败，而是 PowerShell 调用原生 `curl.exe` 时内联 JSON 双引号丢失，服务端实际收到了非法 JSON。

后端真实可复现的问题是：请求体 JSON 语法错误时返回 `COMMON-50000 / HTTP 500`。按照接口文档第 1.4 节“HTTP 状态与错误码”，这类客户端请求格式错误应返回 `COMMON-40000 / HTTP 400`。

## 1. 创建场景：合法请求返回 200

对应接口文档：第 5.3 节“创建场景”，`POST /api/v1/scenarios`。

在项目目录执行：

```powershell
curl.exe --silent --show-error --include --max-time 20 `
  --request POST "http://192.168.123.14:8081/api/v1/scenarios" `
  --header "Content-Type: application/json" `
  --header "X-Idempotency-Key: codex-scenario-500-repro-20260812-1620" `
  --data-binary "@test/fixtures/scenario-create-500.json"
```

实测返回：

```text
HTTP/1.1 200
X-Trace-Id: 47cc6640f86341a987bb1e82e11d1d2e
```

响应中的场景 ID 为 `102027642458358279`，首个版本 ID 为 `102027642458358280`。

## 2. 创建场景：非法 JSON 错误返回 500

请求文件 `test/fixtures/scenario-create-malformed.json` 故意省略 JSON 属性名的双引号。执行：

```powershell
curl.exe --silent --show-error --include --max-time 20 `
  --request POST "http://192.168.123.14:8081/api/v1/scenarios" `
  --header "Content-Type: application/json" `
  --header "X-Idempotency-Key: codex-scenario-malformed-20260812-1622" `
  --data-binary "@test/fixtures/scenario-create-malformed.json"
```

实测返回：

```text
HTTP/1.1 500
X-Trace-Id: 38290969389348409da228787ec93f46

{"code":"COMMON-50000","message":"服务内部错误","data":null,"traceId":"38290969389348409da228787ec93f46",...}
```

## 3. 替换场景指标集合：合法请求返回 200

对应接口文档：第 5.8 节“配置场景指标版本”，`PUT /api/v1/scenario-versions/{versionId}/indicators`。

```powershell
curl.exe --silent --show-error --include --max-time 20 `
  --request PUT "http://192.168.123.14:8081/api/v1/scenario-versions/102027642458358280/indicators" `
  --header "Content-Type: application/json" `
  --data-binary "@test/fixtures/scenario-indicators-valid.json"
```

实测返回 HTTP 200，traceId 为 `3dff817a64c344a6b53fadb21523bcdb`，`resourceVersion` 从 0 递增为 1，并成功绑定指标版本 `7720406205279055`。

## 4. 替换场景指标集合：非法 JSON 错误返回 500

```powershell
curl.exe --silent --show-error --include --max-time 20 `
  --request PUT "http://192.168.123.14:8081/api/v1/scenario-versions/102027642458358280/indicators" `
  --header "Content-Type: application/json" `
  --data-binary "@test/fixtures/scenario-indicators-malformed.json"
```

实测返回：

```text
HTTP/1.1 500
X-Trace-Id: 69226fd10f8e4630adeda595764d3b8d

{"code":"COMMON-50000","message":"服务内部错误","data":null,"traceId":"69226fd10f8e4630adeda595764d3b8d",...}
```

## 5. 后端定位建议

两个 500 都发生在 Controller 业务方法执行前的请求体反序列化阶段，优先检查全局异常处理器对以下异常的映射：

- `HttpMessageNotReadableException`
- Jackson `JsonParseException` / `MismatchedInputException`
- 由请求体反序列化包装产生的其他 `HttpMessageConversionException`

建议新增专门异常处理，将其统一映射为 HTTP 400 和 `COMMON-40000`，message 可使用“请求体不是合法 JSON”，同时保留 traceId。不要把解析异常落入兜底 `Exception` 处理器并返回 `COMMON-50000`。

还应补两组 MockMvc/WebTestClient 回归测试：创建场景和替换指标集合各发送一个非法 JSON，请求均断言 HTTP 400；合法请求继续断言 HTTP 200。

## 6. PowerShell 测试注意事项

不要依赖如下形式把变量中的 JSON 直接传给 Windows 原生 curl：

```powershell
$body = '{"code":"..."}'
curl.exe ... --data-raw $body
```

不同 PowerShell/native argument passing 配置可能改变引号。联调时应使用 UTF-8 文件与 `--data-binary "@文件"`，或者使用能够明确保持请求体字节的 HTTP 客户端，并在需要时通过 `curl --trace-ascii` 核对实际上行内容。

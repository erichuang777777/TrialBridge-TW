# WebMCP 開發規範與除錯指南

版本：2026-09-04  
適用範圍：Chrome WebMCP Origin Trial／本機測試、Declarative API、Imperative API、瀏覽器 Agent、Model Context Tool Inspector

> WebMCP 仍是實驗中規格。實作前應重新核對 Chrome 官方文件與 WebMCP Community Group Draft。本文件不把專案自訂欄位、polyfill 或 Inspector 顯示文字當成正式標準。

## 1. 核心原則

| 項目 | 規範 |
|---|---|
| 正式入口 | 使用 `document.modelContext`。不要把 `window.ai`、`navigator.webmcp` 或自訂 alias 宣稱為正式 WebMCP API。 |
| 頁面作用域 | WebMCP tool 只在目前開啟的頁面／frame tree 內存在。Landing page 若是評審入口，就必須在 landing page 本身註冊需要展示的工具。 |
| Progressive enhancement | 沒有 WebMCP 時，網站仍須能以一般表單、按鈕和 API 正常使用。 |
| 可見性 | Declarative tool 應對應可見、可操作的真實表單，不建立只給 Agent 使用的隱藏副本。 |
| 最小權限 | 搜尋、讀取等工具標示 `readOnlyHint`；任何會改變狀態的工具保留明確使用者確認。 |
| 同源優先 | 預設只暴露同源工具。跨來源 frame/tool 必須同時設定 WebMCP origin 授權，不是只加 CORS。 |
| 回傳邊界 | 回傳短、結構化、可追溯資料；第三方文字標示為不受信任內容；不要回傳秘密或未確認的個資。 |
| 錯誤契約 | Tool 不應丟出 HTML error page 給 Agent。API 錯誤一律回 JSON，包含穩定 `code`、人類可讀 `message`、`retryable`。 |

## 2. 環境與部署要求

1. Production 必須使用 HTTPS 與 exact origin。
2. 依 Chrome 官方目前說明，Origin Trial 從 Chrome 149 開始；本機可啟用 `chrome://flags/#enable-webmcp-testing` 後重新啟動。
3. Origin Trial token 必須由 server-rendered `<meta http-equiv="origin-trial">` 或等效正式交付方式提供。
4. 頁面不得送出 `Permissions-Policy: tools=()`；同源建議使用：

```http
Permissions-Policy: tools=(self)
```

5. 跨來源 iframe 必須明確授權：

```html
<iframe src="https://trusted-agent.example" allow="tools"></iframe>
```

6. Chrome extension 型 Agent 還需要該 extension 自己具有頁面的 `host_permissions`。

## 3. Declarative WebMCP 規範

### 3.1 正確範例

```html
<form
  action="/api/trials/search"
  method="post"
  toolname="search_public_trials"
  tooldescription="Search public clinical-trial records by a general condition."
  toolautosubmit>
  <label for="condition">Condition</label>
  <input
    id="condition"
    name="condition"
    type="search"
    required
    minlength="2"
    maxlength="120"
    toolparamdescription="A general disease or cancer type without personal data.">
  <button type="submit">Search</button>
</form>
```

必要條件：

- `<form>` 同時具有 `toolname` 和 `tooldescription`。
- 每個要成為參數的 control 都有唯一 `name`。
- required control 必須有 `name`。
- control 有可對應的 `<label>`；建議再加 `toolparamdescription`。
- submit button 明確設定 `type="submit"`。
- 若允許 Agent 自動送出才加 `toolautosubmit`；否則由使用者檢查後手動送出。
- `action` 指向真正接受該 `method` 的 endpoint，避免 Inspector 探測錯誤頁面。

### 3.2 JavaScript 接管與 `respondWith()`

```js
const form = document.querySelector("#trial-search");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const result = runSearch(new FormData(form));
  if (event.agentInvoked) {
    event.respondWith(result);
  }
});
```

規則：

- 使用 `respondWith()` 前先呼叫 `preventDefault()`。
- 傳給 `respondWith()` 的 Promise 必須 resolve 成可序列化結果。
- 驗證失敗也要 resolve/reject 成清楚且有限的錯誤，不要讓 Promise 永遠 pending。
- 監聽 `toolactivated` 與 `toolcancel`，讓人類看得到 Agent 正在操作或已取消。

### 3.3 錯誤範例

```html
<!-- 錯：缺少 tooldescription，工具不會註冊 -->
<form toolname="search_trials">
```

```html
<!-- 錯：required input 沒有 name，無法合成 schema -->
<input id="condition" required>
```

```html
<!-- 錯：toolaction、toollocation 不是目前官方 Declarative API attribute -->
<form toolname="search_trials"
      tooldescription="Search trials"
      toolaction="search"
      toollocation="/trials">
```

```html
<!-- 錯：沒有 action 時，工具可能把目前頁面當送出目標；POST /trials 可能得到 405 -->
<form method="post" toolname="search_trials" tooldescription="Search trials">
```

```js
// 錯：preventDefault 後沒有 respondWith，Agent 可能等待到逾時
form.addEventListener("submit", (event) => {
  event.preventDefault();
  fetch("/api/search");
});
```

## 4. Imperative WebMCP 規範

### 4.1 正確範例

```js
if (document.modelContext) {
  const controller = new AbortController();

  await document.modelContext.registerTool({
    name: "search_public_trials",
    description: "Search public trial records for a general condition.",
    inputSchema: {
      type: "object",
      properties: {
        condition: {
          type: "string",
          minLength: 2,
          maxLength: 120,
          description: "General condition without identifying information."
        }
      },
      required: ["condition"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true
    },
    async execute(input, options) {
      const response = await fetch("/api/trials/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: options?.signal
      });

      if (!response.ok) {
        throw new Error(`SEARCH_HTTP_${response.status}`);
      }
      return response.json();
    }
  }, {
    signal: controller.signal
  });

  // Component/page cleanup:
  // controller.abort();
}
```

### 4.2 Discovery 與手動執行

```js
const tools = await document.modelContext.getTools();
const tool = tools.find((item) => item.name === "search_public_trials");

if (!tool) throw new Error("TOOL_NOT_FOUND");

const result = await document.modelContext.executeTool(
  tool,
  JSON.stringify({ condition: "breast cancer" })
);
```

同源工具直接使用 `getTools()`；只有跨來源 frame 才使用 `exposedTo` 和 `getTools({ fromOrigins: [...] })`。Chrome 版本間的 `executeTool()` input 型態曾有變動；以當下 Chrome 官方文件與型別為準，不要只靠 polyfill 行為判定 conformance。

### 4.3 錯誤範例

```js
// 錯：未檢查 API 是否存在
document.modelContext.registerTool(tool);
```

```js
// 錯：同一個頁面重複註冊同名工具
await document.modelContext.registerTool({ name: "search", /* ... */ });
await document.modelContext.registerTool({ name: "search", /* ... */ });
```

```js
// 錯：schema 過度寬鬆，Agent 可送入未定義欄位
inputSchema: { type: "object" }
```

```js
// 錯：元件卸載後沒有取消註冊生命週期
await document.modelContext.registerTool(tool);
```

## 5. CORS 與 OPTIONS 規範

WebMCP 本身在同源頁面執行時不需要額外 CORS。只有 Agent、extension、iframe 或 API client 從另一個 origin 使用 `fetch()` 時，才進入 CORS 規則。

### 5.1 正確 preflight response

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: chrome-extension://trusted-extension-id
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 600
Vary: Origin
```

實際 POST response 也必須帶相容的 `Access-Control-Allow-Origin`；只修 OPTIONS 不夠。

若 API 完全公開且不使用 cookie/auth credential，可改用：

```http
Access-Control-Allow-Origin: *
```

此時不要搭配 credentialed fetch。

### 5.2 Next.js route 範例

```ts
const cors = (request: Request) => {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    ...(origin ? { "Access-Control-Allow-Credentials": "true" } : {})
  };
};

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}
```

### 5.3 錯誤範例

```http
# 錯：credentialed request 不可使用 wildcard origin
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

```http
# 錯：request 要 Content-Type，但 response 沒允許
Access-Control-Allow-Headers: Authorization
```

```text
# 錯：OPTIONS /api/search 被 rewrite 到 HTML page 或登入頁
OPTIONS /api/search -> 301/302 -> /login
```

```text
# 錯：只讓 POST route 存在
OPTIONS /api/search -> 405 Method Not Allowed
```

## 6. 錯誤代碼與解釋

### 6.1 WebMCP／DOMException

| 錯誤 | 常見原因 | 修正 |
|---|---|---|
| `InvalidStateError` | Document 非 fully active、重複工具名稱、名稱或 description 無效。 | 等頁面 active 後註冊；確保 tool name 唯一、非空、符合當前規格字元與長度限制。 |
| `NotAllowedError` | `Permissions-Policy` 禁止 `tools`，或 iframe 沒有 `allow="tools"`。 | 檢查 response header 與 iframe allow policy。 |
| `SecurityError` | 不安全／不可信 origin、錯誤的 cross-origin exposure 或 agent cluster 狀態。 | 使用 HTTPS；驗證 `exposedTo` 只含合法、安全、明確 origin。 |
| `NotSupportedError` | 目標 origin 無效或 opaque origin。 | 不在 `data:`、sandboxed opaque frame 等環境使用；改用可序列化 HTTPS origin。 |
| `TypeError` | Schema/input 無法 JSON serialization、傳入型別不符。 | 確保 schema 與 input 是 JSON-safe；移除 function、symbol、循環引用。 |
| `AbortError` 或自訂 abort reason | 使用者、Agent、頁面 navigation 或 cleanup 取消執行。 | 將 `AbortSignal` 傳到所有下游 fetch；把取消與真正失敗分開呈現。 |

### 6.2 HTTP 狀態碼

| HTTP | 意義 | WebMCP 常見原因 | 修正 |
|---:|---|---|---|
| 200 | 成功 | Tool/API 正常回 JSON。 | 驗證 `Content-Type: application/json` 與輸出 schema。 |
| 204 | 成功但無 body | OPTIONS preflight 正常。 | 保留必要 CORS headers。 |
| 400 | Bad Request | JSON/form 格式錯誤或缺欄位。 | 回傳欄位級錯誤；Agent 不應盲目重試相同 input。 |
| 401 | Unauthorized | 缺少或失效 credential。 | 重新登入／換 token；不要把 secret 放進 tool output。 |
| 403 | Forbidden | origin、權限、CSRF 或政策拒絕。 | 檢查 allowlist、Permissions Policy、使用者同意狀態。 |
| 404 | Not Found | form `action`、API URL、rewrite 或 deploy route 錯誤。 | 對照 Network 的 exact Request URL；不要只看頁面網址。 |
| 405 | Method Not Allowed | OPTIONS/GET/POST 沒有對應 handler；form 提交到頁面本身。 | 在 exact endpoint 實作 OPTIONS；確保 `action` 與 `method` 正確；檢查 redirect/rewrite。 |
| 408 | Request Timeout | server/client timeout。 | 縮小查詢、加 AbortSignal、回可重試錯誤。 |
| 409 | Conflict | 重複操作或狀態版本衝突。 | 重新讀取狀態後再執行，避免無條件重試。 |
| 413 | Payload Too Large | tool input/output 過大。 | 限制 input 長度、分頁、摘要輸出。 |
| 415 | Unsupported Media Type | endpoint 只收 JSON，但 form 送 urlencoded。 | 同時支援 JSON/form，或統一正確 `Content-Type`。 |
| 422 | Unprocessable Content | JSON 合法但不符合 schema/業務規則。 | 回傳穩定欄位錯誤與允許範圍。 |
| 429 | Too Many Requests | rate limit。 | 回 `Retry-After`；Agent 應等待，不立即連續重試。 |
| 500 | Internal Server Error | 未處理 exception。 | server log 使用 request ID；對 Agent 回安全、無 stack trace 的 JSON。 |
| 502 | Bad Gateway | upstream/proxy 無效 response。 | 檢查 Netlify、資料庫、模型或 registry upstream。 |
| 503 | Service Unavailable | 服務未 ready、資料來源全失敗。 | 加 health/readiness；標示 `retryable: true` 與 backoff。 |
| 504 | Gateway Timeout | serverless function 超過平台時間。 | 使用索引、縮小 page size、避免 request-time 全量同步。 |

建議統一錯誤格式：

```json
{
  "error": {
    "code": "SEARCH_TIMEOUT",
    "message": "The public trial index did not respond in time.",
    "retryable": true,
    "requestId": "req_..."
  }
}
```

### 6.3 常見 CORS 訊息

| 瀏覽器訊息 | 原因 | 修正 |
|---|---|---|
| `CORS preflight channel did not succeed` | OPTIONS 網路失敗、redirect、TLS 或非 2xx。 | 在 Network 面板點 OPTIONS，看 exact URL/status；禁止 preflight redirect。 |
| `No 'Access-Control-Allow-Origin' header` | OPTIONS 或實際 response 缺 header。 | 兩種 response 都加相容 origin header。 |
| `does not match` | response origin 與 request `Origin` 不同。 | 用 allowlist 比對後回顯 exact origin，並加 `Vary: Origin`。 |
| `Credential is not supported ... '*'` | credentials 搭配 wildcard。 | 回明確 origin + `Access-Control-Allow-Credentials: true`，或移除 credentials。 |
| `Did not find method` | `Access-Control-Allow-Methods` 沒有實際 method。 | 加入 `POST`/`GET` 等實際 method。 |
| `missing token ... Allow-Headers` | custom/request header 未被允許。 | 把 `Access-Control-Request-Headers` 中需要的 header 明確列入。 |
| `Multiple ... Allow-Origin` | proxy 與 app 重複產生兩個 origin header。 | 只保留一層 CORS owner，或以單值覆寫。 |

## 7. Inspector 診斷指南

依順序執行，不要一次更改多項：

1. 確認 Chrome 版本、flag／Origin Trial、重新啟動狀態。
2. Console：

```js
typeof document.modelContext
```

應為 `"object"`。若是 `"undefined"`，先處理瀏覽器、Origin Trial、secure context 或 Permissions Policy，不要先改 API CORS。

3. Imperative discovery：

```js
(await document.modelContext.getTools()).map(({ name, origin }) => ({ name, origin }))
```

4. Declarative DOM：

```js
[...document.querySelectorAll("form[toolname][tooldescription]")].map((form) => ({
  name: form.getAttribute("toolname"),
  action: form.action,
  method: form.method,
  controls: [...form.elements].filter((el) => el.name).map((el) => el.name)
}))
```

5. 若顯示 `no element found`：
   - 確認 form 存在於目前頁面，不是在另一個 route。
   - 確認不是 hydration 後短暫插入又移除。
   - 確認 `toolname` 與 `tooldescription` 同時存在。
   - 確認 required control 有 `name`。
   - 確認 form 可見且 submit button 可用。
6. 若顯示 405：在 Network 找到那筆 OPTIONS 的 exact Request URL。405 在 `/trials` 與 405 在 `/api/trials/search` 是不同問題。
7. 清除 Inspector 舊 session/cache，完整 reload 後重新 discovery。
8. 最後才跑 natural-language prompt，保存 prompt → selected tool → arguments → result 的完整證據。

## 8. Preflight 驗證命令

```bash
curl -i -X OPTIONS 'https://example.com/api/trials/search' \
  -H 'Origin: chrome-extension://extension-id' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

預期：HTTP 200 或 204，沒有 redirect，並包含相容的 allow origin/method/header。

PowerShell：

```powershell
Invoke-WebRequest `
  -Uri 'https://example.com/api/trials/search' `
  -Method Options `
  -Headers @{
    Origin = 'chrome-extension://extension-id'
    'Access-Control-Request-Method' = 'POST'
    'Access-Control-Request-Headers' = 'content-type'
  }
```

## 9. Release 驗收清單

- [ ] Production HTTPS exact origin 可開啟。
- [ ] `typeof document.modelContext === "object"`。
- [ ] 根 landing page 可發現 demo 所需 tools。
- [ ] Declarative forms 有標準 attributes、有效 `action`/`method`、具名 controls、submit button。
- [ ] Imperative tools 名稱唯一、schema 嚴格、輸出有界。
- [ ] `getTools()` 顯示預期數量與名稱。
- [ ] `executeTool()` 成功，取消時 AbortSignal 可到達下游。
- [ ] OPTIONS 與實際 response 都通過 CORS 測試。
- [ ] JSON POST 與實際 HTML form encoding 均按設計處理。
- [ ] 400/405/415/429/500/503/504 都回 JSON，不回 HTML。
- [ ] Inspector natural-language tool selection 成功。
- [ ] 無權限時敏感工具不可見；權限變更觸發 tool lifecycle 更新。
- [ ] 不把實驗性／相容 alias 宣稱為正式標準。
- [ ] Demo video 保存 Website → Browser → Agent → Tool → Result 證據鏈。

## 11. 專案實戰歸納（TrialBridge TW，2026-09-03 至 09-04）

以下是把本規範套到真實部署後，實際踩到並修掉的問題。每一條都對應一次紅燈或一次「工具不見了」。

### 11.1 工具數量：少而精，每一個都要有 gate 與理由

- 公開工具維持兩個（`trialbridge_method`、`search_public_cancer_trials`）。評審在 quickstart 只看到兩個是刻意的能力分層，不是功能不足。
- 需要「深入」時加參數或加一個工具，不要為了數量加 `filter_by_*`、`list_*` 這類拆分工具；模型選錯率會跟著上升，selection eval 會掉。
- 唯一會改變頁面狀態的工具（`organize_deidentified_summary`）必須：`readOnlyHint: false`、只在可見開關開啟時註冊、沒有 profile 時才存在、整理一開始就消失。誠實標示比「全部 read-only」的漂亮數字重要。
- 接受醫療文字的工具，識別碼（email、電話、身分證、病歷號、標示的姓名、生日、地址）在進頁面前就拒收並回報種類，不要默默遮蔽。回傳只給計數，不回顯原文。

### 11.2 Origin Trial 與「工具不見了」

- Origin Trial token 綁定精確 origin。Netlify Deploy Preview（`deploy-preview-N--site.netlify.app`）不在 token 範圍內，`document.modelContext` 會是 `undefined`，所有工具都不會出現。要在 preview 測，只能開 `chrome://flags/#enable-webmcp-testing`。
- Console 出現 `Origin trial controlled feature not enabled: 'tools'`，代表 token 被 Chrome 拒絕或過期，不是程式碼問題。
- 兩個版本號不要混用：本機 flag 從 Chrome 146 可用；Origin Trial 從 Chrome 149 開始。程式碼、測試、`/.well-known` 文件要引用同一個常數，否則測試與實作會各自改成不同數字而讓 CI 轉紅。
- 頁面可以自我診斷：`meta[http-equiv="origin-trial"]` 是否存在，加上 `document.featurePolicy.features()` 是否列出 `tools`，就能區分「token 生效」「token 有送但被拒」「只靠本機 flag」「都沒有」。把它放在 quickstart 上，評審不用開 DevTools。

### 11.3 同源註冊

- 同源工具用 `registerTool(tool, { signal })` 與 `getTools()` 即可；`exposedTo` 與 `fromOrigins` 留給跨來源 frame。
- 改了註冊方式，驗證腳本的 marker 也要同步改，否則 CI 會在 `verify:webmcp` 失敗而不是在測試失敗，較難一眼看出。

### 11.4 Declarative form

- `toolname` 與 `tooldescription` 要同時存在；不要發明 `toolaction`、`toollocation` 這類非標準屬性，瀏覽器會忽略。
- 病歷這種需要人審的表單不要加 `toolautosubmit`；Agent 填入，人按送出，送出鍵本身就是 gate。
- React controlled textarea 被 Agent 直接寫入 DOM 時，React state 不一定同步。送出時用 `new FormData(form)` 讀實際值，再回填 state。
- `respondWith()` 要回傳有限、可序列化的結果；整理若超過等待預算，回 `organizing` 讓 Agent 停止等待，而不是讓 Promise 懸著。

### 11.5 Imperative execute 的輸入型態

- Chrome 目前的 Origin Trial 可能把 `executeTool` 的 input 當 JSON 字串送進來，draft API 則是物件。`execute` 開頭先正規化：`typeof input === "string" ? JSON.parse(input) : input`。
- 執行時把 `options.signal` 一路傳到 `fetch`、route、matching、registry adapter；取消與失敗要分開呈現。

### 11.6 Serverless 時間預算（504 的真正原因）

- Netlify 同步函式 10 秒上限，超過就是不透明的 504，前端拿不到 JSON。縮小結果數只減少傳輸量，不會限制時間。
- 正解是整段搜尋共用一個 deadline（`TRIAL_SEARCH_DEADLINE_MS=7000`）：索引查詢逾時就回 `SOURCE_TIMEOUT` 的 JSON，剩餘預算不足就不啟動 live fallback，`/api/data-health` 標記 `index_timeout`。
- 遠端 libSQL 用兩階段查詢：先抓識別欄位的排序視窗（最多 200 列），再只抓能進頁面的 `payload_json`。召回率回來了，傳輸量仍有上限。
- 部署後看 `sources[].durationMs`；索引常超過 4 秒就先降 `pageSize`，不要調高 deadline。

### 11.7 CORS 與探測

- `Access-Control-Allow-Origin: *` 只適合完全公開、不帶 credential 的 API，且不要搭配 `Vary: Origin`。需要 credential 就回顯 allowlist 內的精確 origin。
- 每個 API route 都要有 `OPTIONS` handler，否則 Inspector 探測會拿到 405。
- 405 在 `/trials` 與 405 在 `/api/trials/search` 是兩件事；先看 Network 的 exact Request URL。

### 11.8 驗證與證據

- 把契約集中在一個來源（`toolContractCore.ts`），catalog、capability states、agent guide、`contracts.json`、`evidence.json` 全部由它衍生；加一個工具要同步更新的計數才不會散落各處。
- 錄製過的證據（Inspector 3/6、Lighthouse 2/2、selection baseline 55/55）不要為了新工具改數字；新工具另開章節，舊證據標明日期。
- 每次改 WebMCP 相關程式碼都跑 `npm test`、`npm run typecheck`、`npm run verify:webmcp`、`npm run build`；本機綠、CI 紅時先看是不是 `npm audit` 的 registry 503 這類外部服務問題，再決定重跑或修。

### 11.9 直接推 main 的代價

- 本專案兩次 main 轉紅都來自直接 push：一次是測試改了常數但實作沒改，一次是註冊方式改了但驗證 marker 沒改。走 PR 讓 CI 先跑一次，成本只有幾分鐘。

## 10. 官方參考資料

- [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome WebMCP Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome Lighthouse WebMCP schema validity](https://developer.chrome.com/docs/lighthouse/agentic-browsing/webmcp-schema-validity)
- [WebMCP Community Group Draft](https://webmachinelearning.github.io/webmcp/)
- [WebMCP source and declarative explainer](https://github.com/webmachinelearning/webmcp)
- [MDN CORS guide](https://developer.mozilla.org/docs/Web/HTTP/Guides/CORS)
- [MDN CORS errors](https://developer.mozilla.org/docs/Web/HTTP/CORS/Errors)

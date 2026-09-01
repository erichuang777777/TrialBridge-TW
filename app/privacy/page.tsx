import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="document-page" id="main-content" tabIndex={-1}>
      <Link className="back-link" href="/">← 回到首頁</Link>
      <p className="eyebrow">隱私原則</p>
      <h1>醫療資料不是一般聊天內容。</h1>
      <ul className="document-list">
        <li>可匿名使用，不強制建立帳號。</li>
        <li>直接識別資料先在瀏覽器遮蔽。</li>
        <li>原始自由文字預設只存在當次頁面記憶體，不寫入 localStorage 或伺服器日誌。</li>
        <li>雲端模型只能接收經您確認且去識別的結構化摘要。</li>
        <li>WebMCP 不能讀取原始病歷，只能使用經確認、最小化的欄位。</li>
        <li>任何對外聯絡內容只建立草稿，不會自動寄送。</li>
      </ul>
      <p className="notice">正式上線前仍需完成法規、資安、臨床治理與事件通報流程審查。</p>
    </main>
  );
}

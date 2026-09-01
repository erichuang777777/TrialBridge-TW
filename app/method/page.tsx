import Link from "next/link";

export default function MethodPage() {
  return (
    <main className="document-page" id="main-content" tabIndex={-1}>
      <Link className="back-link" href="/">← 回到首頁</Link>
      <p className="eyebrow">如何運作</p>
      <h1>由人確認的三段式流程</h1>
      <ol className="document-list">
        <li><strong>本機整理：</strong>瀏覽器先遮蔽直接識別資料，再由 localhost Ollama 產生結構化草稿。</li>
        <li><strong>本人確認：</strong>病人或家屬逐項修正並確認；未確認資料不能進入配對或 WebMCP。</li>
        <li><strong>分區搜尋：</strong>依台灣、亞洲、全球順序檢索，呈現登錄來源、更新時間、未知條件與下一步問題。</li>
      </ol>
      <p className="notice">臨床試驗登錄描述的是研究計畫，不是療效證明。最終資格必須由試驗團隊判定。</p>
    </main>
  );
}

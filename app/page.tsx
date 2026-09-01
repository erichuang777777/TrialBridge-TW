import Link from "next/link";
import { BrandMark } from "./components/BrandMark";
import { TrialBridgeChat } from "./components/TrialBridgeChat";

const regions = [
  { step: "01", title: "台灣優先", detail: "先整理台灣試驗與可聯絡院所。" },
  { step: "02", title: "延伸亞洲", detail: "若需要，再評估亞洲其他地區。" },
  { step: "03", title: "查看全球", detail: "最後才擴展至全球公開登錄資料。" },
];

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="TrialBridge TW 試驗橋首頁">
          <BrandMark />
          <span>
            <strong>TrialBridge TW</strong>
            <small>試驗橋</small>
          </span>
        </Link>
        <nav aria-label="主要導覽">
          <Link href="/method">如何運作</Link>
          <Link href="/privacy">隱私原則</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">癌症臨床試驗資訊導航</p>
          <h1 id="hero-title">把複雜的試驗資訊，變成下一次就醫可以討論的問題。</h1>
          <p className="lead">
            用中文或英文描述病況。我們先在裝置上遮蔽識別資料、整理成摘要，經您逐項確認後，才開始尋找台灣、亞洲與全球試驗。
          </p>
          <div className="trust-row" aria-label="隱私與安全承諾">
            <span>免註冊</span>
            <span>原文預設不保存</span>
            <span>確認後才配對</span>
          </div>
          <a className="primary-action action-link" href="#private-chat">開始私密對話</a>
        </div>

        <aside className="route-card" aria-label="試驗搜尋順序">
          <p className="eyebrow">搜尋順序</p>
          <ol>
            {regions.map((region) => (
              <li key={region.step}>
                <span>{region.step}</span>
                <div>
                  <strong>{region.title}</strong>
                  <p>{region.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <TrialBridgeChat />

      <section className="principles" aria-labelledby="principles-title">
        <div>
          <p className="eyebrow">由您掌握</p>
          <h2 id="principles-title">先理解，再確認，最後才搜尋。</h2>
        </div>
        <div className="principle-grid">
          <article>
            <span>1</span>
            <h3>說明現況</h3>
            <p>病人或家屬都可以用自然語言開始，不必先理解臨床術語。</p>
          </article>
          <article>
            <span>2</span>
            <h3>確認摘要</h3>
            <p>系統只提出可修改的草稿，不把模型推測當成您的醫療事實。</p>
          </article>
          <article>
            <span>3</span>
            <h3>帶回醫療團隊</h3>
            <p>結果呈現資料來源、待確認問題與聯絡草稿，不宣稱符合資格或治療有效。</p>
          </article>
        </div>
      </section>

      <footer>
        <p>TrialBridge TW 提供資訊整理與就醫討論支援，不提供醫療建議，也不替代試驗團隊的資格審查。</p>
      </footer>
    </main>
  );
}

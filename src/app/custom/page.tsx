import Link from "next/link";

export default function CustomPage() {
	return (
		<main className="min-h-screen bg-slate-50 text-slate-900">
			<div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
				<header className="space-y-2">
					<p className="text-xs font-semibold uppercase text-indigo-600">Legacy CSV UI</p>
					<h1 className="text-2xl font-bold">此頁已改為說明文件</h1>
					<p className="text-sm text-slate-600">
						原本的 CSV 上傳介面已下線。請改用 API 串接批次資料（站內查詢、單頁查詢、AI 生成）。
					</p>
				</header>

				<section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-3 text-sm text-slate-700">
					<p>常用流程：</p>
					<ol className="list-decimal space-y-1 pl-5">
						<li>使用 <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/search/list</code> 取得站內 URL 清單。</li>
						<li>對特定頁面使用 <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/search/by-url</code> 抽取表現與關鍵字。</li>
						<li>將回應餵給 <code className="rounded bg-slate-100 px-1 py-0.5">/api/optimize/analyze</code>、<code className="rounded bg-slate-100 px-1 py-0.5">/api/metatag</code>、<code className="rounded bg-slate-100 px-1 py-0.5">/api/report/outline</code> 等 AI 端點產生建議。</li>
						<li>必要時自行把結果匯出 TSV/CSV；此專案不再提供前端匯出 UI。</li>
					</ol>
				</section>

				<div>
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
					>
						回到 API 指南
					</Link>
				</div>
			</div>
		</main>
	);
}

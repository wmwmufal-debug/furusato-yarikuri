// ふるさと納税 やりくり帳 — 楽天商品ページの中継サーバー（Cloudflare Workers 用）
// ブラウザからは楽天のページを直接読めない（CORS制限）ため、このWorkerが代わりに取得して返す。
// 楽天の商品ページ（item.rakuten.co.jp）と短縮URL（a.r10.to）以外は取得しない。

// 公開したツールのURL（オリジン）。ここ以外のサイトからは使えないようにする。
// 例: "https://wmwmufal-debug.github.io"   空配列なら制限なし
const ALLOWED_ORIGINS = [
  "https://wmwmufal-debug.github.io",
];

const ALLOWED_HOSTS = ["item.rakuten.co.jp", "a.r10.to", "r10.to", "hb.afl.rakuten.co.jp"];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.length === 0 ? "*" : (okOrigin ? origin : ALLOWED_ORIGINS[0]),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Expose-Headers": "X-Final-Url",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!okOrigin) return new Response("origin not allowed", { status: 403, headers: cors });

    const target = new URL(request.url).searchParams.get("url");
    let u;
    try { u = new URL(target); } catch { return new Response("url parameter is required", { status: 400, headers: cors }); }
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname)) {
      return new Response("only Rakuten item URLs are allowed", { status: 400, headers: cors });
    }

    const res = await fetch(u.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        "Accept-Language": "ja-JP,ja;q=0.9",
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    const finalUrl = new URL(res.url);
    if (finalUrl.hostname !== "item.rakuten.co.jp") {
      return new Response("not a Rakuten item page", { status: 400, headers: cors });
    }
    if (!res.ok) return new Response("upstream error " + res.status, { status: 502, headers: cors });

    return new Response(res.body, {
      headers: {
        ...cors,
        "Content-Type": res.headers.get("Content-Type") || "text/html; charset=EUC-JP",
        "X-Final-Url": finalUrl.toString(),
        "Cache-Control": "public, max-age=600",
      },
    });
  },
};

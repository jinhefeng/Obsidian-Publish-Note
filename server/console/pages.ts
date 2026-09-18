export function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function page(title: string, body: string, options: { session?: boolean } = {}): string {
  const nav = options.session ? `<nav><a href="/account/usage">Usage</a> · <a href="/account/tokens">Tokens</a> · <a href="/account/sites">Sites</a><form method="post" action="/logout" style="display:inline"><button>Log out</button></form></nav>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · One-Click Publish</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.5;color:#202124}label{display:block;margin:14px 0 4px}input{width:100%;max-width:420px;padding:9px;border:1px solid #bbb;border-radius:6px}button{margin-top:16px;padding:9px 14px;border:0;border-radius:6px;background:#5b4bdb;color:white;cursor:pointer}nav{margin-bottom:28px}nav form button{background:none;color:#5b4bdb;padding:0;margin:0}code{background:#f1f1f1;padding:3px 5px;border-radius:4px;word-break:break-all}.card{border:1px solid #ddd;border-radius:8px;padding:18px;margin:16px 0}.warning{background:#fff4d6;padding:12px;border-radius:6px}</style></head><body>${nav}${body}</body></html>`;
}

export function formField(name: string, label: string, type = "text", required = true): string {
  return `<label for="${escapeHtml(name)}">${escapeHtml(label)}</label><input id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}"${required ? " required" : ""}>`;
}

export function recoveryPage(recoveryCode: string, next = "/login"): string {
  return page("Save your recovery code", `<h1>Save your recovery code</h1><p>This code is shown once. Store it somewhere safe before continuing.</p><p class="warning"><code>${escapeHtml(recoveryCode)}</code></p><p><a href="${escapeHtml(next)}">Continue</a></p>`);
}

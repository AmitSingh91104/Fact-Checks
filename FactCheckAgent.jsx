import { useState, useRef } from "react";

const COLORS = {
  navy: "#0B1F4B",
  teal: "#0E9F8E",
  gold: "#F59E0B",
  green: "#059669",
  amber: "#D97706",
  red: "#DC2626",
  bgGreen: "#D1FAE5",
  bgAmber: "#FEF3C7",
  bgRed: "#FEE2E2",
};

const BADGE = {
  Verified:   { bg: COLORS.green, icon: "✅", barBg: "#D1FAE5", border: "#059669" },
  Inaccurate: { bg: COLORS.amber, icon: "⚠️", barBg: "#FEF3C7", border: "#D97706" },
  False:      { bg: COLORS.red,   icon: "❌", barBg: "#FEE2E2", border: "#DC2626" },
};

async function callClaude(messages, tools) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages,
  };
  if (tools) body.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function getText(data) {
  return (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join(" ");
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function extractText(file) {
  // Basic PDF text extraction via FileReader → send raw bytes encoded as base64 to Claude
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(",")[1];
        const data = await callClaude([
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "Extract and return ALL text content from this PDF document. Return only the raw text, nothing else." }
            ]
          }
        ]);
        resolve(getText(data));
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractClaims(text, maxClaims) {
  const prompt = `You are a fact-checking assistant. Extract exactly ${maxClaims} specific, verifiable claims from the text below.

Focus ONLY on:
- Statistics and numerical figures (e.g. "X% of users...", "$Y billion market...")
- Dates and timelines
- Technical/financial facts that can be independently verified

Return a JSON array. Each item:
- "claim": the exact claim as stated (1-2 sentences)
- "type": "statistic" | "date" | "financial" | "technical"
- "search_query": best web search query to verify this

Return ONLY valid JSON array. No markdown, no explanation.

Text:
${text.slice(0, 8000)}`;

  const data = await callClaude([{ role: "user", content: prompt }]);
  return parseJSON(getText(data));
}

async function verifyClaim(claim, searchQuery) {
  const prompt = `You are a fact-checker with web search access. Verify this claim using live web search.

Claim: "${claim}"
Search hint: ${searchQuery}

Search the web, then return a JSON object:
- "verdict": "Verified" | "Inaccurate" | "False"
  - Verified = matches current evidence
  - Inaccurate = outdated or partially wrong
  - False = clearly wrong or contradicted
- "explanation": 2-3 sentences with real data found
- "real_fact": the correct current fact (or "Unable to determine")
- "source": URL or source name

Return ONLY valid JSON. No markdown.`;

  const data = await callClaude(
    [{ role: "user", content: prompt }],
    [{ type: "web_search_20250305", name: "web_search" }]
  );
  const text = getText(data);
  try { return parseJSON(text); }
  catch {
    return { verdict: "Inaccurate", explanation: "Could not parse result.", real_fact: "Unable to determine", source: "" };
  }
}

export default function App() {
  const [file, setFile] = useState(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [maxClaims, setMaxClaims] = useState(6);
  const [phase, setPhase] = useState("idle"); // idle | extractText | extractClaims | verifying | done
  const [claims, setClaims] = useState([]);
  const [results, setResults] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const counts = results.reduce((a, r) => {
    a[r.verdict] = (a[r.verdict] || 0) + 1; return a;
  }, {});
  const accuracy = results.length ? Math.round((counts.Verified || 0) / results.length * 100) : 0;

  async function runFactCheck() {
    // Requires at least one key to execute cleanly
    if (!file || (!anthropicKey && !openRouterKey && !googleKey)) return;
    setError(""); setResults([]); setClaims([]); setCurrentIdx(0);

    try {
      setPhase("extractText");
      const text = await extractText(file);

      setPhase("extractClaims");
      const claimList = await extractClaims(text, maxClaims);
      setClaims(claimList);

      setPhase("verifying");
      const finalResults = [];
      for (let i = 0; i < claimList.length; i++) {
        setCurrentIdx(i);
        const r = await verifyClaim(claimList[i].claim, claimList[i].search_query);
        r.claim = claimList[i].claim;
        r.type = claimList[i].type;
        finalResults.push(r);
        setResults([...finalResults]);
      }
      setPhase("done");
    } catch (e) {
      setError(e.message);
      setPhase("idle");
    }
  }

  // True if at least one input fields has characters in it
  const keysConfigured = anthropicKey || openRouterKey || googleKey;
  const busy = phase !== "idle" && phase !== "done";

  return (
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh", background: "#F8FAFC" }}>
      {/* Header */}
      <div style={{ background: COLORS.navy, color: "white", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 28 }}>🔍</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Fact-Check Agent</div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>Truth Layer — PDF claim verification powered by Claude AI + live web search</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
        {/* Upload card */}
        <div style={{ background: "white", borderRadius: 12, padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.navy, marginBottom: 16 }}>📄 Setup & Upload PDF Document</div>

          {/* API Keys Configuration Layer */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>Anthropic API Key</label>
              <input type="password" placeholder="sk-ant-..." value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>OpenRouter API Key</label>
              <input type="password" placeholder="sk-or-..." value={openRouterKey} onChange={e => setOpenRouterKey(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>Google API Key</label>
              <input type="password" placeholder="AIzaSy..." value={googleKey} onChange={e => setGoogleKey(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13 }} />
            </div>
          </div>

          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${file ? COLORS.teal : "#CBD5E1"}`,
              borderRadius: 8, padding: "28px 20px", textAlign: "center",
              cursor: "pointer", background: file ? "#F0FDF9" : "#F8FAFC",
              transition: "all 0.2s"
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>{file ? "📋" : "📁"}</div>
            <div style={{ color: file ? COLORS.teal : "#64748B", fontWeight: 600, fontSize: 14 }}>
              {file ? `✅ ${file.name}` : "Click to upload a PDF"}
            </div>
            {!file && <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>Supports any PDF — reports, marketing copy, press releases</div>}
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
            <label style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>
              Claims to verify: <strong style={{ color: COLORS.navy }}>{maxClaims}</strong>
            </label>
            <input type="range" min={3} max={12} value={maxClaims}
              onChange={e => setMaxClaims(+e.target.value)}
              style={{ flex: 1, accentColor: COLORS.teal }} />
          </div>

          <button
            onClick={runFactCheck}
            disabled={!file || !keysConfigured || busy}
            style={{
              marginTop: 16, width: "100%", padding: "13px 0",
              background: (!file || !keysConfigured || busy) ? "#E2E8F0" : COLORS.teal,
              color: (!file || !keysConfigured || busy) ? "#94A3B8" : "white",
              border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15,
              cursor: (!file || !keysConfigured || busy) ? "default" : "pointer", transition: "all 0.2s"
            }}
          >
            {!keysConfigured ? "🔑 Please enter at least one API key" : busy ? "⏳ Analysing..." : "🚀 Run Fact-Check"}
          </button>
        </div>

        {/* Progress */}
        {busy && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: COLORS.navy, marginBottom: 12 }}>
              {phase === "extractText" && "📄 Extracting text from PDF..."}
              {phase === "extractClaims" && "🧠 Identifying verifiable claims..."}
              {phase === "verifying" && `🌐 Verifying claim ${currentIdx + 1} of ${claims.length}...`}
            </div>
            {phase === "verifying" && claims.length > 0 && (
              <>
                <div style={{ height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4, background: COLORS.teal,
                    width: `${((currentIdx) / claims.length) * 100}%`, transition: "width 0.5s"
                  }} />
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>
                  Checking: "{claims[currentIdx]?.claim?.slice(0, 80)}..."
                </div>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: COLORS.bgRed, border: `1px solid ${COLORS.red}`, borderRadius: 8, padding: 14, marginBottom: 16, color: COLORS.red, fontSize: 13 }}>
            ❌ Error: {error}
          </div>
        )}

        {/* Summary */}
        {results.length > 0 && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 16, marginBottom: 16 }}>📊 Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "✅ Verified", key: "Verified", color: COLORS.green, bg: COLORS.bgGreen },
                { label: "⚠️ Inaccurate", key: "Inaccurate", color: COLORS.amber, bg: COLORS.bgAmber },
                { label: "❌ False", key: "False", color: COLORS.red, bg: COLORS.bgRed },
              ].map(m => (
                <div key={m.key} style={{ background: m.bg, borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: m.color }}>{counts[m.key] || 0}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#F0FDF9", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
              <strong>Accuracy score: {accuracy}%</strong>
              <span style={{ color: "#64748B" }}> ({counts.Verified || 0} of {results.length} claims verified)</span>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 16, marginBottom: 12 }}>📋 Detailed Results</div>
            {results.map((r, i) => {
              const b = BADGE[r.verdict] || BADGE.Inaccurate;
              return (
                <div key={i} style={{
                  background: "white", borderRadius: 10, padding: 18,
                  borderLeft: `4px solid ${b.border}`,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.06)", marginBottom: 12
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, background: "#EEF2FF", color: "#4338CA", borderRadius: 4, padding: "2px 7px", fontWeight: 700, whiteSpace: "nowrap", marginTop: 2 }}>
                      #{i + 1} {r.type}
                    </span>
                    <span style={{ fontSize: 14, color: COLORS.navy, fontWeight: 600 }}>
                      "{r.claim?.slice(0, 140)}{r.claim?.length > 140 ? "..." : ""}"
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ background: b.bg, color: "white", borderRadius: 12, padding: "3px 12px", fontWeight: 700, fontSize: 12 }}>
                      {b.icon} {r.verdict}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                    <strong>Finding:</strong> {r.explanation}
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: r.source ? 6 : 0 }}>
                    <strong>Real fact:</strong> {r.real_fact}
                  </div>
                  {r.source && r.source !== "N/A" && (
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                      <strong>Source:</strong> {r.source}
                    </div>
                  )}
                </div>
              );
            })}
            {phase === "done" && (
              <div style={{ textAlign: "center", padding: "16px 0", color: "#64748B", fontSize: 13 }}>
                ✅ Fact-check complete — {results.length} claims verified
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

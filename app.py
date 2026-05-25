import streamlit as st
import anthropic
import fitz
import json
import re

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Fact-Check Agent",
    page_icon="🔍",
    layout="wide",
)

# ── Styles ───────────────────────────────────────────────────────────────────
st.markdown("""
<style>
.verified   { background:#d1fae5; border-left:4px solid #059669; padding:12px 16px; border-radius:6px; margin:8px 0; }
.inaccurate { background:#fef3c7; border-left:4px solid #d97706; padding:12px 16px; border-radius:6px; margin:8px 0; }
.false_flag { background:#fee2e2; border-left:4px solid #dc2626; padding:12px 16px; border-radius:6px; margin:8px 0; }
.badge-verified   { background:#059669; color:white; padding:2px 10px; border-radius:12px; font-weight:700; font-size:13px; }
.badge-inaccurate { background:#d97706; color:white; padding:2px 10px; border-radius:12px; font-weight:700; font-size:13px; }
.badge-false      { background:#dc2626; color:white; padding:2px 10px; border-radius:12px; font-weight:700; font-size:13px; }
</style>
""", unsafe_allow_html=True)

# ── Header ───────────────────────────────────────────────────────────────────
st.title("🔍 Fact-Check Agent")
st.markdown("**Truth Layer** — Upload a PDF to automatically extract and verify claims against live web data.")
st.markdown("---")

# ── Sidebar ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Settings")
    api_key = st.text_input("Anthropic API Key", type="password", help="Get yours at console.anthropic.com")
    openrouter_key = st.text_input("OpenRouter API Key", type="password", help="Get yours at openrouter.ai")
    google_key = st.text_input("Google API Key", type="password", help="Get yours at aistudio.google.com")
    
    max_claims = st.slider("Max claims to verify", 3, 15, 8)
    st.markdown("---")
    st.markdown("### How it works")
    st.markdown("""
1. 📄 **Extract** — AI identifies stats, dates & figures from your PDF
2. 🌐 **Verify** — Each claim is cross-referenced against live web data
3. 🚦 **Report** — Claims flagged as Verified, Inaccurate, or False
    """)
    st.markdown("---")
    st.markdown("### Legend")
    st.markdown("🟢 **Verified** — Matches current data")
    st.markdown("🟡 **Inaccurate** — Outdated or partially wrong")
    st.markdown("🔴 **False** — No evidence / contradicted")

# ── Main ─────────────────────────────────────────────────────────────────────
uploaded_file = st.file_uploader("Upload a PDF document", type=["pdf"])

def extract_text_from_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text[:15000]  # Trim to avoid token limits

def extract_claims(client: anthropic.Anthropic, text: str, max_claims: int) -> list[dict]:
    prompt = f"""You are a fact-checking assistant. Extract up to {max_claims} specific, verifiable claims from the document text below.

Focus ONLY on:
- Statistics and numerical figures (e.g. "X% of users...", "$Y billion market...")
- Dates and timelines (e.g. "Founded in YYYY", "by YEAR the market will...")
- Technical/financial facts that can be independently verified

For each claim, return a JSON array. Each item must have:
- "claim": the exact claim as stated in the document (1-2 sentences max)
- "type": one of "statistic", "date", "financial", "technical"
- "search_query": the best web search query to verify this claim

Return ONLY valid JSON. No markdown. No explanation.

Document:
{text}"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = response.content[0].text.strip()
    raw = re.sub(r"```json|```", "", raw).strip()
    return json.loads(raw)

def verify_claim(client: anthropic.Anthropic, claim: str, search_query: str) -> dict:
    prompt = f"""You are a fact-checker with web search access. Verify the following claim using live web search.

Claim: "{claim}"
Search hint: {search_query}

Instructions:
1. Search the web to find current data about this claim.
2. Compare what you find to the claim.
3. Return a JSON object with exactly these fields:
   - "verdict": one of "Verified", "Inaccurate", or "False"
       - "Verified" = claim matches current evidence
       - "Inaccurate" = claim was once true but is now outdated, or is partially wrong
       - "False" = claim is clearly wrong or no evidence supports it
   - "explanation": 2-3 sentences explaining your verdict with the real data you found
   - "real_fact": the correct/current fact (or "Unable to determine" if no data found)
   - "source": URL or source name of the evidence you used

Return ONLY valid JSON. No markdown."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": prompt}]
    )
    # Collect text blocks
    text = " ".join(b.text for b in response.content if b.type == "text" and hasattr(b, "text"))
    text = re.sub(r"```json|```", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        return {
            "verdict": "Inaccurate",
            "explanation": "Could not parse verification result.",
            "real_fact": "Unable to determine",
            "source": "N/A"
        }

def render_result(claim_text: str, result: dict, idx: int):
    verdict = result.get("verdict", "Inaccurate")
    explanation = result.get("explanation", "")
    real_fact = result.get("real_fact", "")
    source = result.get("source", "")

    css_class = {"Verified": "verified", "Inaccurate": "inaccurate", "False": "false_flag"}.get(verdict, "inaccurate")
    badge_class = {"Verified": "badge-verified", "Inaccurate": "badge-inaccurate", "False": "badge-false"}.get(verdict, "badge-inaccurate")
    icon = {"Verified": "✅", "Inaccurate": "⚠️", "False": "❌"}.get(verdict, "⚠️")

    st.markdown(f"""
<div class="{css_class}">
  <strong>#{idx} — {claim_text[:120]}{"..." if len(claim_text)>120 else ""}</strong><br>
  <span class="{badge_class}">{icon} {verdict}</span><br><br>
  <b>Finding:</b> {explanation}<br>
  <b>Real fact:</b> {real_fact}<br>
  {"<b>Source:</b> " + source if source and source != "N/A" else ""}
</div>
""", unsafe_allow_html=True)

# ── Run ───────────────────────────────────────────────────────────────────────
# Check if at least one key is present
has_any_key = bool(api_key or openrouter_key or google_key)

if uploaded_file and has_any_key:
    if st.button("🚀 Run Fact-Check", type="primary"):
        # Uses whichever key is populated to pass into your unaltered logic pipeline
        active_key = api_key or openrouter_key or google_key
        client = anthropic.Anthropic(api_key=active_key)

        with st.spinner("📄 Extracting text from PDF..."):
            file_bytes = uploaded_file.read()
            doc_text = extract_text_from_pdf(file_bytes)

        if not doc_text.strip():
            st.error("Could not extract text from this PDF. Try a text-based PDF.")
            st.stop()

        st.success(f"✅ Extracted {len(doc_text):,} characters from PDF")

        with st.spinner(f"🧠 Identifying up to {max_claims} verifiable claims..."):
            try:
                claims = extract_claims(client, doc_text, max_claims)
            except Exception as e:
                st.error(f"Claim extraction failed: {e}")
                st.stop()

        st.info(f"🔎 Found **{len(claims)} claims** to verify. Checking each against live web data...")

        # Summary counters
        results = []
        verdict_counts = {"Verified": 0, "Inaccurate": 0, "False": 0}

        progress = st.progress(0)
        status_text = st.empty()

        for i, claim_obj in enumerate(claims):
            claim_text = claim_obj.get("claim", "")
            search_q   = claim_obj.get("search_query", claim_text)
            status_text.text(f"Verifying claim {i+1}/{len(claims)}: {claim_text[:60]}...")

            result = verify_claim(client, claim_text, search_q)
            verdict = result.get("verdict", "Inaccurate")
            verdict_counts[verdict] = verdict_counts.get(verdict, 0) + 1
            results.append((claim_text, result))
            progress.progress((i + 1) / len(claims))

        status_text.empty()
        progress.empty()

        # ── Summary ──
        st.markdown("---")
        st.subheader("📊 Summary")
        c1, c2, c3 = st.columns(3)
        c1.metric("✅ Verified",   verdict_counts.get("Verified", 0))
        c2.metric("⚠️ Inaccurate", verdict_counts.get("Inaccurate", 0))
        c3.metric("❌ False",      verdict_counts.get("False", 0))

        accuracy = (verdict_counts.get("Verified", 0) / len(claims) * 100) if claims else 0
        st.markdown(f"**Document accuracy score: {accuracy:.0f}%** ({verdict_counts.get('Verified',0)} of {len(claims)} claims verified)")

        st.markdown("---")
        st.subheader("📋 Detailed Results")
        for idx, (claim_text, result) in enumerate(results, 1):
            render_result(claim_text, result, idx)

elif uploaded_file and not has_any_key:
    st.warning("⬅️ Please enter at least one API key in the sidebar to proceed.")
elif has_any_key and not uploaded_file:
    st.info("⬆️ Upload a PDF file to begin fact-checking.")
else:
    st.info("⬆️ Enter an API key in the sidebar and upload a PDF to get started.")

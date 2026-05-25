# 🔍 Fact-Check Agent

> Automated PDF claim verification powered by Claude AI + live web search.

## What It Does

Upload any PDF and the app will:
1. **Extract** – Identify specific verifiable claims (stats, dates, financial/technical figures)
2. **Verify** – Cross-reference each claim against live web data using Claude's web search
3. **Report** – Flag each claim as **Verified** ✅, **Inaccurate** ⚠️, or **False** ❌

---

## Live Demo

🌐 **[Click to open the deployed app](https://your-app.streamlit.app)**  
*(Replace with your Streamlit Cloud URL after deployment)*

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Streamlit |
| AI Model | Claude Sonnet 4 (Anthropic) |
| Web Search | Claude's built-in `web_search_20250305` tool |
| PDF Parsing | PyMuPDF (fitz) |
| Deployment | Streamlit Cloud |

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/factcheck-agent.git
cd factcheck-agent

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the app
streamlit run app.py
```

Then open [http://localhost:8501](http://localhost:8501) in your browser.

---

## Deployment (Streamlit Cloud) — Free

1. Push this repo to GitHub
2. Go to [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub
3. Click **New app** → select this repo → set `app.py` as the main file
4. Click **Deploy** — your app will be live in ~2 minutes

> **No secrets config needed** — users enter their own API key in the sidebar.

---

## Usage

1. Enter your [Anthropic API key](https://console.anthropic.com) in the sidebar
2. Upload a PDF (marketing copy, reports, press releases, etc.)
3. Adjust the "Max claims" slider (3–15)
4. Click **Run Fact-Check**

### Example output

```
Claim #1: "Global AI market was worth $136 billion in 2022"
✅ VERIFIED — Multiple sources confirm the figure is approximately $136.6B for 2022.
Real fact: $136.6B (Grand View Research, 2023)

Claim #2: "ChatGPT reached 1 million users in 5 days"
⚠️ INACCURATE — ChatGPT reached 1 million in 5 days is correct, 
                  but 100 million in 2 months is often misquoted as 1 month.
Real fact: 1M users in 5 days; 100M in ~2 months (OpenAI, 2023)

Claim #3: "Google has 95% of the global search market share"
❌ FALSE — Google holds approximately 91–92%, not 95%.
Real fact: ~91.5% as of 2024 (Statcounter)
```

---

## Project Structure

```
factcheck-agent/
├── app.py              # Main Streamlit application
├── requirements.txt    # Python dependencies
└── README.md           # This file
```

---

## Evaluation Notes

The app is designed to catch intentional inaccuracies ("Trap Documents"):
- Outdated statistics are flagged as **Inaccurate** with the current correct figure
- Fabricated statistics are flagged as **False** with a source-backed explanation
- All verdicts include a `real_fact` field with the corrected information

---

## Author

Assessment submission for **Management Trainee – Product Management**  
CogCulture | 2026

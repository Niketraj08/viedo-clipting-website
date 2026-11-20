# ClipForge AI

ClipForge AI is a full-stack AI video clipping and viral shorts SaaS platform built with **React (JavaScript ES6 / JSX)**, **Tailwind CSS**, **Node.js + Express.js**, **FFmpeg / FFprobe**, and the **Google Gemini API (`@google/genai`)**.

## Core Capabilities

- **Multimodal Highlight & Region Detection**: Uploads source videos to the Gemini Files API (`gemini-4-hydrogen`) to identify top viral moments, hooks, descriptions, hashtags, viral scores, speaker focus positions, and normalized bounding boxes for **facecam** and **gameplay** regions.
- **Word-by-Word Multilingual Captions**: Generates synchronized word-level timestamps in **English**, **Hindi (Devanagari)**, and **Hinglish**, rendered into animated ASS subtitles (`Noto Sans` / `Noto Sans Devanagari`) and downloadable `.srt` files.
- **FFmpeg 1080p MP4 Engine**: Cuts, trims, smart-crops (`9:16`, `1:1`, `16:9`), builds 40/60 **Facecam-on-Top + Gameplay-on-Bottom Split-Screen** layouts, mixes background music beds with volume controls, applies fade transitions, and encodes fast-start H.264 MP4s.
- **Built-in Video Editor**: Trim start/end timestamps, adjust facecam & gameplay crop boxes, switch aspect ratios and caption styles, edit words or keyword highlights inline, regenerate captions in another language, and re-render 1080p MP4s on demand.
- **Livestream Auto-Clipping**: Ingests authorized HLS (`.m3u8`) feeds or **Browser Live Studio Capture** (webcam/screen `MediaRecorder` 12s chunks), scoring live segments and automatically rendering viral highlights via Server-Sent Events (SSE).
- **Accounts, Projects & Credits**: Email/password authentication (`bcryptjs` + JWT), persistent project & clip history, credit ledger, subscription plan management, and default studio preferences.

## Prerequisites & API Keys

1. **Node.js v20+** and **FFmpeg / FFprobe** (`libx264`, `aac`, `libass` / `Noto Sans Devanagari` font).
2. **`GEMINI_API_KEY`**: Obtain from [Google AI Studio](https://aistudio.google.com/apikey) and configure it in your environment secrets (never expose it in frontend code).
3. **Optional `YOUTUBE_DATA_API_KEY`**: Obtain from Google Cloud Console if you want extended YouTube Data API v3 queries beyond standard oEmbed metadata lookup. Note that direct YouTube stream scraping is intentionally not performed; users upload their authorized MP4/MOV/WebM/MKV file or paste a direct MP4/HLS VOD URL.

## Setup & Running Locally

```bash
cp .env.example .env
# Add GEMINI_API_KEY and JWT_SECRET to .env
npm install
npm run dev
```

For production:

```bash
npm run build
NODE_ENV=production npm start
```

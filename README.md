# Academic Outreach Explorer 🧬

A specialized tool designed for academic researchers. Leveraging Google Scholar data and Gemini AI to streamline professor discovery, relevance analysis, and personalized outreach.

## ✨ Key Features

- **Rapid Researcher Extraction**: Paste raw text containing professor names; AI automatically identifies and organizes them into a list.
- **Deep Google Scholar Integration**: One-click Search & Link for Scholar profiles to fetch avatars, publications, and citation metadata.
- **AI Relevance Analysis**: Based on publication titles and abstracts, Gemini AI evaluates researchers against your specific interests, assigning "High/Partial/Low" match rankings.
- **Evidence Traceability**: Hover over interest tags to see the AI's reasoning and the specific supporting papers.
- **Personalized Outreach**: An integrated template system where AI generates professionalized email drafts tailored to both your profile and the researcher's background.
- **Workflow Management**: Favorite promising candidates, track email "Not Sent/Sent" status, and clear irrelevant leads easily.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- [Gemini API Key](https://aistudio.google.com/app/apikey)
- [SerpApi Key](https://serpapi.com/) (Required for Google Scholar search automation)

### Local Setup

1. **Clone & Install Dependencies**:
    ```bash
    npm install
    ```

2. **Configure Environment Variables**:
    Create a `.env.local` file in the root directory:
    ```env
    VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    VITE_SERP_API_KEY=YOUR_SERP_API_KEY
    ```

3. **Launch Development Server**:
    ```bash
    npm run dev
    ```

## 📖 Usage Guide

### Step 1: Data Entry
Click **"Extract Name"** in the bottom bar. Paste any text (emails, web snippets, PDF text) containing professor names. The system will extract and deduplicate them instantly.

### Step 2: Source Scholar Data
For each researcher, click **"Link Google Scholar Profile"**. The system will search for the best match. You can also manually input a Scholar ID (the `user=xxx` part of their profile URL).

### Step 3: Run AI Analysis
Click **"Batch Analyze"** in the bottom toolbar. Gemini AI will scan their most recent publications to determine research alignment and generate keywords. Hover over tags for detailed evidence.

### Step 4: Customize Your Outreach
1. Set your research interest and generic email template in the **"My Profile"** tab.
2. Under **"Find Professor"**, star (favorite) the top matches.
3. Switch to **"Customize Letter"** and click **"Customize Letter"** for a specific candidate. AI will craft a unique inquiry based on their specific research papers.

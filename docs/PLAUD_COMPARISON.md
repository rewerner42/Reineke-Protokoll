# Reineke-Protokoll vs. Plaud Note

This document provides a comparison between Reineke-Protokoll and Plaud Note, highlighting where Reineke excels and where it currently falls short, in order to guide the transition to Reineke as a full replacement for Plaud.

## Overview

**Plaud Note** is a hardware-based smart AI voice recorder that seamlessly integrates with an app to provide transcription (via Whisper) and summarization (via GPT-4). It requires a subscription for extended transcription minutes and relies on cloud processing.

**Reineke-Protokoll** is a cross-platform (Desktop/Mobile) meeting recording and protocol app that focuses on local processing, privacy, and flexibility, allowing users to use their own LLM API keys without being locked into a subscription model.

## Reineke's Strengths

1. **Local Privacy First**: Reineke runs the Whisper transcription model locally (e.g., using `nodejs-whisper` on desktop). No audio files are ever uploaded to a cloud server for transcription.
2. **No Recurring App Subscriptions**: While Plaud caps transcription minutes and requires a paid plan for heavy users, Reineke users provide their own API keys (Anthropic or OpenAI) and only pay for the LLM token usage. The transcription itself is free and unlimited.
3. **Choice of LLM**: Reineke allows users to choose between Claude (Anthropic) and OpenAI, whereas Plaud forces the use of their GPT-4 pipeline.
4. **Data Ownership**: Data is stored locally in an SQLite database, ensuring that users have full control over their meeting records and summaries.

## Reineke's Drawbacks (Current Limitations)

1. **No Dedicated Hardware for Call Recording**: Plaud Note features a dual-engine design with a Vibration Conduction Sensor (VCS) that makes it excellent for recording internal phone sounds during calls. Reineke, being purely software, relies on the device's microphone and cannot natively intercept internal call audio as effectively.
2. **No Built-in Cloud Sync / Web Portal**: Plaud offers a web portal and cloud storage for managing and sharing recordings. Reineke currently stores data purely locally, requiring manual export or a bring-your-own-cloud solution for syncing across devices.
3. **No Automatic Speaker Diarization**: Plaud Note offers AI-driven speaker identification. Currently, Reineke does not support automatic speaker diarization (it relies on a manual speaker switch button as per its architecture).

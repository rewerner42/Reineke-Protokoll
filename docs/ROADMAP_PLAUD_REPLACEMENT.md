# Roadmap: Replacing Plaud Note with Reineke-Protokoll

To fully replace Plaud Note and provide a comparable or superior user experience, Reineke-Protokoll needs to address the current feature gaps. This roadmap outlines the strategic phases to achieve this goal.

## Phase 1: Complete Mobile App (The "Pocket Recorder")

Plaud's primary advantage is its portability. To match this, Reineke's mobile app must be fully functional.

*   **Goal**: Provide a native iOS/Android recording experience with local AI transcription.
*   **Tasks**:
    *   Complete the Expo React Native app skeleton (`packages/mobile`).
    *   Integrate local Whisper on mobile to ensure privacy and offline capabilities.
    *   Implement the recording UI and basic protocol generation flow on mobile.
    *   Ensure secure storage of API keys (`expo-secure-store`).

## Phase 2: Speaker Diarization

Plaud offers AI-driven speaker identification, which is crucial for multi-person meetings.

*   **Goal**: Automatically identify and label different speakers in the transcription.
*   **Tasks**:
    *   Research and integrate an on-device or lightweight speaker diarization model.
    *   Update the `shared/transcription` logic to attach speaker labels to segments automatically.
    *   Update the UI in both desktop and mobile apps to display and allow editing of speaker labels.

## Phase 3: Optional Cloud Sync

Plaud provides a web portal and cloud storage. While Reineke prioritizes local data, offering an optional sync mechanism is necessary for users with multiple devices.

*   **Goal**: Allow users to access their recordings and protocols across all their devices (Desktop and Mobile).
*   **Tasks**:
    *   Implement a "Bring Your Own Cloud" (BYOC) solution (e.g., WebDAV, iCloud/Google Drive integration).
    *   Alternatively, provide a self-hostable sync server or an end-to-end encrypted optional cloud service (e.g., Supabase with E2EE).
    *   Ensure all synced data is encrypted locally before leaving the device.

## Phase 4: Phone Call Recording Workarounds

Plaud's unique hardware (Vibration Conduction Sensor) allows it to record phone calls natively, which is restricted on standard iOS/Android software.

*   **Goal**: Provide users with viable methods to record phone calls using Reineke.
*   **Tasks**:
    *   **Documentation**: Create comprehensive guides on how to use external Bluetooth call recorders that feed audio into the phone, which Reineke can then capture.
    *   **Hardware Recommendations**: Test and recommend specific MagSafe microphones or Bluetooth headsets that support call recording.
    *   **Software Integrations**: Investigate if any platform-specific APIs (or accessibility services on Android) can be leveraged for call recording, though this must be handled carefully due to privacy and app store restrictions.

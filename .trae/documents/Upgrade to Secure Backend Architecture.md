I will upgrade the current client-side application to a secure, production-ready architecture by implementing a Firebase Cloud Functions backend.

## 1. Initialize Backend (Firebase Functions)
I will create a `functions` directory with a standard TypeScript configuration.
- **Dependencies**: `firebase-functions`, `firebase-admin`, `@google/genai`.
- **Environment**: Configure the backend to securely store the `GEMINI_API_KEY`.

## 2. Implement Backend Logic
I will migrate the sensitive business logic from the frontend to the backend to protect your API Key.
- **`generateResearchPlan`**: Move research plan generation logic to the backend.
- **`refineResearchPlan`**: Move plan optimization logic to the backend.
- **`analyzeTranscripts`**: Move transcript analysis logic to the backend.
- **`generateProjectReport`**: Move report generation logic to the backend.

## 3. Update Frontend Service
I will refactor `services/geminiService.ts` to call these new secure backend functions (using Firebase `httpsCallable`) instead of calling the Gemini API directly from the browser.

## 4. Configuration Updates
- Update `src/firebaseConfig.ts` to initialize the Firebase Functions service.
- Provide instructions on how to deploy these functions and set the environment variables.

*Note: The Real-time Voice feature (`useLiveAgent`) uses a WebSocket connection which requires direct client access. For this feature, I will retain the client-side implementation but recommend setting up "HTTP Referrer Restrictions" in the Google Cloud Console for production security.*

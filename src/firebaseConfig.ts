import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCy8XO4536nBVdr7fokxkigLlNrK0YnpJI",
  authDomain: "gen-lang-client-0856016385.firebaseapp.com",
  projectId: "gen-lang-client-0856016385",
  storageBucket: "gen-lang-client-0856016385.firebasestorage.app",
  messagingSenderId: "907985199070",
  appId: "1:907985199070:web:68f5cba4b6c124695c074f",
  measurementId: "G-89DQYVR25M"
};

// Initialize only if config is valid to prevent crashes in dev if not set up
let db: any = null;
let functions: any = null;
let analytics: any = null;

try {
    const app = initializeApp(firebaseConfig);
    
    // Use initializeFirestore to configure settings for better stability
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        }),
        // Force long polling to avoid WebSocket issues in some network environments
        experimentalForceLongPolling: true,
    });

    // Initialize Functions, default region is us-central1. 
    // If you change the region in functions/src/index.ts, change it here too.
    functions = getFunctions(app, 'us-central1');
    analytics = getAnalytics(app);
    
    console.log("Firebase initialized successfully");
} catch (e) {
    console.warn("Error initializing Firebase:", e);
}

export { db, functions, analytics };

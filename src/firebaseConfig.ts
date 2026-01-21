import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// TODO: Replace with your actual Firebase project configuration
// You can find this in Firebase Console -> Project Settings -> General -> Your apps
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

// Initialize only if config is valid to prevent crashes in dev if not set up
let db: any = null;
let functions: any = null;

try {
    if (firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        // Initialize Functions, default region is us-central1. 
        // If you change the region in functions/src/index.ts, change it here too.
        functions = getFunctions(app, 'us-central1');
        
        // Uncomment the following line to use a local emulator during development
        // import { connectFunctionsEmulator } from "firebase/functions";
        // connectFunctionsEmulator(functions, "localhost", 5001);
        
        console.log("Firebase initialized successfully");
    } else {
        console.warn("Firebase config not set. Falling back to LocalStorage.");
    }
} catch (e) {
    console.warn("Error initializing Firebase:", e);
}

export { db, functions };

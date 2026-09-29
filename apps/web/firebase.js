/**
 * Firebase Client SDK Initialization
 * Project: personal-timeline-app-5df44
 */
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyB-oe4-L-VKXxrr4-q5Jdyc7ZXMzxNOD0Q",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "personal-timeline-app-5df44.firebaseapp.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "personal-timeline-app-5df44",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "personal-timeline-app-5df44.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "958289409705",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:958289409705:web:524b7d63222ea631c69bb8"
};

// Initialize Firebase App & Services
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);

export { collection, doc, setDoc, getDocs, getDoc };

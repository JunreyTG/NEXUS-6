import "../config/load-env.js";
import { z } from "zod";

const optionalText = z.preprocess((val) => typeof val === "string" && !val.trim() ? undefined : val, z.string().trim().min(1).optional());

const firebaseEnvSchema = z.object({
  FIREBASE_API_KEY: optionalText,
  FIREBASE_AUTH_DOMAIN: optionalText,
  FIREBASE_PROJECT_ID: optionalText,
  FIREBASE_STORAGE_BUCKET: optionalText,
  FIREBASE_MESSAGING_SENDER_ID: optionalText,
  FIREBASE_APP_ID: optionalText
});

export type FirebaseConfig = {
  apiKey?: string | undefined;
  authDomain?: string | undefined;
  projectId?: string | undefined;
  storageBucket?: string | undefined;
  messagingSenderId?: string | undefined;
  appId?: string | undefined;
  configured: boolean;
};

export function getFirebaseConfig(source: NodeJS.ProcessEnv = process.env): FirebaseConfig {
  const result = firebaseEnvSchema.safeParse(source);
  if (!result.success) {
    return { configured: false };
  }
  const data = result.data;
  return {
    apiKey: data.FIREBASE_API_KEY,
    authDomain: data.FIREBASE_AUTH_DOMAIN,
    projectId: data.FIREBASE_PROJECT_ID,
    storageBucket: data.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: data.FIREBASE_MESSAGING_SENDER_ID,
    appId: data.FIREBASE_APP_ID,
    configured: Boolean(data.FIREBASE_API_KEY && data.FIREBASE_PROJECT_ID)
  };
}

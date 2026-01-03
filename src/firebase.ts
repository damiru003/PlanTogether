import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAgwhVusKFKkMB0YsdWG5GQHeJM95Dabs",
  authDomain: "plantogether-86d63.firebaseapp.com",
  projectId: "plantogether-86d63",
  storageBucket: "plantogether-86d63.firebasestorage.app",
  messagingSenderId: "806761260358",
  appId: "1:806761260358:web:f9910d8e93570a97413147"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// firebase.js - Firebase initialization and data helpers

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, setDoc, getDocs, query, where } from 'firebase/firestore/lite';

// Firebase configuration (placeholder - replace with actual values from Firebase console)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Get Firestore instance
const db = getFirestore(app);

/**
 * Save data to Firestore using addDoc (auto-generated ID)
 * @param {string} collectionName - Firestore collection name
 * @param {Object} data - Data to save
 * @returns {Promise<string>} Document ID
 */
export async function saveData(collectionName, data) {
  try {
    const docRef = await addDoc(collection(db, collectionName), data);
    console.log("Document written with ID: ", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
}

/**
 * Save data to Firestore using setDoc (specific ID)
 * @param {string} collectionName - Firestore collection name
 * @param {string} docId - Document ID
 * @param {Object} data - Data to save
 */
export async function saveDataWithId(collectionName, docId, data) {
  try {
    await setDoc(doc(db, collectionName, docId), data);
    console.log("Document successfully written!");
  } catch (e) {
    console.error("Error writing document: ", e);
    throw e;
  }
}

/**
 * Load data from Firestore with optional query
 * @param {string} collectionName - Firestore collection name
 * @param {Object} queryParams - Optional query parameters (e.g., { symbol: 'R_10', limit: 100 })
 * @returns {Promise<Array>} Array of documents data
 */
export async function loadData(collectionName, queryParams = {}) {
  try {
    let q = collection(db, collectionName);
    if (queryParams.symbol) {
      q = query(q, where("symbol", "==", queryParams.symbol));
    }
    // Add more query conditions as needed

    const querySnapshot = await getDocs(q);
    const dataList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return dataList;
  } catch (e) {
    console.error("Error getting documents: ", e);
    return [];
  }
}
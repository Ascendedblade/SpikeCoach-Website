// Public Firebase web config. Same project as the SpikeCoach desktop app.
// No Admin SDK, service accounts, or private keys belong in this file.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUTnFrlTu29speoOHncbrRGIKo5fpq5l4",
  authDomain: "spikecoach-b7a67.firebaseapp.com",
  projectId: "spikecoach-b7a67",
  storageBucket: "spikecoach-b7a67.firebasestorage.app",
  messagingSenderId: "136756983127",
  appId: "1:136756983127:web:b1abc6698032a6be6ffa12"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const ready = setPersistence(auth, browserLocalPersistence).catch(function () {
  return auth;
});

function publish(user) {
  window.spikeCoachCurrentUser = user || null;
  document.dispatchEvent(new CustomEvent("spikecoach-auth", {
    detail: { user: user || null }
  }));
}

ready.then(function () {
  onAuthStateChanged(auth, publish);
});

export const spikeAuth = {
  ready: ready,
  auth: auth,
  createAccount: function (email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  },
  signIn: function (email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },
  signOut: function () {
    return signOut(auth);
  },
  setDisplayName: function (user, displayName) {
    return updateProfile(user, { displayName: displayName });
  },
  sendVerification: function (user) {
    return sendEmailVerification(user);
  },
  reloadUser: function (user) {
    return reload(user).then(function () {
      return auth.currentUser;
    });
  },
  sendPasswordReset: function (email) {
    return sendPasswordResetEmail(auth, email);
  }
};

window.spikeCoachAuth = spikeAuth;

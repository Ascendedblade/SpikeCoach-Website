import { spikeAuth } from "./firebase-auth.js";

var panels = {
  signin: document.getElementById("panel-signin"),
  signup: document.getElementById("panel-signup"),
  reset: document.getElementById("panel-reset"),
  verify: document.getElementById("panel-verify"),
  profile: document.getElementById("panel-profile")
};

var verifyEmailEl = document.getElementById("verify-email");
var profileNameEl = document.getElementById("profile-name");
var profileEmailEl = document.getElementById("profile-email");
var profileVerifiedEl = document.getElementById("profile-verified");
var busy = false;

var fromDownload = new URLSearchParams(window.location.search).get("intent") === "download";
document.querySelectorAll('[data-intent="download"]').forEach(function (el) {
  el.hidden = !fromDownload;
});

function friendlyError(error) {
  var code = error && error.code ? error.code : "";
  var messages = {
    "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/missing-password": "Enter your password.",
    "auth/invalid-credential": "That email and password do not match.",
    "auth/wrong-password": "That email and password do not match.",
    "auth/user-not-found": "That email and password do not match.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/requires-recent-login": "Sign in again, then retry that action."
  };
  return messages[code] || "Something went wrong. Try again.";
}

function setMessage(id, text, isError) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
  el.classList.toggle("auth-message--error", !!isError);
}

function clearMessages() {
  ["signin-message", "signup-message", "reset-message", "verify-message"].forEach(function (id) {
    setMessage(id, "", false);
  });
}

function showPanel(name) {
  Object.keys(panels).forEach(function (key) {
    if (panels[key]) panels[key].hidden = key !== name;
  });
  clearMessages();
}

function currentMode() {
  var params = new URLSearchParams(window.location.search);
  var mode = params.get("mode");
  if (mode === "signup" || mode === "reset" || mode === "signin") return mode;
  return "signin";
}

function setMode(mode) {
  var url = new URL(window.location.href);
  url.searchParams.set("mode", mode);
  window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
}

function leaveTo(mode) {
  if (busy) return;
  busy = true;
  spikeAuth.signOut().catch(function () {}).then(function () {
    busy = false;
    setMode(mode);
    showPanel(mode === "signup" ? "signup" : "signin");
  });
}

function showSignedOut() {
  var mode = currentMode();
  if (mode === "signup") showPanel("signup");
  else if (mode === "reset") showPanel("reset");
  else showPanel("signin");
}

function showForUser(user) {
  if (!user) {
    showSignedOut();
    return;
  }
  if (!user.emailVerified) {
    if (verifyEmailEl) verifyEmailEl.textContent = user.email || "your email";
    showPanel("verify");
    return;
  }
  if (profileNameEl) profileNameEl.textContent = user.displayName || "Not set";
  if (profileEmailEl) profileEmailEl.textContent = user.email || "";
  if (profileVerifiedEl) profileVerifiedEl.textContent = "Yes";
  showPanel("profile");
}

document.getElementById("show-signup").addEventListener("click", function (event) {
  event.preventDefault();
  setMode("signup");
  showPanel("signup");
});

document.getElementById("show-signin-from-signup").addEventListener("click", function (event) {
  event.preventDefault();
  setMode("signin");
  showPanel("signin");
});

document.getElementById("show-reset").addEventListener("click", function (event) {
  event.preventDefault();
  setMode("reset");
  showPanel("reset");
});

document.getElementById("show-signin-from-reset").addEventListener("click", function (event) {
  event.preventDefault();
  setMode("signin");
  showPanel("signin");
});

document.getElementById("verify-back").addEventListener("click", function () {
  leaveTo("signin");
});

document.getElementById("verify-different").addEventListener("click", function () {
  leaveTo("signup");
});

document.getElementById("form-signin").addEventListener("submit", function (event) {
  event.preventDefault();
  if (busy) return;
  var email = document.getElementById("signin-email").value.trim();
  var password = document.getElementById("signin-password").value;
  setMessage("signin-message", "", false);
  busy = true;
  spikeAuth.signIn(email, password).then(function (credential) {
    showForUser(credential.user);
  }).catch(function (error) {
    setMessage("signin-message", friendlyError(error), true);
  }).then(function () {
    busy = false;
    document.getElementById("signin-password").value = "";
  });
});

document.getElementById("form-signup").addEventListener("submit", function (event) {
  event.preventDefault();
  if (busy) return;
  var name = document.getElementById("signup-name").value.trim();
  var email = document.getElementById("signup-email").value.trim();
  var password = document.getElementById("signup-password").value;
  var confirm = document.getElementById("signup-confirm").value;
  setMessage("signup-message", "", false);
  if (!name) {
    setMessage("signup-message", "Enter a display name.", true);
    return;
  }
  if (password !== confirm) {
    setMessage("signup-message", "Passwords do not match.", true);
    return;
  }
  if (password.length < 6) {
    setMessage("signup-message", "Use a password with at least 6 characters.", true);
    return;
  }
  busy = true;
  spikeAuth.createAccount(email, password).then(function (credential) {
    return spikeAuth.setDisplayName(credential.user, name).then(function () {
      return credential.user;
    });
  }).then(function (user) {
    showForUser(user);
    return spikeAuth.sendVerification(user).catch(function (error) {
      setMessage("verify-message", friendlyError(error), true);
    });
  }).catch(function (error) {
    if (!spikeAuth.auth.currentUser) {
      setMessage("signup-message", friendlyError(error), true);
    }
  }).then(function () {
    busy = false;
    document.getElementById("signup-password").value = "";
    document.getElementById("signup-confirm").value = "";
  });
});

document.getElementById("form-reset").addEventListener("submit", function (event) {
  event.preventDefault();
  if (busy) return;
  var email = document.getElementById("reset-email").value.trim();
  setMessage("reset-message", "", false);
  busy = true;
  spikeAuth.sendPasswordReset(email).then(function () {
    setMessage("reset-message", "If an account exists for that email, a reset link is on the way.", false);
  }).catch(function (error) {
    if (error && error.code === "auth/user-not-found") {
      setMessage("reset-message", "If an account exists for that email, a reset link is on the way.", false);
      return;
    }
    setMessage("reset-message", friendlyError(error), true);
  }).then(function () {
    busy = false;
  });
});

document.getElementById("verify-resend").addEventListener("click", function () {
  var user = spikeAuth.auth.currentUser;
  if (!user || busy) return;
  busy = true;
  spikeAuth.sendVerification(user).then(function () {
    setMessage("verify-message", "Verification email sent again.", false);
  }).catch(function (error) {
    setMessage("verify-message", friendlyError(error), true);
  }).then(function () {
    busy = false;
  });
});

document.getElementById("verify-check").addEventListener("click", function () {
  var user = spikeAuth.auth.currentUser;
  if (!user || busy) return;
  busy = true;
  spikeAuth.reloadUser(user).then(function (fresh) {
    if (fresh && fresh.emailVerified) {
      showForUser(fresh);
      return;
    }
    setMessage("verify-message", "Email is not verified yet. Open the link in your inbox, then try again.", true);
  }).catch(function (error) {
    setMessage("verify-message", friendlyError(error), true);
  }).then(function () {
    busy = false;
  });
});

document.getElementById("profile-signout").addEventListener("click", function () {
  leaveTo("signin");
});

document.addEventListener("spikecoach-auth", function (event) {
  showForUser(event.detail.user);
});

spikeAuth.ready.then(function () {
  showForUser(spikeAuth.auth.currentUser);
});

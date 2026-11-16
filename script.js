(function () {
  "use strict";

  var SITE_STATS = {
    weeklyUsers: "371",
    weeklyDetail: "371 unique users last week",
    totalAccounts: "1.4K",
    accountsDetail: "1.4K accounts created"
  };

  var weeklyEl = document.getElementById("stat-weekly");
  var accountsEl = document.getElementById("stat-accounts");
  var weeklyDetail = document.querySelector("#community-stats .stats-card:nth-child(1) .stats-detail");
  var accountsDetail = document.querySelector("#community-stats .stats-card:nth-child(2) .stats-detail");
  if (weeklyEl) weeklyEl.textContent = SITE_STATS.weeklyUsers;
  if (accountsEl) accountsEl.textContent = SITE_STATS.totalAccounts;
  if (weeklyDetail) weeklyDetail.textContent = SITE_STATS.weeklyDetail;
  if (accountsDetail) accountsDetail.textContent = SITE_STATS.accountsDetail;

  var siteHeader = document.querySelector(".site-header");
  if (siteHeader && !document.getElementById("header-stats")) {
    var bar = document.createElement("div");
    bar.id = "header-stats";
    bar.className = "header-stats";
    bar.setAttribute("role", "status");

    var weekly = document.createElement("span");
    weekly.className = "header-stat";
    var weeklyValue = document.createElement("strong");
    weeklyValue.textContent = SITE_STATS.weeklyUsers;
    weekly.appendChild(weeklyValue);
    weekly.appendChild(document.createTextNode(" weekly users"));

    var accounts = document.createElement("span");
    accounts.className = "header-stat";
    var accountsValue = document.createElement("strong");
    accountsValue.textContent = SITE_STATS.totalAccounts;
    accounts.appendChild(accountsValue);
    accounts.appendChild(document.createTextNode(" accounts created"));

    bar.appendChild(weekly);
    bar.appendChild(accounts);
    siteHeader.insertBefore(bar, siteHeader.firstChild);
  }

  function renderNav(user) {
    var slot = document.getElementById("nav-auth");
    if (!slot) return;
    slot.replaceChildren();
    if (user) {
      var accountLink = document.createElement("a");
      accountLink.href = "account.html";
      accountLink.className = "nav-cta";
      accountLink.textContent = "Account";
      slot.appendChild(accountLink);
      if (user.emailVerified) {
        var name = document.createElement("span");
        name.className = "nav-auth-name";
        name.textContent = user.displayName || "Account";
        slot.appendChild(name);
      }
      return;
    }
    var signIn = document.createElement("a");
    signIn.href = "account.html?mode=signin";
    signIn.textContent = "Sign In";
    var create = document.createElement("a");
    create.href = "account.html?mode=signup";
    create.className = "nav-cta";
    create.textContent = "Create Account";
    slot.appendChild(signIn);
    slot.appendChild(create);
  }

  document.addEventListener("spikecoach-auth", function (event) {
    renderNav(event.detail && event.detail.user);
  });
  renderNav(window.spikeCoachCurrentUser || null);

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");

  if (header) {
    var updateScrolled = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", updateScrolled, { passive: true });
    updateScrolled();
  }

  if (toggle && header && nav) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    nav.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  var revealSections = document.querySelectorAll(".reveal-on-scroll");
  if (revealSections.length && "IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    revealSections.forEach(function (section) {
      revealObserver.observe(section);
    });
  } else {
    revealSections.forEach(function (section) {
      section.classList.add("is-visible");
    });
  }
})();

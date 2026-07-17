(function () {
  var root = document.querySelector("main .reserveDetailWrapper");
  if (!root) return;

  var API = "/.netlify/functions/state";
  var lastSnapshot = "";
  var timer = null;
  var saving = false;
  var pending = false;

  var status = document.createElement("div");
  status.textContent = "자동저장 준비";
  status.style.cssText = [
    "position:fixed",
    "right:10px",
    "bottom:12px",
    "z-index:2147483647",
    "padding:6px 9px",
    "border-radius:12px",
    "background:rgba(0,0,0,.72)",
    "color:#fff",
    "font-size:11px",
    "line-height:1",
    "opacity:0",
    "transition:opacity .2s",
    "pointer-events:none"
  ].join(";");
  document.body.appendChild(status);

  function showStatus(text) {
    status.textContent = text;
    status.style.opacity = "1";
    clearTimeout(status._hideTimer);
    status._hideTimer = setTimeout(function () {
      status.style.opacity = "0";
    }, 1200);
  }

  function editableLeaves(box) {
    return Array.prototype.slice.call(box.querySelectorAll("*")).filter(function (el) {
      return !el.children.length &&
        el.textContent.trim() &&
        !el.matches("script,style,noscript,path");
    });
  }

  function ensureEditableKeys() {
    editableLeaves(root).forEach(function (el, i) {
      if (el.closest(".seatInfoListWrapper .titleWrap button")) return;
      if (!el.dataset.sampleEdit) el.dataset.sampleEdit = String(i);
      el.contentEditable = "true";
      el.spellcheck = false;
    });
  }

  function getSeatTotal() {
    var list = root.querySelector(".seatInfoListWrapper .infoListWrap > ul");
    return list ? list.children.length : null;
  }

  function collectState() {
    ensureEditableKeys();

    var texts = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-sample-edit]")).forEach(function (el) {
      texts[el.dataset.sampleEdit] = el.textContent || "";
    });

    var images = {};
    Array.prototype.slice.call(root.querySelectorAll("img")).forEach(function (img, i) {
      if (/^https?:\/\//.test(img.src) && img.src.length < 2000) {
        images[String(i)] = img.src;
      }
    });

    return {
      texts: texts,
      images: images,
      seatTotal: getSeatTotal()
    };
  }

  function snapshot() {
    var data = collectState();
    return JSON.stringify({
      texts: data.texts,
      images: data.images,
      seatTotal: data.seatTotal
    });
  }

  function postJSON(data) {
    var body = JSON.stringify(data);

    if (window.fetch) {
      return fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body,
        cache: "no-store"
      });
    }

    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API, true);
      xhr.setRequestHeader("content-type", "application/json");
      xhr.onload = function () { resolve(xhr); };
      xhr.onerror = reject;
      xhr.send(body);
    });
  }

  function saveNow() {
    var data = collectState();
    var current = JSON.stringify(data);
    if (saving) {
      pending = true;
      return;
    }

    saving = true;
    showStatus("저장중");
    postJSON(data).then(function () {
      lastSnapshot = current;
      showStatus("저장됨");
    }).catch(function () {
      showStatus("저장 재시도중");
    }).finally(function () {
      saving = false;
      if (pending) {
        pending = false;
        scheduleSave(100);
      }
    });
  }

  function scheduleSave(delay) {
    clearTimeout(timer);
    timer = setTimeout(saveNow, delay == null ? 500 : delay);
  }

  function loadState() {
    if (!window.fetch) return;
    fetch(API + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        if (data.texts) {
          Object.keys(data.texts).forEach(function (key) {
            var el = root.querySelector('[data-sample-edit="' + CSS.escape(key) + '"]');
            if (el) el.textContent = data.texts[key];
          });
        }
        if (data.images) {
          Array.prototype.slice.call(root.querySelectorAll("img")).forEach(function (img, i) {
            if (data.images[String(i)]) img.src = data.images[String(i)];
          });
        }
        lastSnapshot = snapshot();
      })
      .catch(function () {});
  }

  ["input", "keyup", "blur", "paste", "compositionend"].forEach(function (eventName) {
    root.addEventListener(eventName, function () {
      scheduleSave(350);
    }, true);
  });

  new MutationObserver(function () {
    scheduleSave(700);
  }).observe(root, { subtree: true, childList: true, characterData: true });

  setInterval(function () {
    var current = snapshot();
    if (current !== lastSnapshot) {
      scheduleSave(100);
    }
  }, 1000);

  window.addEventListener("beforeunload", function () {
    var data = collectState();
    var body = JSON.stringify(data);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API, new Blob([body], { type: "application/json" }));
    }
  });

  ensureEditableKeys();
  lastSnapshot = snapshot();
  loadState();
})();


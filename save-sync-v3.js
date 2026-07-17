(function () {
  var root = document.querySelector("main .reserveDetailWrapper");
  if (!root) return;

  var API = "/.netlify/functions/state";
  var ready = false;
  var timer = null;
  var lastSnapshot = "";

  var status = document.createElement("div");
  status.id = "autosave-status";
  status.style.cssText = [
    "position:fixed",
    "right:10px",
    "bottom:10px",
    "z-index:2147483647",
    "padding:8px 10px",
    "border-radius:14px",
    "background:rgba(0,0,0,.82)",
    "color:#fff",
    "font-size:12px",
    "font-weight:700",
    "line-height:1",
    "box-shadow:0 2px 10px rgba(0,0,0,.25)",
    "pointer-events:none"
  ].join(";");
  document.body.appendChild(status);

  function show(text, hold) {
    status.textContent = text;
    status.style.display = "block";
    clearTimeout(status._hide);
    status._hide = setTimeout(function () {
      status.style.display = "none";
    }, hold || 1400);
  }

  function leaves(box) {
    return Array.prototype.slice.call(box.querySelectorAll("*")).filter(function (el) {
      return !el.children.length &&
        el.textContent.trim() &&
        !el.matches("script,style,noscript,path");
    });
  }

  function setupEditable() {
    leaves(root).forEach(function (el, i) {
      if (el.closest(".seatInfoListWrapper .titleWrap button")) return;
      if (!el.dataset.sampleEdit) el.dataset.sampleEdit = String(i);
      el.contentEditable = "true";
      el.spellcheck = false;
    });
  }

  function seatTotal() {
    var list = root.querySelector(".seatInfoListWrapper .infoListWrap > ul");
    return list ? list.children.length : null;
  }

  function collect() {
    setupEditable();
    var texts = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-sample-edit]")).forEach(function (el) {
      texts[el.dataset.sampleEdit] = el.textContent || "";
    });
    return {
      texts: texts,
      images: {},
      seatTotal: seatTotal()
    };
  }

  function snap() {
    return JSON.stringify(collect());
  }

  function apply(data) {
    if (!data || !data.texts) return;
    Object.keys(data.texts).forEach(function (key) {
      var el = root.querySelector('[data-sample-edit="' + key.replace(/"/g, '\\"') + '"]');
      if (el) el.textContent = data.texts[key];
    });
  }

  function request(method, data) {
    var options = {
      method: method,
      cache: "no-store",
      headers: { "content-type": "application/json" }
    };
    if (data) options.body = JSON.stringify(data);
    return fetch(API + (method === "GET" ? "?t=" + Date.now() : ""), options);
  }

  function save() {
    if (!ready) return;
    var data = collect();
    var current = JSON.stringify(data);
    if (current === lastSnapshot) return;
    show("저장중", 1600);
    request("POST", data)
      .then(function (res) {
        if (!res.ok) throw new Error("save failed");
        lastSnapshot = current;
        show("저장됨", 1800);
      })
      .catch(function () {
        show("저장 실패", 2200);
      });
  }

  function schedule() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  }

  setupEditable();
  show("자동저장 켜짐", 2500);

  request("GET")
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      apply(data);
      ready = true;
      lastSnapshot = snap();
    })
    .catch(function () {
      ready = true;
      lastSnapshot = snap();
    });

  ["input", "keyup", "blur", "paste", "compositionend"].forEach(function (name) {
    root.addEventListener(name, schedule, true);
  });

  new MutationObserver(schedule).observe(root, {
    subtree: true,
    childList: true,
    characterData: true
  });

  setInterval(function () {
    if (!ready) return;
    if (snap() !== lastSnapshot) schedule();
  }, 1000);
})();

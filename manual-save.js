(function () {
  var root = document.querySelector(".reserveDetailWrapper") || document.querySelector("main") || document.body;
  if (!root) return;

  var API = "/.netlify/functions/state";

  function leaves(box) {
    return Array.prototype.slice.call(box.querySelectorAll("*")).filter(function (el) {
      return !el.children.length &&
        el.textContent.trim() &&
        !el.matches("script,style,noscript,path") &&
        !el.closest("#manual-save-panel");
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

  function collectState() {
    setupEditable();

    var texts = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-sample-edit]")).forEach(function (el) {
      if (!el.closest("#manual-save-panel")) {
        texts[el.dataset.sampleEdit] = el.textContent || "";
      }
    });

    var list = root.querySelector(".seatInfoListWrapper .infoListWrap > ul");
    return {
      texts: texts,
      images: {},
      seatTotal: list ? list.children.length : null
    };
  }

  function applyState(state) {
    if (!state || !state.texts) return;
    setupEditable();
    Object.keys(state.texts).forEach(function (key) {
      var el = root.querySelector('[data-sample-edit="' + key.replace(/"/g, '\\"') + '"]');
      if (el) el.textContent = state.texts[key];
    });
  }

  function request(url, options) {
    return fetch(url, options).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (_) {}
        if (!res.ok) throw new Error(data.error || "요청 실패");
        return data;
      });
    });
  }

  function makePanel() {
    if (document.getElementById("manual-save-panel")) return;

    var panel = document.createElement("section");
    panel.id = "manual-save-panel";
    panel.innerHTML = [
      '<div class="manual-save-inner">',
      '<strong class="manual-save-title">저장 관리</strong>',
      '<input id="manual-save-name" type="text" placeholder="저장 이름 예: 메모1">',
      '<button id="manual-save-button" type="button">저장하기</button>',
      '<select id="manual-save-list"><option value="">저장한 값 목록</option></select>',
      '<button id="manual-load-button" type="button">불러오기</button>',
      '<p id="manual-save-message"></p>',
      '</div>'
    ].join("");

    var style = document.createElement("style");
    style.textContent = [
      "#manual-save-panel{padding:18px 14px 28px;background:#f4f5f7;border-top:1px solid #ddd;}",
      "#manual-save-panel *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Roboto,'Apple SD Gothic Neo',sans-serif;}",
      ".manual-save-inner{max-width:720px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:8px;}",
      ".manual-save-title{font-size:16px;color:#111;margin-bottom:2px;}",
      "#manual-save-name,#manual-save-list{width:100%;height:42px;border:1px solid #c9cdd3;border-radius:6px;background:#fff;padding:0 10px;font-size:15px;color:#111;}",
      "#manual-save-button,#manual-load-button{width:100%;height:44px;border:0;border-radius:6px;background:#222;color:#fff;font-size:15px;font-weight:700;}",
      "#manual-load-button{background:#4154ff;}",
      "#manual-save-message{min-height:18px;margin:2px 0 0;font-size:13px;color:#333;}"
    ].join("");

    document.head.appendChild(style);
    document.body.appendChild(panel);
  }

  function message(text) {
    document.getElementById("manual-save-message").textContent = text;
  }

  function refreshList() {
    return request(API + "?list=1&t=" + Date.now(), { cache: "no-store" }).then(function (data) {
      var select = document.getElementById("manual-save-list");
      select.innerHTML = '<option value="">저장한 값 목록</option>';
      (data.list || []).forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.name;
        option.textContent = item.name;
        select.appendChild(option);
      });
    });
  }

  function saveCurrent() {
    var name = document.getElementById("manual-save-name").value.trim();
    if (!name) {
      message("저장 이름을 입력하세요. 예: 메모1");
      return;
    }

    message("저장중...");
    request(API, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "manual-save",
        name: name,
        state: collectState()
      })
    }).then(function () {
      message("저장됨: " + name);
      return refreshList();
    }).catch(function (error) {
      message("저장 실패: " + error.message);
    });
  }

  function loadSelected() {
    var name = document.getElementById("manual-save-list").value;
    if (!name) {
      message("불러올 저장값을 선택하세요.");
      return;
    }

    message("불러오는중...");
    request(API + "?name=" + encodeURIComponent(name) + "&t=" + Date.now(), { cache: "no-store" })
      .then(function (data) {
        applyState(data);
        document.getElementById("manual-save-name").value = name;
        message("불러옴: " + name);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (error) {
        message("불러오기 실패: " + error.message);
      });
  }

  setupEditable();
  makePanel();
  window.manualSaveCurrent = saveCurrent;
  window.manualLoadSelected = loadSelected;
  document.getElementById("manual-save-button").addEventListener("click", saveCurrent);
  document.getElementById("manual-load-button").addEventListener("click", loadSelected);
  document.getElementById("manual-save-list").addEventListener("change", loadSelected);
  refreshList().catch(function () {
    message("저장 목록을 불러오지 못했습니다.");
  });
})();

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store"
};

module.exports = async function handler(req, res) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      await handleGET(req, res);
      return;
    }

    if (req.method === "POST") {
      await handlePOST(req, res);
      return;
    }

    sendJSON(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJSON(res, 500, { error: error.message || "Server error" });
  }
};

async function handleGET(req, res) {
  const query = req.query || {};

  if (query.list === "1") {
    const list = await listManualSaves();
    if (query.frame === "1") {
      sendFrame(res, `parent.manualReceiveList && parent.manualReceiveList(${safeScriptJSON(list)});`);
      return;
    }
    sendJSONP(req, res, 200, { list });
    return;
  }

  if (query.name) {
    const name = decodeMaybe(String(query.name));
    const item = await getManualSave(name);
    if (query.frame === "1") {
      sendFrame(
        res,
        item
          ? `parent.manualApplyLoaded && parent.manualApplyLoaded(${safeScriptJSON(item)});`
          : `parent.manualMsg && parent.manualMsg("불러오기 실패");`
      );
      return;
    }
    sendJSONP(req, res, item ? 200 : 404, item || { error: "Not found" });
    return;
  }

  sendJSON(res, 200, (await readJSON("data/shared-state.json")) || { texts: {}, images: {}, seatTotal: null });
}

async function handlePOST(req, res) {
  const data = parseBody(req);

  if (data && data.mode === "manual-save") {
    const name = String(data.name || "").trim().slice(0, 80);
    if (!name) {
      sendJSON(res, 400, { error: "Name is required" });
      return;
    }

    const state = data.state || {};
    const item = {
      name,
      texts: state && typeof state.texts === "object" && !Array.isArray(state.texts) ? state.texts : {},
      textList: Array.isArray(state.textList) ? state.textList : [],
      patches: Array.isArray(state.patches) ? state.patches : [],
      imagePatches: Array.isArray(state.imagePatches) ? state.imagePatches : [],
      html: typeof state.html === "string" ? state.html : "",
      images: {},
      seatTotal: Number.isFinite(Number(state.seatTotal)) ? Math.max(1, Math.min(4, Number(state.seatTotal))) : null,
      updatedAt: new Date().toISOString()
    };

    await writeJSON(savePathForName(name), item, `save ticket state: ${name}`);
    sendJSON(res, 200, { ok: true, name, updatedAt: item.updatedAt });
    return;
  }

  if (data && data.mode === "manual-delete") {
    const name = String(data.name || "").trim().slice(0, 80);
    if (!name) {
      sendJSON(res, 400, { error: "Name is required" });
      return;
    }

    await deleteFile(savePathForName(name), `delete ticket state: ${name}`);
    sendJSON(res, 200, { ok: true, deleted: name });
    return;
  }

  const safeData = {
    texts: data && typeof data.texts === "object" && !Array.isArray(data.texts) ? data.texts : {},
    images: data && typeof data.images === "object" && !Array.isArray(data.images) ? data.images : {},
    seatTotal: Number.isFinite(Number(data.seatTotal)) ? Math.max(1, Math.min(4, Number(data.seatTotal))) : null,
    updatedAt: new Date().toISOString()
  };
  await writeJSON("data/shared-state.json", safeData, "save shared ticket state");
  sendJSON(res, 200, { ok: true, updatedAt: safeData.updatedAt });
}

async function listManualSaves() {
  const files = await listDirectory("data/saves");
  const items = await Promise.all(
    files
      .filter((file) => file && file.type === "file" && file.name.endsWith(".json"))
      .map(async (file) => {
        try {
          const item = await readJSON(file.path);
          return item && item.name ? { name: item.name, updatedAt: item.updatedAt || null } : null;
        } catch (_) {
          return null;
        }
      })
  );

  return items
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function getManualSave(name) {
  return readJSON(savePathForName(name));
}

function savePathForName(name) {
  return `data/saves/${base64url(name)}.json`;
}

function base64url(value) {
  return Buffer.from(String(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseBody(req) {
  const body = req.body || {};
  const contentType = String(req.headers["content-type"] || "");

  if (typeof body === "object" && !Buffer.isBuffer(body)) {
    if (body.payload) return JSON.parse(body.payload);
    return body;
  }
  const raw = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "{}");

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    if (params.get("payload")) return JSON.parse(params.get("payload"));
    return Object.fromEntries(params.entries());
  }

  return JSON.parse(raw || "{}");
}

function sendJSONP(req, res, statusCode, body) {
  const callback = req.query && req.query.callback ? String(req.query.callback).replace(/[^\w$.]/g, "") : "";
  if (callback) {
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.statusCode = statusCode;
    res.end(`${callback}(${JSON.stringify(body)});`);
    return;
  }
  sendJSON(res, statusCode, body);
}

function sendJSON(res, statusCode, body) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

function sendFrame(res, script) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.statusCode = 200;
  res.end(`<!doctype html><meta charset="utf-8"><script>${script}</script>`);
}

function safeScriptJSON(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function decodeMaybe(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function githubConfig() {
  const token = cleanEnv(process.env.GITHUB_TOKEN);
  const repo = cleanEnv(process.env.GITHUB_REPO);
  if (!token || !repo) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO are required");
  }
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("GITHUB_REPO must be owner/repo");
  return {
    token,
    owner,
    name,
    branch: cleanEnv(process.env.GITHUB_BRANCH) || "main"
  };
}

function cleanEnv(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

async function githubFetch(path, options = {}) {
  const cfg = githubConfig();
  const response = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.name}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${cfg.token}`,
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function readJSON(filePath) {
  const cfg = githubConfig();
  const data = await githubFetch(`/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (!data || !data.content) return null;
  const json = Buffer.from(String(data.content).replace(/\s/g, ""), "base64").toString("utf8");
  return JSON.parse(json);
}

async function listDirectory(dirPath) {
  const cfg = githubConfig();
  const data = await githubFetch(`/contents/${encodeURIComponentPath(dirPath)}?ref=${encodeURIComponent(cfg.branch)}`);
  return Array.isArray(data) ? data : [];
}

async function writeJSON(filePath, value, message) {
  const cfg = githubConfig();
  const current = await githubFetch(`/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(cfg.branch)}`);
  const body = {
    message,
    content: Buffer.from(JSON.stringify(value), "utf8").toString("base64"),
    branch: cfg.branch
  };
  if (current && current.sha) body.sha = current.sha;
  await githubFetch(`/contents/${encodeURIComponentPath(filePath)}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function deleteFile(filePath, message) {
  const cfg = githubConfig();
  const current = await githubFetch(`/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (!current || !current.sha) return;
  await githubFetch(`/contents/${encodeURIComponentPath(filePath)}`, {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha: current.sha,
      branch: cfg.branch
    })
  });
}

function encodeURIComponentPath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

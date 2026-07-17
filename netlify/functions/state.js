const { connectLambda, getStore } = require("@netlify/blobs");
const fs = require("node:fs/promises");
const path = require("node:path");

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const store = getSharedStore();
  const key = "shared-state";
  const manualKey = "manual-saves";

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (params.list === "1") {
      const saves = await store.get(manualKey, { type: "json" });
      const items = saves && saves.items ? saves.items : {};
      const list = Object.keys(items)
        .map((name) => ({ name, updatedAt: items[name].updatedAt || null }))
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

      if (params.frame === "1") {
        return respondFrame(`parent.manualReceiveList && parent.manualReceiveList(${safeScriptJSON(list)});`);
      }

      return respondJSON(params, {
        statusCode: 200,
        body: { list }
      });
    }

    if (params.name) {
      let requestedName = params.name;
      try {
        requestedName = decodeURIComponent(requestedName);
      } catch (_) {}
      const saves = await store.get(manualKey, { type: "json" });
      const item = saves && saves.items ? saves.items[requestedName] : null;

      if (params.frame === "1") {
        return respondFrame(
          item
            ? `parent.manualApplyLoaded && parent.manualApplyLoaded(${safeScriptJSON(item)});`
            : `parent.manualMsg && parent.manualMsg("불러오기 실패");`
        );
      }

      return respondJSON(params, {
        statusCode: item ? 200 : 404,
        body: item || { error: "Not found" }
      });
    }

    const data = await store.get(key, { type: "json" });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data || { texts: {}, images: {}, seatTotal: null })
    };
  }

  if (event.httpMethod === "POST") {
    if ((event.body || "").length > 6000000) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: "Payload too large" })
      };
    }

    let data;
    try {
      data = parseBody(event);
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON" })
      };
    }

    if (data && data.mode === "manual-save") {
      const name = String(data.name || "").trim().slice(0, 80);
      if (!name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Name is required" })
        };
      }

      const saves = (await store.get(manualKey, { type: "json" })) || { items: {} };
      const state = data.state || {};
      saves.items = saves.items || {};
      saves.items[name] = {
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

      await store.setJSON(manualKey, saves);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, name, updatedAt: saves.items[name].updatedAt })
      };
    }

    if (data && data.mode === "manual-delete") {
      const name = String(data.name || "").trim().slice(0, 80);
      if (!name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Name is required" })
        };
      }

      const saves = (await store.get(manualKey, { type: "json" })) || { items: {} };
      saves.items = saves.items || {};
      delete saves.items[name];
      await store.setJSON(manualKey, saves);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, deleted: name })
      };
    }

    const safeData = {
      texts: data && typeof data.texts === "object" && !Array.isArray(data.texts) ? data.texts : {},
      images: data && typeof data.images === "object" && !Array.isArray(data.images) ? data.images : {},
      seatTotal: Number.isFinite(Number(data.seatTotal)) ? Math.max(1, Math.min(4, Number(data.seatTotal))) : null,
      updatedAt: new Date().toISOString()
    };

    await store.setJSON(key, safeData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, updatedAt: safeData.updatedAt })
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: "Method not allowed" })
  };
};

function respondJSON(params, response) {
  const callback = params && params.callback ? String(params.callback).replace(/[^\w$.]/g, "") : "";
  if (callback) {
    return {
      statusCode: response.statusCode,
      headers: {
        ...headers,
        "content-type": "application/javascript; charset=utf-8"
      },
      body: `${callback}(${JSON.stringify(response.body)});`
    };
  }

  return {
    statusCode: response.statusCode,
    headers,
    body: JSON.stringify(response.body)
  };
}

function respondFrame(script) {
  return {
    statusCode: 200,
    headers: {
      ...headers,
      "content-type": "text/html; charset=utf-8"
    },
    body: `<!doctype html><meta charset="utf-8"><script>${script}</script>`
  };
}

function safeScriptJSON(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function parseBody(event) {
  const body = event.body || "{}";
  const contentType = (event.headers && (event.headers["content-type"] || event.headers["Content-Type"])) || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    if (params.get("payload")) return JSON.parse(params.get("payload"));
    return Object.fromEntries(params.entries());
  }

  return JSON.parse(body);
}

function getSharedStore() {
  try {
    return getStore("ticket-sample");
  } catch (error) {
    if (process.env.NETLIFY_DEV !== "true" && process.env.NETLIFY_LOCAL !== "true") {
      throw error;
    }

    const file = path.join(process.cwd(), ".netlify", "local-ticket-state.json");
    return {
      async get() {
        try {
          return JSON.parse(await fs.readFile(file, "utf8"));
        } catch (_) {
          return null;
        }
      },
      async setJSON(_, data) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(data), "utf8");
      }
    };
  }
}

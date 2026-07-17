module.exports = async function handler(req, res) {
  try {
    const token = cleanEnv(process.env.GITHUB_TOKEN);
    const repo = cleanEnv(process.env.GITHUB_REPO);
    res.setHeader("content-type", "application/json; charset=utf-8");
    if (!token || !repo) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: "missing env", hasToken: !!token, repo: repo || null }));
      return;
    }
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28"
      }
    });
    const text = await response.text();
    res.statusCode = response.ok ? 200 : response.status;
    res.end(JSON.stringify({ ok: response.ok, status: response.status, sample: text.slice(0, 120) }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
};

function cleanEnv(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

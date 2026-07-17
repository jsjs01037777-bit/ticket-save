module.exports = async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    hasToken: Boolean(process.env.GITHUB_TOKEN),
    repo: process.env.GITHUB_REPO || null
  }));
};

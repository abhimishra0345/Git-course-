const { handler } = require("../netlify/functions/api");

module.exports = async function vercelHandler(req, res) {
  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path
    : typeof req.query.path === "string" && req.query.path
      ? [req.query.path]
      : [];
  const eventPath = `/api/${pathSegments.join("/")}`.replace(/\/+$/, "") || "/api";
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});

  const response = await handler({
    path: eventPath,
    httpMethod: req.method,
    headers: req.headers || {},
    body,
  });

  const headers = response.headers || {};
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined) {
      res.setHeader(key, value);
    }
  });

  res.status(response.statusCode || 200).send(response.body || "");
};

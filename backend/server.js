const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const DELIVERY_FEE = 40;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const restaurantsPath = path.join(DATA_DIR, "restaurants.json");
const usersPath = path.join(DATA_DIR, "users.json");
const ordersPath = path.join(DATA_DIR, "orders.json");
const sessionsPath = path.join(DATA_DIR, "sessions.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      sendNotFound(res);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": content.length,
    });
    res.end(content);
  } catch {
    sendNotFound(res);
  }
}

function sendNotFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const hash = crypto.scryptSync(password, user.passwordSalt, 64).toString("hex");
  return hash === user.passwordHash;
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice("Bearer ".length).trim();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function getSessionUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const sessions = readJson(sessionsPath, []);
  const users = readJson(usersPath, []);
  const session = sessions.find((entry) => entry.token === token);
  if (!session) {
    return null;
  }

  const user = users.find((entry) => entry.id === session.userId);
  return user ? { token, user } : null;
}

function buildOrderItems(items, restaurants) {
  const built = [];

  items.forEach((entry) => {
    for (const restaurant of restaurants) {
      const menuItem = restaurant.menu.find((item) => item.id === entry.menuId);
      if (menuItem) {
        built.push({
          menuId: menuItem.id,
          name: menuItem.name,
          quantity: entry.quantity,
          price: menuItem.price,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
        });
        break;
      }
    }
  });

  return built;
}

function serveStatic(req, res, pathname) {
  const targetPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(targetPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, normalized);

  if (!filePath.startsWith(ROOT)) {
    sendNotFound(res);
    return;
  }

  if (!fs.existsSync(filePath)) {
    sendFile(res, path.join(ROOT, "index.html"));
    return;
  }

  sendFile(res, filePath);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (pathname === "/api/restaurants" && req.method === "GET") {
    const restaurants = readJson(restaurantsPath, []);
    sendJson(res, 200, { restaurants });
    return;
  }

  if (pathname === "/api/auth/signup" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!name || !email || password.length < 6) {
        sendJson(res, 400, { error: "Name, email, and password are required. Password must be at least 6 characters." });
        return;
      }

      const users = readJson(usersPath, []);
      if (users.some((user) => user.email === email)) {
        sendJson(res, 409, { error: "An account with this email already exists." });
        return;
      }

      const passwordMeta = hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: passwordMeta.hash,
        passwordSalt: passwordMeta.salt,
        createdAt: new Date().toISOString(),
      };

      users.push(user);
      writeJson(usersPath, users);

      const sessions = readJson(sessionsPath, []);
      const token = createToken();
      sessions.push({
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
      });
      writeJson(sessionsPath, sessions);

      sendJson(res, 201, { user: sanitizeUser(user), token });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Unable to create account." });
    }
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      const users = readJson(usersPath, []);
      const user = users.find((entry) => entry.email === email);

      if (!user || !verifyPassword(password, user)) {
        sendJson(res, 401, { error: "Invalid email or password." });
        return;
      }

      const sessions = readJson(sessionsPath, []);
      const token = createToken();
      sessions.push({
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
      });
      writeJson(sessionsPath, sessions);

      sendJson(res, 200, { user: sanitizeUser(user), token });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Unable to login." });
    }
    return;
  }

  if (pathname === "/api/session" && req.method === "GET") {
    const session = getSessionUser(req);
    if (!session) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    sendJson(res, 200, { user: sanitizeUser(session.user) });
    return;
  }

  if (pathname === "/api/orders" && req.method === "GET") {
    const session = getSessionUser(req);
    if (!session) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    const orders = readJson(ordersPath, []).filter((order) => order.userId === session.user.id);
    sendJson(res, 200, { orders: orders.reverse() });
    return;
  }

  if (pathname === "/api/orders" && req.method === "POST") {
    try {
      const session = getSessionUser(req);
      if (!session) {
        sendJson(res, 401, { error: "Unauthorized." });
        return;
      }

      const body = await parseBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        sendJson(res, 400, { error: "At least one item is required." });
        return;
      }

      const restaurants = readJson(restaurantsPath, []);
      const builtItems = buildOrderItems(
        items.map((item) => ({
          menuId: String(item.menuId || ""),
          quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        })),
        restaurants
      );

      if (!builtItems.length) {
        sendJson(res, 400, { error: "No valid menu items found in the order." });
        return;
      }

      const subtotal = builtItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const order = {
        id: `QB${Date.now()}`,
        userId: session.user.id,
        status: "awaiting_payment",
        items: builtItems,
        subtotal,
        deliveryFee: DELIVERY_FEE,
        total: subtotal + DELIVERY_FEE,
        createdAt: new Date().toISOString(),
      };

      const orders = readJson(ordersPath, []);
      orders.push(order);
      writeJson(ordersPath, orders);

      sendJson(res, 201, { order });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Unable to place order." });
    }
    return;
  }

  const paymentMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment$/);
  if (paymentMatch && req.method === "POST") {
    try {
      const session = getSessionUser(req);
      if (!session) {
        sendJson(res, 401, { error: "Unauthorized." });
        return;
      }

      const body = await parseBody(req);
      const paymentReference = String(body.paymentReference || "").trim();
      if (!paymentReference) {
        sendJson(res, 400, { error: "Payment reference is required." });
        return;
      }

      const orderId = paymentMatch[1];
      const orders = readJson(ordersPath, []);
      const order = orders.find((entry) => entry.id === orderId && entry.userId === session.user.id);

      if (!order) {
        sendJson(res, 404, { error: "Order not found." });
        return;
      }

      order.status = "payment_submitted";
      order.paymentReference = paymentReference;
      order.paymentSubmittedAt = new Date().toISOString();
      writeJson(ordersPath, orders);

      sendJson(res, 200, { order });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Unable to submit payment." });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`QuickBite server running on http://localhost:${PORT}`);
});

const crypto = require("crypto");
const restaurants = require("../../backend/data/restaurants.json");

const DELIVERY_FEE = 40;
const GITHUB_REPO = process.env.GITHUB_REPO || "abhimishra0345/Git-course-";
const DATA_BRANCH = process.env.DATA_BRANCH || "app-data";
const DATA_PATH = process.env.DATA_PATH || ".quickbite/store.enc";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const STORE_SECRET = process.env.STORE_SECRET || "";

exports.handler = async function handler(event) {
  try {
    const path = event.path.replace(/^\/\.netlify\/functions\/api/, "").replace(/\/$/, "") || "/";

    if (path === "/api/health" && event.httpMethod === "GET") {
      return json(200, {
        status: "ok",
        storageConfigured: Boolean(GITHUB_TOKEN && STORE_SECRET),
      });
    }

    if (path === "/api/restaurants" && event.httpMethod === "GET") {
      return json(200, { restaurants });
    }

    if (path === "/api/auth/signup" && event.httpMethod === "POST") {
      const body = parseBody(event.body);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!name || !email || password.length < 6) {
        return json(400, { error: "Name, email, and password are required. Password must be at least 6 characters." });
      }

      const users = await readCollection("users");
      if (users.some((user) => user.email === email)) {
        return json(409, { error: "An account with this email already exists." });
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
      await writeCollection("users", users);

      const sessions = await readCollection("sessions");
      const token = createToken();
      sessions.push({
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
      });
      await writeCollection("sessions", sessions);

      return json(201, { user: sanitizeUser(user), token });
    }

    if (path === "/api/auth/login" && event.httpMethod === "POST") {
      const body = parseBody(event.body);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const users = await readCollection("users");
      const user = users.find((entry) => entry.email === email);

      if (!user || !verifyPassword(password, user)) {
        return json(401, { error: "Invalid email or password." });
      }

      const sessions = await readCollection("sessions");
      const token = createToken();
      sessions.push({
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
      });
      await writeCollection("sessions", sessions);

      return json(200, { user: sanitizeUser(user), token });
    }

    if (path === "/api/session" && event.httpMethod === "GET") {
      const session = await getSessionUser(event.headers.authorization);
      if (!session) {
        return json(401, { error: "Unauthorized." });
      }

      return json(200, { user: sanitizeUser(session.user) });
    }

    if (path === "/api/orders" && event.httpMethod === "GET") {
      const session = await getSessionUser(event.headers.authorization);
      if (!session) {
        return json(401, { error: "Unauthorized." });
      }

      const orders = await readCollection("orders");
      return json(200, {
        orders: orders.filter((order) => order.userId === session.user.id).reverse(),
      });
    }

    if (path === "/api/orders" && event.httpMethod === "POST") {
      const session = await getSessionUser(event.headers.authorization);
      if (!session) {
        return json(401, { error: "Unauthorized." });
      }

      const body = parseBody(event.body);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        return json(400, { error: "At least one item is required." });
      }

      const builtItems = buildOrderItems(
        items.map((item) => ({
          menuId: String(item.menuId || ""),
          quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        }))
      );

      if (!builtItems.length) {
        return json(400, { error: "No valid menu items found in the order." });
      }

      const subtotal = builtItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const order = {
        id: `QB${Date.now()}`,
        userId: session.user.id,
        status: "confirmed",
        items: builtItems,
        subtotal,
        deliveryFee: DELIVERY_FEE,
        total: subtotal + DELIVERY_FEE,
        createdAt: new Date().toISOString(),
      };

      const orders = await readCollection("orders");
      orders.push(order);
      await writeCollection("orders", orders);

      return json(201, { order });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    return json(500, { error: error.message || "Server error" });
  }
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function parseBody(rawBody) {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function readCollection(key) {
  const { data } = await readStore();
  return Array.isArray(data[key]) ? data[key] : [];
}

async function writeCollection(key, value) {
  const current = await readStore();
  current.data[key] = value;
  await writeStore(current.data, current.sha, `Update ${key}`);
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

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

async function getSessionUser(authorizationHeader = "") {
  if (!authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  const sessions = await readCollection("sessions");
  const users = await readCollection("users");
  const session = sessions.find((entry) => entry.token === token);
  const user = session ? users.find((entry) => entry.id === session.userId) : null;

  if (!session || !user) {
    return null;
  }

  return { session, user };
}

function buildOrderItems(items) {
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

async function readStore() {
  ensureStorageConfig();

  const response = await githubRequest(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_PATH}?ref=${encodeURIComponent(DATA_BRANCH)}`,
    { method: "GET" },
    true
  );

  if (response.status === 404) {
    return {
      sha: null,
      data: {
        users: [],
        sessions: [],
        orders: [],
      },
    };
  }

  if (!response.ok) {
    throw new Error(`Unable to read app storage: ${response.status}`);
  }

  const payload = await response.json();
  const content = Buffer.from(String(payload.content || "").replace(/\n/g, ""), "base64").toString("utf8");

  return {
    sha: payload.sha,
    data: decryptStore(content),
  };
}

async function writeStore(data, sha, message) {
  ensureStorageConfig();

  const encrypted = encryptStore(data);
  const body = {
    message,
    branch: DATA_BRANCH,
    content: Buffer.from(encrypted, "utf8").toString("base64"),
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await githubRequest(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_PATH}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Unable to write app storage: ${response.status} ${payload}`);
  }
}

function ensureStorageConfig() {
  if (!GITHUB_TOKEN || !STORE_SECRET) {
    throw new Error("Deployed storage is not configured.");
  }
}

function encryptStore(data) {
  const key = crypto.createHash("sha256").update(STORE_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function decryptStore(payload) {
  const parsed = JSON.parse(payload);
  const key = crypto.createHash("sha256").update(STORE_SECRET).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

async function githubRequest(url, options, allowNotFound = false) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "quickbite-netlify-function",
      ...(options && options.headers ? options.headers : {}),
    },
  });

  if (allowNotFound && response.status === 404) {
    return response;
  }

  return response;
}

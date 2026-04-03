const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const restaurants = require("../../backend/data/restaurants.json");
const seedUsers = require("../../backend/data/users.json");
const seedOrders = require("../../backend/data/orders.json");
const seedSessions = require("../../backend/data/sessions.json");
const seedAdminSessions = require("../../backend/data/admin-sessions.json");

const DELIVERY_FEE = 40;
const GITHUB_REPO = process.env.GITHUB_REPO || "abhimishra0345/QuickBite";
const DATA_BRANCH = process.env.DATA_BRANCH || "app-data";
const DATA_PATH = process.env.DATA_PATH || ".quickbite/store.enc";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const STORE_SECRET = process.env.STORE_SECRET || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@quickbite.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";
const LOCAL_STORE_PATH = process.env.LOCAL_STORE_PATH || path.join("/tmp", "quickbite-store.json");

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
        lastLoginAt: new Date().toISOString(),
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

      user.lastLoginAt = new Date().toISOString();
      await writeCollection("users", users);

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

    if (path === "/api/admin/login" && event.httpMethod === "POST") {
      const body = parseBody(event.body);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
        return json(401, { error: "Invalid admin credentials." });
      }

      const token = createToken();
      const adminSessions = await readCollection("adminSessions");
      adminSessions.push({
        token,
        createdAt: new Date().toISOString(),
      });
      await writeCollection("adminSessions", adminSessions);

      const users = await readCollection("users");
      const orders = await readCollection("orders");
      return json(200, {
        token,
        orders: buildAdminOrders(orders, users),
      });
    }

    if (path === "/api/admin/orders" && event.httpMethod === "GET") {
      const isAdmin = await getAdminSession(event.headers.authorization);
      if (!isAdmin) {
        return json(401, { error: "Unauthorized." });
      }

      const users = await readCollection("users");
      const orders = await readCollection("orders");
      return json(200, {
        orders: buildAdminOrders(orders, users),
      });
    }

    if (path === "/api/orders" && event.httpMethod === "GET") {
      const session = await getSessionUser(event.headers.authorization);
      if (!session) {
        return json(401, { error: "Unauthorized." });
      }

      const orders = await readCollection("orders");
      return json(200, {
        orders: orders
          .filter((order) => order.userId === session.user.id)
          .map((order) => hydrateOrder(order))
          .reverse(),
      });
    }

    if (path === "/api/orders" && event.httpMethod === "POST") {
      const session = await getSessionUser(event.headers.authorization);
      if (!session) {
        return json(401, { error: "Unauthorized." });
      }

      const body = parseBody(event.body);
      const items = Array.isArray(body.items) ? body.items : [];
      const customer = sanitizeCustomer(body.customer || {});
      if (!items.length) {
        return json(400, { error: "At least one item is required." });
      }

      if (customer.phone.length !== 10 || customer.address.length < 10) {
        return json(400, { error: "Valid phone number and delivery address are required." });
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
        status: "awaiting_payment",
        items: builtItems,
        customer,
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

    const paymentMatch = path.match(/^\/api\/orders\/([^/]+)\/payment$/);
    if (paymentMatch && event.httpMethod === "POST") {
      const session = await getSessionUser(event.headers.authorization);
      if (!session) {
        return json(401, { error: "Unauthorized." });
      }

      const body = parseBody(event.body);
      const paymentReference = String(body.paymentReference || "").trim();
      if (!paymentReference) {
        return json(400, { error: "Payment reference is required." });
      }

      const orders = await readCollection("orders");
      const order = orders.find((entry) => entry.id === paymentMatch[1] && entry.userId === session.user.id);

      if (!order) {
        return json(404, { error: "Order not found." });
      }

      order.status = "payment_submitted";
      order.paymentReference = paymentReference;
      order.paymentSubmittedAt = new Date().toISOString();
      await writeCollection("orders", orders);

      return json(200, { order });
    }

    const adminStatusMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
    if (adminStatusMatch && event.httpMethod === "POST") {
      const isAdmin = await getAdminSession(event.headers.authorization);
      if (!isAdmin) {
        return json(401, { error: "Unauthorized." });
      }

      const body = parseBody(event.body);
      const status = String(body.status || "").trim();
      if (!status) {
        return json(400, { error: "Status is required." });
      }

      const orders = await readCollection("orders");
      const order = orders.find((entry) => entry.id === adminStatusMatch[1]);

      if (!order) {
        return json(404, { error: "Order not found." });
      }

      order.status = status;
      order.updatedAt = new Date().toISOString();
      await writeCollection("orders", orders);

      const users = await readCollection("users");
      return json(200, {
        orders: buildAdminOrders(orders, users),
      });
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

function sanitizeCustomer(customer) {
  return {
    phone: String(customer?.phone || "").replace(/\D/g, "").slice(0, 10),
    address: String(customer?.address || "").trim(),
    note: String(customer?.note || "").trim(),
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

async function getAdminSession(authorizationHeader = "") {
  if (!authorizationHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) {
    return false;
  }

  const sessions = await readCollection("adminSessions");
  return sessions.some((entry) => entry.token === token);
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

function resolveOrderItemRestaurant(item) {
  if (item?.restaurantId) {
    const restaurant = restaurants.find((entry) => entry.id === item.restaurantId);
    if (restaurant) {
      return restaurant;
    }
  }

  return restaurants.find((restaurant) =>
    Array.isArray(restaurant.menu) &&
    restaurant.menu.some((menuItem) => menuItem.id === item?.menuId)
  );
}

function hydrateOrder(order) {
  return {
    ...order,
    items: Array.isArray(order?.items)
      ? order.items.map((item) => {
          const restaurant = resolveOrderItemRestaurant(item);
          const menuItem = restaurant?.menu?.find((entry) => entry.id === item?.menuId);

          return {
            ...item,
            restaurantId: item?.restaurantId || restaurant?.id || "",
            restaurantName: item?.restaurantName || restaurant?.name || "Restaurant unavailable",
            name: item?.name || menuItem?.name || "Item unavailable",
            price: Number(item?.price ?? menuItem?.price ?? 0),
          };
        })
      : [],
  };
}

function buildAdminOrders(orders, users) {
  return orders
    .slice()
    .reverse()
    .map((order) => {
      const user = users.find((entry) => entry.id === order.userId);
      return {
        ...hydrateOrder(order),
        userName: user ? user.name : "Unknown user",
        userEmail: user ? user.email : "Unknown email",
      };
    });
}

async function readStore() {
  if (!hasRemoteStorageConfig()) {
    return {
      sha: null,
      data: await readLocalStore(),
    };
  }

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
  if (!hasRemoteStorageConfig()) {
    await writeLocalStore(data);
    return;
  }

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

function hasRemoteStorageConfig() {
  return Boolean(GITHUB_TOKEN && STORE_SECRET);
}

async function readLocalStore() {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeStoreData(parsed);
  } catch {
    const initial = createInitialStoreData();
    await writeLocalStore(initial);
    return initial;
  }
}

async function writeLocalStore(data) {
  const normalized = normalizeStoreData(data);
  await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(normalized, null, 2), "utf8");
}

function createInitialStoreData() {
  return normalizeStoreData({
    users: seedUsers,
    sessions: seedSessions,
    orders: seedOrders,
    adminSessions: seedAdminSessions,
  });
}

function normalizeStoreData(data) {
  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    adminSessions: Array.isArray(data.adminSessions) ? data.adminSessions : [],
  };
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

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const restaurants = require("../../backend/data/restaurants.json");

const DELIVERY_FEE = 40;
const store = getStore({ name: "quickbite", consistency: "strong" });

exports.handler = async function handler(event) {
  try {
    const path = event.path.replace(/^\/\.netlify\/functions\/api/, "").replace(/\/$/, "") || "/";

    if (path === "/api/health" && event.httpMethod === "GET") {
      return json(200, { status: "ok" });
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
  return (await store.get(key, { type: "json" })) || [];
}

async function writeCollection(key, value) {
  await store.setJSON(key, value);
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

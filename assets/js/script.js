document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "/api";
  const DELIVERY_FEE = 40;
  const STORAGE_KEYS = {
    cart: "quickbite-cart",
    token: "quickbite-token",
  };

  const searchForm = document.querySelector(".search-form");
  const searchInput = document.querySelector("#search");
  const restaurantList = document.querySelector("#restaurant-list");
  const filterGroup = document.querySelector("#filter-group");
  const resultsSummary = document.querySelector("#results-summary");
  const featuredSpotlight = document.querySelector("#featured-spotlight");
  const restaurantCount = document.querySelector("#restaurant-count");
  const menuCount = document.querySelector("#menu-count");
  const deliveryTime = document.querySelector("#delivery-time");
  const cartItems = document.querySelector("#cart-items");
  const subtotalAmount = document.querySelector("#subtotal-amount");
  const deliveryFee = document.querySelector("#delivery-fee");
  const grandTotal = document.querySelector("#grand-total");
  const cartMessage = document.querySelector("#cart-message");
  const checkoutButton = document.querySelector("#checkout-button");
  const signupForm = document.querySelector("#signup-form");
  const loginForm = document.querySelector("#login-form");
  const authUserStatus = document.querySelector("#auth-user-status");
  const logoutButton = document.querySelector("#logout-button");
  const orderHistory = document.querySelector("#order-history");
  const mobileNavToggle = document.querySelector("#mobile-nav-toggle");
  const paymentModal = document.querySelector("#payment-modal");
  const paymentAmount = document.querySelector("#payment-amount");
  const paymentForm = document.querySelector("#payment-form");
  const paymentReference = document.querySelector("#payment-reference");
  const paymentMessage = document.querySelector("#payment-message");
  const paymentClose = document.querySelector("#payment-close");
  const navLinks = Array.from(document.querySelectorAll('.nav-list a[href^="#"]'));

  if (
    !searchForm ||
    !searchInput ||
    !restaurantList ||
    !filterGroup ||
    !cartItems ||
    !checkoutButton
  ) {
    return;
  }

  const state = {
    restaurants: [],
    filters: [],
    activeFilter: "All",
    query: "",
    cart: loadJSON(STORAGE_KEYS.cart, {}),
    token: localStorage.getItem(STORAGE_KEYS.token) || "",
    user: null,
    orders: [],
    pendingOrder: null,
  };

  attachStatus(signupForm);
  attachStatus(loginForm);

  initialize();

  async function initialize() {
    bindEvents();
    await Promise.all([loadRestaurants(), restoreSession()]);
    renderAll();
  }

  function bindEvents() {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.query = searchInput.value.trim();
      renderRestaurants();
    });

    searchInput.addEventListener("input", () => {
      state.query = searchInput.value.trim();
      renderRestaurants();
    });

    filterGroup.addEventListener("click", (event) => {
      const chip = event.target.closest(".filter-chip");
      if (!chip) {
        return;
      }
      state.activeFilter = chip.dataset.filter || "All";
      renderFilters();
      renderRestaurants();
    });

    restaurantList.addEventListener("click", (event) => {
      const button = event.target.closest(".add-to-cart");
      if (!button) {
        return;
      }
      const menuId = button.dataset.menuId;
      if (!menuId) {
        return;
      }
      state.cart[menuId] = (state.cart[menuId] || 0) + 1;
      persistCart();
      renderCart();
      setCartMessage("Item added to cart.");
    });

    cartItems.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cart-action]");
      if (!button) {
        return;
      }

      const menuId = button.dataset.menuId;
      const action = button.dataset.cartAction;

      if (!menuId || !action) {
        return;
      }

      const current = state.cart[menuId] || 0;

      if (action === "increase") {
        state.cart[menuId] = current + 1;
      } else if (action === "decrease") {
        const next = current - 1;
        if (next > 0) {
          state.cart[menuId] = next;
        } else {
          delete state.cart[menuId];
        }
      } else if (action === "remove") {
        delete state.cart[menuId];
      }

      persistCart();
      renderCart();
    });

    signupForm?.addEventListener("submit", handleSignup);
    loginForm?.addEventListener("submit", handleLogin);
    logoutButton?.addEventListener("click", handleLogout);
    checkoutButton.addEventListener("click", handleCheckout);
    paymentForm?.addEventListener("submit", handlePaymentSubmit);
    paymentClose?.addEventListener("click", closePaymentModal);
    paymentModal?.addEventListener("click", (event) => {
      if (event.target === paymentModal) {
        closePaymentModal();
      }
    });

    mobileNavToggle?.addEventListener("click", () => {
      const nextExpanded = mobileNavToggle.getAttribute("aria-expanded") !== "true";
      mobileNavToggle.setAttribute("aria-expanded", String(nextExpanded));
      document.body.classList.toggle("nav-open", nextExpanded);
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const targetId = link.getAttribute("href");
        if (!targetId || !targetId.startsWith("#")) {
          return;
        }
        const target = document.querySelector(targetId);
        if (!target) {
          return;
        }
        event.preventDefault();
        document.body.classList.remove("nav-open");
        mobileNavToggle?.setAttribute("aria-expanded", "false");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  async function loadRestaurants() {
    try {
      const response = await fetch(`${API_BASE}/restaurants`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load restaurants.");
      }

      state.restaurants = payload.restaurants || [];
      state.filters = ["All", ...new Set(state.restaurants.map((item) => item.cuisine))];
    } catch (error) {
      state.restaurants = [];
      state.filters = ["All"];
      setCartMessage(error.message || "Unable to connect to backend.");
    }
  }

  async function restoreSession() {
    if (!state.token) {
      renderAuthState();
      renderOrders();
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/session`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Session expired.");
      }

      state.user = payload.user || null;
      await loadOrders();
    } catch {
      state.token = "";
      state.user = null;
      state.orders = [];
      localStorage.removeItem(STORAGE_KEYS.token);
    }

    renderAuthState();
    renderOrders();
  }

  async function loadOrders() {
    if (!state.token) {
      state.orders = [];
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/orders`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      const payload = await response.json();
      state.orders = response.ok ? payload.orders || [] : [];
    } catch {
      state.orders = [];
    }
  }

  function renderAll() {
    renderFilters();
    renderRestaurants();
    renderHighlights();
    renderCart();
    renderAuthState();
    renderOrders();
  }

  function renderHighlights() {
    const totalMenus = state.restaurants.reduce((sum, item) => sum + item.menu.length, 0);
    const times = state.restaurants.map((item) => item.deliveryMinutes);
    const averageDelivery = times.length
      ? `${Math.round(times.reduce((sum, item) => sum + item, 0) / times.length)} min`
      : "0 min";

    restaurantCount.textContent = String(state.restaurants.length);
    menuCount.textContent = String(totalMenus);
    deliveryTime.textContent = averageDelivery;

    const featured = state.restaurants.slice(0, 3);
    featuredSpotlight.innerHTML = featured
      .map(
        (item) => `
          <article class="featured-tile">
            <strong>${item.name}</strong>
            <p>${item.tagline}</p>
            <div class="featured-meta">
              <span>${item.cuisine}</span>
              <span>${item.rating} rating</span>
              <span>${item.deliveryMinutes} min</span>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderFilters() {
    filterGroup.innerHTML = state.filters
      .map(
        (filter) => `
          <button
            type="button"
            class="filter-chip ${filter === state.activeFilter ? "is-active" : ""}"
            data-filter="${filter}"
          >
            ${filter}
          </button>
        `
      )
      .join("");
  }

  function getVisibleRestaurants() {
    const query = state.query.toLowerCase();

    return state.restaurants.filter((restaurant) => {
      const matchesFilter =
        state.activeFilter === "All" || restaurant.cuisine === state.activeFilter;

      if (!query) {
        return matchesFilter;
      }

      const haystack = [
        restaurant.name,
        restaurant.cuisine,
        restaurant.tagline,
        ...restaurant.menu.map((item) => `${item.name} ${item.description}`),
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && haystack.includes(query);
    });
  }

  function renderRestaurants() {
    const visible = getVisibleRestaurants();
    resultsSummary.textContent = `${visible.length} restaurant${visible.length === 1 ? "" : "s"} found`;

    if (!visible.length) {
      restaurantList.innerHTML = `
        <article class="empty-state">
          <strong>No restaurants match this search.</strong>
          <p>Try another cuisine or dish name.</p>
        </article>
      `;
      return;
    }

    restaurantList.innerHTML = visible
      .map(
        (restaurant) => `
          <article class="restaurant-card">
            <div class="restaurant-head">
              <div>
                <h3>${restaurant.name}</h3>
                <p>${restaurant.tagline}</p>
              </div>
              <div class="badge-row">
                <span class="badge">${restaurant.rating} rating</span>
                <span class="badge">${restaurant.deliveryMinutes} min</span>
              </div>
            </div>

            <div class="menu-tags">
              <span>${restaurant.cuisine}</span>
              <span>${restaurant.priceRange}</span>
              <span>${restaurant.location}</span>
            </div>

            <div class="menu-list">
              ${restaurant.menu
                .map(
                  (item) => `
                    <article class="menu-item">
                      <div>
                        <strong>${item.name}</strong>
                        <small>${item.description}</small>
                      </div>
                      <div class="menu-action">
                        <span class="price">Rs. ${item.price}</span>
                        <button type="button" class="secondary-button add-to-cart" data-menu-id="${item.id}">
                          Add
                        </button>
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          </article>
        `
      )
      .join("");
  }

  function getCartEntries() {
    const entries = [];
    Object.entries(state.cart).forEach(([menuId, quantity]) => {
      if (!quantity) {
        return;
      }

      for (const restaurant of state.restaurants) {
        const menuItem = restaurant.menu.find((item) => item.id === menuId);
        if (menuItem) {
          entries.push({
            ...menuItem,
            quantity,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
          });
          return;
        }
      }
    });

    return entries;
  }

  function renderCart() {
    const entries = getCartEntries();
    const subtotal = entries.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = entries.length ? subtotal + DELIVERY_FEE : 0;

    if (!entries.length) {
      cartItems.innerHTML = `
        <article class="empty-state">
          <strong>Your cart is empty.</strong>
          <p>Add dishes from the catalog to start an order.</p>
        </article>
      `;
    } else {
      cartItems.innerHTML = entries
        .map(
          (item) => `
            <article class="cart-item">
              <div class="cart-item-head">
                <div>
                  <strong>${item.name}</strong>
                  <p class="muted-note">${item.restaurantName}</p>
                </div>
                <strong>Rs. ${item.price * item.quantity}</strong>
              </div>

              <div class="cart-row">
                <div class="quantity-controls">
                  <button type="button" class="quantity-button" data-cart-action="decrease" data-menu-id="${item.id}">-</button>
                  <span>${item.quantity}</span>
                  <button type="button" class="quantity-button" data-cart-action="increase" data-menu-id="${item.id}">+</button>
                </div>
                <button type="button" class="ghost-button" data-cart-action="remove" data-menu-id="${item.id}">
                  Remove
                </button>
              </div>
            </article>
          `
        )
        .join("");
    }

    subtotalAmount.textContent = `Rs. ${subtotal}`;
    deliveryFee.textContent = `Rs. ${entries.length ? DELIVERY_FEE : 0}`;
    grandTotal.textContent = `Rs. ${total}`;
    checkoutButton.disabled = !entries.length;
  }

  function renderAuthState() {
    if (state.user) {
      authUserStatus.textContent = `Signed in as ${state.user.name} (${state.user.email})`;
      logoutButton.hidden = false;
    } else {
      authUserStatus.textContent = "Not signed in.";
      logoutButton.hidden = true;
    }
  }

  function renderOrders() {
    if (!state.user) {
      orderHistory.innerHTML = `
        <article class="empty-state">
          <strong>Login to view order history.</strong>
          <p>Your previous orders will appear here once you sign in.</p>
        </article>
      `;
      return;
    }

    if (!state.orders.length) {
      orderHistory.innerHTML = `
        <article class="empty-state">
          <strong>No orders yet.</strong>
          <p>Your completed checkout records will appear here.</p>
        </article>
      `;
      return;
    }

    orderHistory.innerHTML = state.orders
      .map(
        (order) => `
          <article class="order-card">
            <div class="order-head">
              <div>
                <strong>Order #${order.id}</strong>
                <p>${new Date(order.createdAt).toLocaleString()}</p>
              </div>
              <strong>Rs. ${order.total}</strong>
            </div>

            <div class="order-meta">
              <span>${order.items.length} item${order.items.length === 1 ? "" : "s"}</span>
              <span>${order.status}</span>
              ${order.paymentReference ? `<span>UTR ${order.paymentReference}</span>` : ""}
            </div>

            <div class="order-items">
              ${order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
            </div>
          </article>
        `
      )
      .join("");
  }

  async function handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to create account.");
      }

      setToken(payload.token);
      state.user = payload.user;
      form.reset();
      setFormStatus(form, "Account created successfully.");
      await loadOrders();
      renderAuthState();
      renderOrders();
    } catch (error) {
      setFormStatus(form, error.message || "Unable to create account.");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to login.");
      }

      setToken(payload.token);
      state.user = payload.user;
      form.reset();
      setFormStatus(form, "Login successful.");
      await loadOrders();
      renderAuthState();
      renderOrders();
    } catch (error) {
      setFormStatus(form, error.message || "Unable to login.");
    }
  }

  async function handleLogout() {
    state.token = "";
    state.user = null;
    state.orders = [];
    localStorage.removeItem(STORAGE_KEYS.token);
    renderAuthState();
    renderOrders();
    setCartMessage("Logged out.");
  }

  async function handleCheckout() {
    const items = getCartEntries();

    if (!state.user || !state.token) {
      setCartMessage("Login before placing an order.");
      document.querySelector("#account")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!items.length) {
      setCartMessage("Add items to your cart first.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            menuId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to place order.");
      }

      state.pendingOrder = payload.order;
      paymentAmount.textContent = `Rs. ${payload.order.total}`;
      paymentMessage.textContent = "";
      paymentReference.value = "";
      openPaymentModal();
      setCartMessage("Order created. Complete payment by scanning the QR.");
    } catch (error) {
      setCartMessage(error.message || "Unable to place order.");
    }
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();

    if (!state.pendingOrder || !state.token) {
      paymentMessage.textContent = "No pending order found.";
      return;
    }

    const reference = paymentReference.value.trim();
    if (!reference) {
      paymentMessage.textContent = "Enter the payment reference or UTR number.";
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/orders/${state.pendingOrder.id}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({
          paymentReference: reference,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to submit payment.");
      }

      paymentMessage.textContent = "Payment submitted successfully.";
      state.pendingOrder = null;
      state.cart = {};
      persistCart();
      await loadOrders();
      renderCart();
      renderOrders();
      setCartMessage("Payment submitted. Your order is now marked as paid.");
      setTimeout(closePaymentModal, 800);
    } catch (error) {
      paymentMessage.textContent = error.message || "Unable to submit payment.";
    }
  }

  function openPaymentModal() {
    paymentModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePaymentModal() {
    paymentModal.hidden = true;
    document.body.style.overflow = "";
  }

  function persistCart() {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(state.cart));
  }

  function setToken(token) {
    state.token = token;
    localStorage.setItem(STORAGE_KEYS.token, token);
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function attachStatus(form) {
    if (!form) {
      return;
    }

    const node = document.createElement("p");
    node.className = "status-message";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    form.appendChild(node);
  }

  function setFormStatus(form, message) {
    const target = form.querySelector(".status-message");
    if (target) {
      target.textContent = message;
    }
  }

  function setCartMessage(message) {
    cartMessage.textContent = message;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    cart: "quickbite-cart",
    checkoutDraft: "quickbite-checkout-draft",
    user: "quickbite-user",
    userToken: "quickbite-user-token",
    adminToken: "quickbite-admin-token",
  };

  const DELIVERY_FEE = 40;
  const API_BASE = "/api";
  const ORDER_STATUS_OPTIONS = [
    { value: "awaiting_payment", label: "Awaiting Payment" },
    { value: "payment_submitted", label: "Payment Submitted" },
    { value: "confirmed", label: "Confirmed" },
    { value: "baking", label: "Baking" },
    { value: "preparing", label: "Preparing" },
    { value: "out_for_delivery", label: "Out For Delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const elements = {
    searchForm: document.querySelector(".search-form"),
    searchInput: document.querySelector("#search"),
    restaurantList: document.querySelector("#restaurant-list"),
    filterGroup: document.querySelector("#filter-group"),
    resultsSummary: document.querySelector("#results-summary"),
    cartItems: document.querySelector("#cart-items"),
    subtotalAmount: document.querySelector("#subtotal-amount"),
    deliveryFee: document.querySelector("#delivery-fee"),
    grandTotal: document.querySelector("#grand-total"),
    checkoutButton: document.querySelector("#checkout-button"),
    checkoutDetailsForm: document.querySelector("#checkout-details-form"),
    checkoutPhone: document.querySelector("#checkout-phone"),
    checkoutAddress: document.querySelector("#checkout-address"),
    checkoutNote: document.querySelector("#checkout-note"),
    cartMessage: document.querySelector("#cart-message"),
    restaurantCount: document.querySelector("#restaurant-count"),
    menuCount: document.querySelector("#menu-count"),
    deliveryTime: document.querySelector("#delivery-time"),
    featuredSpotlight: document.querySelector("#featured-spotlight"),
    authUserStatus: document.querySelector("#auth-user-status"),
    logoutButton: document.querySelector("#logout-button"),
    signupForm: document.querySelector("#signup-form"),
    loginForm: document.querySelector("#login-form"),
    orderHistory: document.querySelector("#order-history"),
    adminLoginForm: document.querySelector("#admin-login-form"),
    adminStatus: document.querySelector("#admin-status"),
    adminLogoutButton: document.querySelector("#admin-logout-button"),
    adminOrders: document.querySelector("#admin-orders"),
    paymentModal: document.querySelector("#payment-modal"),
    paymentClose: document.querySelector("#payment-close"),
    paymentAmount: document.querySelector("#payment-amount"),
    paymentForm: document.querySelector("#payment-form"),
    paymentReference: document.querySelector("#payment-reference"),
    paymentMessage: document.querySelector("#payment-message"),
    mobileNavToggle: document.querySelector("#mobile-nav-toggle"),
    navAnchors: Array.from(document.querySelectorAll('.nav-list a[href^="#"]')),
  };

  if (
    !elements.searchForm ||
    !elements.searchInput ||
    !elements.restaurantList ||
    !elements.filterGroup ||
    !elements.resultsSummary ||
    !elements.cartItems ||
    !elements.subtotalAmount ||
    !elements.deliveryFee ||
    !elements.grandTotal ||
    !elements.checkoutButton ||
    !elements.checkoutDetailsForm ||
    !elements.orderHistory ||
    !elements.paymentModal ||
    !elements.paymentForm
  ) {
    return;
  }

  const state = {
    restaurants: [],
    query: "",
    activeFilter: "all",
    cart: loadState(STORAGE_KEYS.cart, {}),
    checkoutDraft: loadState(STORAGE_KEYS.checkoutDraft, {
      phone: "",
      address: "",
      note: "",
    }),
    user: loadState(STORAGE_KEYS.user, null),
    userToken: loadState(STORAGE_KEYS.userToken, ""),
    adminToken: loadState(STORAGE_KEYS.adminToken, ""),
    orders: [],
    adminOrders: [],
    pendingOrder: null,
  };

  attachFormStatus(elements.signupForm);
  attachFormStatus(elements.loginForm);
  attachFormStatus(elements.adminLoginForm);

  function loadState(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveState(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function removeState(key) {
    localStorage.removeItem(key);
  }

  function formatCurrency(amount) {
    return `Rs. ${Number(amount || 0)}`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "Time unavailable";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Time unavailable";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 10) {
      return value || "Not provided";
    }

    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  function getOrderRestaurantNames(order) {
    const names = Array.from(
      new Set(
        Array.isArray(order?.items)
          ? order.items.map((item) => resolveOrderItemRestaurantName(item)).filter(Boolean)
          : []
      )
    );

    return names.length ? names.join(", ") : "Restaurant unavailable";
  }

  function resolveOrderItemRestaurantName(item) {
    const existingName = String(item?.restaurantName || "").trim();
    if (existingName) {
      return existingName;
    }

    if (item?.restaurantId) {
      const restaurant = state.restaurants.find((entry) => entry.id === item.restaurantId);
      if (restaurant?.name) {
        return restaurant.name;
      }
    }

    const restaurant = state.restaurants.find(
      (entry) =>
        Array.isArray(entry.menu) && entry.menu.some((menuItem) => menuItem.id === item?.menuId)
    );

    return restaurant?.name || "Restaurant unavailable";
  }

  function statusLabel(status) {
    const normalized = String(status || "").replace(/_/g, " ").trim();
    return normalized ? normalized.replace(/\b\w/g, (char) => char.toUpperCase()) : "Pending";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    return payload;
  }

  function getCartEntries() {
    const entries = [];

    Object.entries(state.cart).forEach(([menuId, quantity]) => {
      if (!quantity) {
        return;
      }

      for (const restaurant of state.restaurants) {
        const item = restaurant.menu.find((menuItem) => menuItem.id === menuId);
        if (item) {
          entries.push({
            ...item,
            quantity,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
          });
          break;
        }
      }
    });

    return entries;
  }

  function getCartSubtotal() {
    return getCartEntries().reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function getFilteredRestaurants() {
    const query = state.query.trim().toLowerCase();

    return state.restaurants.filter((restaurant) => {
      const matchesFilter =
        state.activeFilter === "all" || restaurant.cuisine === state.activeFilter;

      if (!query) {
        return matchesFilter;
      }

      const haystack = [
        restaurant.name,
        restaurant.cuisine,
        restaurant.location,
        restaurant.tagline,
        ...restaurant.menu.map((item) => `${item.name} ${item.description}`),
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && haystack.includes(query);
    });
  }

  function renderFilterChips() {
    const cuisines = Array.from(
      new Set(state.restaurants.map((restaurant) => restaurant.cuisine).filter(Boolean))
    );

    const filters = ["all", ...cuisines];
    elements.filterGroup.innerHTML = filters
      .map((filter) => {
        const label = filter === "all" ? "All" : filter;
        const active = filter === state.activeFilter ? " is-active" : "";
        return `
          <button type="button" class="filter-chip${active}" data-filter="${escapeHtml(filter)}">
            ${escapeHtml(label)}
          </button>
        `;
      })
      .join("");
  }

  function renderHeroStats() {
    const menuItems = state.restaurants.reduce(
      (sum, restaurant) => sum + restaurant.menu.length,
      0
    );
    const averageMinutes = state.restaurants.length
      ? Math.round(
          state.restaurants.reduce(
            (sum, restaurant) => sum + Number(restaurant.deliveryMinutes || 0),
            0
          ) / state.restaurants.length
        )
      : 0;

    elements.restaurantCount.textContent = String(state.restaurants.length);
    elements.menuCount.textContent = String(menuItems);
    elements.deliveryTime.textContent = `${averageMinutes} min`;
  }

  function renderFeaturedSpotlight() {
    if (!elements.featuredSpotlight) {
      return;
    }

    const featured = state.restaurants
      .slice()
      .sort((left, right) => (right.rating || 0) - (left.rating || 0))
      .slice(0, 3);

    elements.featuredSpotlight.innerHTML = featured.length
      ? featured
          .map(
            (restaurant) => `
              <article class="spotlight-card" data-restaurant-id="${escapeHtml(restaurant.id)}" tabindex="0" role="button" aria-label="Show ${escapeHtml(restaurant.name)} menu">
                <strong>${escapeHtml(restaurant.name)}</strong>
                <span>${escapeHtml(restaurant.cuisine)} • ${restaurant.rating} rating</span>
                <p>${escapeHtml(restaurant.tagline || "")}</p>
                <small class="spotlight-cta">View menu</small>
              </article>
            `
          )
          .join("")
      : `
          <article class="empty-state">
            <strong>No restaurants available.</strong>
          </article>
        `;
  }

  function renderRestaurants() {
    const filtered = getFilteredRestaurants();

    elements.restaurantList.innerHTML = filtered.length
      ? filtered
          .map(
            (restaurant) => `
              <article class="restaurant-card">
                <div class="restaurant-top">
                  <div>
                    <h3>${escapeHtml(restaurant.name)}</h3>
                    <p class="restaurant-copy">${escapeHtml(restaurant.tagline || "")}</p>
                  </div>
                  <div class="restaurant-meta">
                    <span>${restaurant.rating} rating</span>
                    <span>${Number(restaurant.deliveryMinutes || 0)} min</span>
                  </div>
                </div>
                <div class="restaurant-footer">
                  <div class="menu-tags">
                    <span>${escapeHtml(restaurant.cuisine)}</span>
                    <span>${escapeHtml(restaurant.location || "Location unavailable")}</span>
                    <span>${escapeHtml(restaurant.priceRange || "")}</span>
                  </div>
                </div>
                <div class="menu-items">
                  ${restaurant.menu
                    .map(
                      (item) => `
                        <article class="menu-item">
                          <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <p>${escapeHtml(item.description || "")}</p>
                          </div>
                          <div class="menu-item-action">
                            <span class="price">${formatCurrency(item.price)}</span>
                            <button
                              type="button"
                              class="secondary-button add-to-cart"
                              data-menu-id="${escapeHtml(item.id)}"
                            >
                              Add to cart
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
          .join("")
      : `
          <article class="empty-state">
            <strong>No matching restaurants found.</strong>
            <p class="muted-note">Try a different search term or switch the cuisine filter.</p>
          </article>
        `;

    elements.resultsSummary.textContent = `${filtered.length} restaurant${filtered.length === 1 ? "" : "s"} available`;
  }

  function renderCart() {
    const entries = getCartEntries();
    const subtotal = getCartSubtotal();
    const total = entries.length ? subtotal + DELIVERY_FEE : 0;

    elements.cartItems.innerHTML = entries.length
      ? entries
          .map(
            (item) => `
              <article class="cart-item">
                <div class="cart-item-head">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <p class="muted-note">${escapeHtml(item.restaurantName)}</p>
                  </div>
                  <strong>${formatCurrency(item.price * item.quantity)}</strong>
                </div>
                <div class="cart-item-controls">
                  <div class="quantity-controls">
                    <button type="button" class="quantity-button" data-action="decrease" data-menu-id="${escapeHtml(item.id)}">-</button>
                    <span>${item.quantity}</span>
                    <button type="button" class="quantity-button" data-action="increase" data-menu-id="${escapeHtml(item.id)}">+</button>
                  </div>
                  <button type="button" class="ghost-button" data-action="remove" data-menu-id="${escapeHtml(item.id)}">Remove</button>
                </div>
              </article>
            `
          )
          .join("")
      : `
          <article class="empty-state">
            <strong>Your cart is empty.</strong>
            <p class="muted-note">Add dishes from any restaurant to start an order.</p>
          </article>
        `;

    elements.subtotalAmount.textContent = formatCurrency(subtotal);
    elements.deliveryFee.textContent = formatCurrency(entries.length ? DELIVERY_FEE : 0);
    elements.grandTotal.textContent = formatCurrency(total);
    elements.checkoutButton.disabled = !entries.length;
    elements.checkoutButton.textContent = entries.length
      ? `Proceed to payment (${entries.reduce((sum, item) => sum + item.quantity, 0)} items)`
      : "Add items to order";
  }

  function renderCheckoutDraft() {
    elements.checkoutPhone.value = state.checkoutDraft.phone || "";
    elements.checkoutAddress.value = state.checkoutDraft.address || "";
    elements.checkoutNote.value = state.checkoutDraft.note || "";
  }

  function renderAuthState() {
    if (state.user) {
      elements.authUserStatus.textContent = `Signed in as ${state.user.name} (${state.user.email})`;
      elements.logoutButton.hidden = false;
    } else {
      elements.authUserStatus.textContent = "Not signed in.";
      elements.logoutButton.hidden = true;
    }
  }

  function renderOrderHistory() {
    if (!state.user) {
      elements.orderHistory.innerHTML = `
        <article class="empty-state">
          <strong>Sign in to view your recent activity.</strong>
          <p class="muted-note">Placed orders and payment updates will appear here.</p>
        </article>
      `;
      return;
    }

    elements.orderHistory.innerHTML = state.orders.length
      ? state.orders
          .map((order) => {
            const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
            return `
              <article class="order-card">
                <div class="cart-item-head">
                  <div>
                    <strong>Order ${escapeHtml(order.id)}</strong>
                    <p class="muted-note">${formatDateTime(order.createdAt)}</p>
                  </div>
                  <strong>${formatCurrency(order.total)}</strong>
                </div>
                <div class="order-summary-grid">
                  <div>
                    <span class="order-summary-label">Restaurants</span>
                    <strong>${escapeHtml(getOrderRestaurantNames(order))}</strong>
                  </div>
                  <div>
                    <span class="order-summary-label">Order history</span>
                    <strong>${escapeHtml(statusLabel(order.status))}</strong>
                  </div>
                  <div>
                    <span class="order-summary-label">Placed on</span>
                    <strong>${formatDateTime(order.createdAt)}</strong>
                  </div>
                </div>
                <div class="menu-tags">
                  <span>${totalItems} item${totalItems === 1 ? "" : "s"}</span>
                  ${order.paymentReference ? `<span>UTR ${escapeHtml(order.paymentReference)}</span>` : ""}
                </div>
                ${
                  order.customer
                    ? `
                      <div class="order-customer-meta">
                        <p><strong>Delivery:</strong> ${escapeHtml(order.customer.address || "Address unavailable")}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(formatPhone(order.customer.phone))}</p>
                        ${order.customer.note ? `<p><strong>Instructions:</strong> ${escapeHtml(order.customer.note)}</p>` : ""}
                      </div>
                    `
                    : ""
                }
                <div class="menu-items">
                  ${order.items
                    .map(
                      (item) => `
                        <article class="menu-item">
                          <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <p>${escapeHtml(resolveOrderItemRestaurantName(item))} • Qty ${item.quantity}</p>
                          </div>
                          <div class="menu-item-action">
                            <span class="price">${formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        </article>
                      `
                    )
                    .join("")}
                </div>
                <button type="button" class="secondary-button reorder-button" data-order-id="${escapeHtml(order.id)}">Order again</button>
              </article>
            `;
          })
          .join("")
      : `
          <article class="empty-state">
            <strong>No orders yet.</strong>
            <p class="muted-note">Complete checkout and your order activity will appear here.</p>
          </article>
        `;
  }

  function renderAdminState() {
    if (state.adminToken) {
      elements.adminStatus.textContent = "Admin signed in.";
      elements.adminLogoutButton.hidden = false;
    } else {
      elements.adminStatus.textContent = "Admin not signed in.";
      elements.adminLogoutButton.hidden = true;
    }
  }

  function renderAdminOrders() {
    if (!state.adminToken) {
      elements.adminOrders.innerHTML = `
        <article class="empty-state">
          <strong>Admin access required.</strong>
          <p class="muted-note">Login to review submitted order activity and payments.</p>
        </article>
      `;
      return;
    }

    elements.adminOrders.innerHTML = state.adminOrders.length
      ? state.adminOrders
          .map(
            (order) => `
              <article class="order-card">
                <div class="cart-item-head">
                  <div>
                    <strong>${escapeHtml(order.userName || "Unknown user")}</strong>
                    <p class="muted-note">${escapeHtml(order.userEmail || "")}</p>
                  </div>
                  <strong>${formatCurrency(order.total)}</strong>
                </div>
                <div class="order-summary-grid">
                  <div>
                    <span class="order-summary-label">Restaurants</span>
                    <strong>${escapeHtml(getOrderRestaurantNames(order))}</strong>
                  </div>
                  <div>
                    <span class="order-summary-label">Current status</span>
                    <strong>${escapeHtml(statusLabel(order.status))}</strong>
                  </div>
                  <div>
                    <span class="order-summary-label">Placed on</span>
                    <strong>${formatDateTime(order.createdAt)}</strong>
                  </div>
                </div>
                <div class="menu-tags">
                  <span>Order ${escapeHtml(order.id)}</span>
                  ${order.paymentReference ? `<span>UTR ${escapeHtml(order.paymentReference)}</span>` : ""}
                </div>
                ${
                  order.customer
                    ? `
                      <div class="order-customer-meta">
                        <p><strong>Address:</strong> ${escapeHtml(order.customer.address || "Address unavailable")}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(formatPhone(order.customer.phone))}</p>
                        ${order.customer.note ? `<p><strong>Instructions:</strong> ${escapeHtml(order.customer.note)}</p>` : ""}
                      </div>
                    `
                    : ""
                }
                <div class="menu-items">
                  ${order.items
                    .map(
                      (item) => `
                        <article class="menu-item">
                          <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <p>${escapeHtml(resolveOrderItemRestaurantName(item))} • Qty ${item.quantity}</p>
                          </div>
                          <div class="menu-item-action">
                            <span class="price">${formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        </article>
                      `
                    )
                    .join("")}
                </div>
                <form class="admin-status-form" data-order-id="${escapeHtml(order.id)}">
                  <label class="admin-status-label" for="status-${escapeHtml(order.id)}">Update status</label>
                  <div class="admin-quick-actions">
                    ${[
                      { value: "confirmed", label: "Confirm" },
                      { value: "preparing", label: "Preparing" },
                      { value: "out_for_delivery", label: "Out for delivery" },
                      { value: "delivered", label: "Delivered" },
                    ]
                      .map(
                        (action) => `
                          <button type="button" class="ghost-button admin-quick-button" data-status-value="${escapeHtml(action.value)}">
                            ${escapeHtml(action.label)}
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                  <div class="admin-actions">
                    <select
                      id="status-${escapeHtml(order.id)}"
                      name="status"
                      class="admin-status-select"
                    >
                      ${ORDER_STATUS_OPTIONS.map(
                        (option) => `
                          <option value="${escapeHtml(option.value)}"${option.value === order.status ? " selected" : ""}>
                            ${escapeHtml(option.label)}
                          </option>
                        `
                      ).join("")}
                    </select>
                    <button type="submit" class="secondary-button">Save status</button>
                  </div>
                </form>
              </article>
            `
          )
          .join("")
      : `
          <article class="empty-state">
            <strong>No order activity yet.</strong>
            <p class="muted-note">Submitted customer payments will show here.</p>
          </article>
        `;
  }

  function openPaymentModal(order) {
    state.pendingOrder = order;
    elements.paymentAmount.textContent = formatCurrency(order.total);
    elements.paymentReference.value = "";
    elements.paymentMessage.textContent = "";
    elements.paymentModal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      elements.paymentReference.focus();
    }, 50);
  }

  function closePaymentModal() {
    state.pendingOrder = null;
    elements.paymentModal.hidden = true;
    elements.paymentForm.reset();
    elements.paymentMessage.textContent = "";
    document.body.style.overflow = "";
  }

  function attachFormStatus(form) {
    if (!form || form.nextElementSibling?.classList.contains("status-message")) {
      return;
    }

    const status = document.createElement("p");
    status.className = "status-message";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.insertAdjacentElement("afterend", status);
  }

  function setFormStatus(form, message) {
    const status = form?.nextElementSibling;
    if (status?.classList.contains("status-message")) {
      status.textContent = message;
    }
  }

  function persistCheckoutDraft() {
    state.checkoutDraft = {
      phone: String(elements.checkoutPhone.value || "").trim(),
      address: String(elements.checkoutAddress.value || "").trim(),
      note: String(elements.checkoutNote.value || "").trim(),
    };
    saveState(STORAGE_KEYS.checkoutDraft, state.checkoutDraft);
  }

  function resetCheckoutDraft() {
    state.checkoutDraft = {
      phone: "",
      address: "",
      note: "",
    };
    saveState(STORAGE_KEYS.checkoutDraft, state.checkoutDraft);
    renderCheckoutDraft();
  }

  function validateCheckoutDetails() {
    persistCheckoutDraft();

    const phoneDigits = state.checkoutDraft.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return "Enter a valid 10-digit phone number.";
    }

    if (state.checkoutDraft.address.length < 10) {
      return "Enter a complete delivery address.";
    }

    return "";
  }

  function focusRestaurant(restaurantId) {
    const restaurant = state.restaurants.find((entry) => entry.id === restaurantId);
    if (!restaurant) {
      return;
    }

    state.activeFilter = restaurant.cuisine || "all";
    state.query = restaurant.name;
    elements.searchInput.value = restaurant.name;
    renderFilterChips();
    renderRestaurants();
    document.querySelector("#restaurants")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reorderFromOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) {
      return;
    }

    order.items.forEach((item) => {
      const current = Number(state.cart[item.menuId] || 0);
      state.cart[item.menuId] = current + Number(item.quantity || 1);
    });

    saveState(STORAGE_KEYS.cart, state.cart);
    renderCart();
    elements.cartMessage.textContent = `Added items from order ${orderId} back to cart.`;
    document.querySelector("#restaurants")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadRestaurants() {
    const payload = await apiRequest("/restaurants");
    state.restaurants = Array.isArray(payload.restaurants) ? payload.restaurants : [];
    renderFilterChips();
    renderHeroStats();
    renderFeaturedSpotlight();
    renderRestaurants();
    renderCart();
  }

  async function refreshOrders() {
    if (!state.userToken) {
      state.orders = [];
      renderOrderHistory();
      return;
    }

    try {
      const payload = await apiRequest("/orders", { token: state.userToken });
      state.orders = Array.isArray(payload.orders) ? payload.orders : [];
      renderOrderHistory();
    } catch (error) {
      if (error.message === "Unauthorized.") {
        clearUserSession();
      }
      elements.cartMessage.textContent = error.message;
    }
  }

  async function refreshAdminOrders() {
    if (!state.adminToken) {
      state.adminOrders = [];
      renderAdminState();
      renderAdminOrders();
      return;
    }

    try {
      const payload = await apiRequest("/admin/orders", { token: state.adminToken });
      state.adminOrders = Array.isArray(payload.orders) ? payload.orders : [];
      renderAdminState();
      renderAdminOrders();
    } catch (error) {
      if (error.message === "Unauthorized.") {
        clearAdminSession();
      }
      setFormStatus(elements.adminLoginForm, error.message);
    }
  }

  async function updateAdminOrderStatus(orderId, status, form) {
    if (!state.adminToken) {
      setFormStatus(elements.adminLoginForm, "Admin access required.");
      return;
    }

    try {
      const submitButton = form?.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Saving...";
      }

      const payload = await apiRequest(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: "POST",
        token: state.adminToken,
        body: { status },
      });

      state.adminOrders = Array.isArray(payload.orders) ? payload.orders : [];
      renderAdminOrders();
      setFormStatus(elements.adminLoginForm, `Order ${orderId} updated to ${statusLabel(status)}.`);

      if (state.userToken) {
        await refreshOrders();
      }
    } catch (error) {
      if (error.message === "Unauthorized.") {
        clearAdminSession();
      }
      setFormStatus(elements.adminLoginForm, error.message);
    } finally {
      const refreshedButton = form?.querySelector('button[type="submit"]');
      if (refreshedButton) {
        refreshedButton.disabled = false;
        refreshedButton.textContent = "Save status";
      }
    }
  }

  async function restoreUserSession() {
    if (!state.userToken) {
      renderAuthState();
      renderOrderHistory();
      return;
    }

    try {
      const payload = await apiRequest("/session", { token: state.userToken });
      state.user = payload.user || null;
      saveState(STORAGE_KEYS.user, state.user);
      renderAuthState();
      await refreshOrders();
    } catch {
      clearUserSession();
    }
  }

  function clearUserSession() {
    state.user = null;
    state.userToken = "";
    state.orders = [];
    removeState(STORAGE_KEYS.user);
    removeState(STORAGE_KEYS.userToken);
    renderAuthState();
    renderOrderHistory();
  }

  function clearAdminSession() {
    state.adminToken = "";
    state.adminOrders = [];
    removeState(STORAGE_KEYS.adminToken);
    renderAdminState();
    renderAdminOrders();
  }

  function changeCartQuantity(menuId, action) {
    const currentQuantity = Number(state.cart[menuId] || 0);

    if (action === "increase") {
      state.cart[menuId] = currentQuantity + 1;
    } else if (action === "decrease") {
      const nextQuantity = currentQuantity - 1;
      if (nextQuantity > 0) {
        state.cart[menuId] = nextQuantity;
      } else {
        delete state.cart[menuId];
      }
    } else if (action === "remove") {
      delete state.cart[menuId];
    }

    saveState(STORAGE_KEYS.cart, state.cart);
    renderCart();
  }

  async function handleSignup(event) {
    event.preventDefault();
    const formData = new FormData(elements.signupForm);
    const submitButton = elements.signupForm.querySelector('button[type="submit"]');

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
      }

      const payload = await apiRequest("/auth/signup", {
        method: "POST",
        body: {
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
        },
      });

      state.user = payload.user;
      state.userToken = payload.token;
      saveState(STORAGE_KEYS.user, state.user);
      saveState(STORAGE_KEYS.userToken, state.userToken);
      elements.signupForm.reset();
      renderAuthState();
      setFormStatus(elements.signupForm, "Account created. You can place orders now.");
      setFormStatus(elements.loginForm, "");
      await refreshOrders();
    } catch (error) {
      setFormStatus(elements.signupForm, error.message);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Create account";
      }
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const formData = new FormData(elements.loginForm);
    const submitButton = elements.loginForm.querySelector('button[type="submit"]');

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Logging in...";
      }

      const payload = await apiRequest("/auth/login", {
        method: "POST",
        body: {
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
        },
      });

      state.user = payload.user;
      state.userToken = payload.token;
      saveState(STORAGE_KEYS.user, state.user);
      saveState(STORAGE_KEYS.userToken, state.userToken);
      elements.loginForm.reset();
      renderAuthState();
      setFormStatus(elements.loginForm, `Logged in as ${state.user.name}.`);
      await refreshOrders();
    } catch (error) {
      setFormStatus(elements.loginForm, error.message);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Login";
      }
    }
  }

  async function handleCheckout() {
    const entries = getCartEntries();

    if (!entries.length) {
      elements.cartMessage.textContent = "Your cart is empty.";
      return;
    }

    if (!state.userToken) {
      elements.cartMessage.textContent = "Sign in before placing an order.";
      document.querySelector("#account")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const checkoutError = validateCheckoutDetails();
    if (checkoutError) {
      elements.cartMessage.textContent = checkoutError;
      elements.checkoutDetailsForm.reportValidity();
      return;
    }

    try {
      elements.checkoutButton.disabled = true;
      elements.cartMessage.textContent = "Creating your order...";

      const payload = await apiRequest("/orders", {
        method: "POST",
        token: state.userToken,
        body: {
          items: entries.map((item) => ({
            menuId: item.id,
            quantity: item.quantity,
          })),
          customer: {
            phone: state.checkoutDraft.phone,
            address: state.checkoutDraft.address,
            note: state.checkoutDraft.note,
          },
        },
      });

      state.cart = {};
      saveState(STORAGE_KEYS.cart, state.cart);
      resetCheckoutDraft();
      renderCart();
      elements.cartMessage.textContent = `Order ${payload.order.id} created. Submit payment to complete it.`;
      openPaymentModal(payload.order);
      await refreshOrders();
    } catch (error) {
      if (error.message === "Unauthorized.") {
        clearUserSession();
      }
      elements.cartMessage.textContent = error.message;
    } finally {
      renderCart();
    }
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();
    const submitButton = elements.paymentForm.querySelector('button[type="submit"]');

    if (!state.pendingOrder) {
      elements.paymentMessage.textContent = "No pending order found.";
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
      }

      elements.paymentMessage.textContent = "Submitting payment reference...";
      await apiRequest(`/orders/${encodeURIComponent(state.pendingOrder.id)}/payment`, {
        method: "POST",
        token: state.userToken,
        body: {
          paymentReference: String(elements.paymentReference.value || "").trim(),
        },
      });

      elements.paymentMessage.textContent = "Payment submitted successfully.";
      await refreshOrders();
      if (state.adminToken) {
        await refreshAdminOrders();
      }
      window.setTimeout(() => {
        closePaymentModal();
        document.querySelector("#orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 500);
    } catch (error) {
      elements.paymentMessage.textContent = error.message;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit payment";
      }
    }
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const formData = new FormData(elements.adminLoginForm);
    const submitButton = elements.adminLoginForm.querySelector('button[type="submit"]');

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Logging in...";
      }

      const payload = await apiRequest("/admin/login", {
        method: "POST",
        body: {
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
        },
      });

      state.adminToken = payload.token || "";
      state.adminOrders = Array.isArray(payload.orders) ? payload.orders : [];
      saveState(STORAGE_KEYS.adminToken, state.adminToken);
      elements.adminLoginForm.reset();
      renderAdminState();
      renderAdminOrders();
      setFormStatus(elements.adminLoginForm, "Admin login successful.");
    } catch (error) {
      setFormStatus(elements.adminLoginForm, error.message);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Login as admin";
      }
    }
  }

  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = elements.searchInput.value.trim();
    renderRestaurants();
  });

  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    renderRestaurants();
  });

  elements.filterGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    state.activeFilter = button.dataset.filter || "all";
    renderFilterChips();
    renderRestaurants();
  });

  elements.featuredSpotlight?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-restaurant-id]");
    if (!card) {
      return;
    }

    focusRestaurant(card.dataset.restaurantId);
  });

  elements.featuredSpotlight?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const card = event.target.closest("[data-restaurant-id]");
    if (!card) {
      return;
    }

    event.preventDefault();
    focusRestaurant(card.dataset.restaurantId);
  });

  elements.restaurantList.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-cart");
    if (!button) {
      return;
    }

    const menuId = button.dataset.menuId;
    if (!menuId) {
      return;
    }

    state.cart[menuId] = Number(state.cart[menuId] || 0) + 1;
    saveState(STORAGE_KEYS.cart, state.cart);
    renderCart();
    elements.cartMessage.textContent = "Item added to cart.";
  });

  elements.cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    changeCartQuantity(button.dataset.menuId, button.dataset.action);
  });

  elements.checkoutButton.addEventListener("click", handleCheckout);
  elements.checkoutDetailsForm.addEventListener("input", persistCheckoutDraft);
  elements.signupForm?.addEventListener("submit", handleSignup);
  elements.loginForm?.addEventListener("submit", handleLogin);
  elements.logoutButton?.addEventListener("click", () => {
    clearUserSession();
    elements.cartMessage.textContent = "Logged out.";
  });
  elements.adminLoginForm?.addEventListener("submit", handleAdminLogin);
  elements.adminLogoutButton?.addEventListener("click", () => {
    clearAdminSession();
    setFormStatus(elements.adminLoginForm, "Admin logged out.");
  });
  elements.adminOrders?.addEventListener("submit", (event) => {
    const form = event.target.closest(".admin-status-form");
    if (!form) {
      return;
    }

    event.preventDefault();
    const orderId = form.dataset.orderId;
    const statusField = form.querySelector('select[name="status"]');
    const status = statusField?.value;

    if (!orderId || !status) {
      setFormStatus(elements.adminLoginForm, "Select a valid order status.");
      return;
    }

    updateAdminOrderStatus(orderId, status, form);
  });
  elements.adminOrders?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status-value]");
    if (!button) {
      return;
    }

    const form = button.closest(".admin-status-form");
    const status = button.dataset.statusValue;
    const orderId = form?.dataset.orderId;
    const select = form?.querySelector('select[name="status"]');

    if (!form || !status || !orderId || !select) {
      return;
    }

    select.value = status;
    updateAdminOrderStatus(orderId, status, form);
  });
  elements.paymentForm.addEventListener("submit", handlePaymentSubmit);
  elements.paymentClose?.addEventListener("click", closePaymentModal);
  elements.mobileNavToggle?.addEventListener("click", () => {
    const isOpen = elements.mobileNavToggle.getAttribute("aria-expanded") === "true";
    const nextState = String(!isOpen);
    elements.mobileNavToggle.setAttribute("aria-expanded", nextState);
    document.body.classList.toggle("nav-open", !isOpen);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) {
      document.body.classList.remove("nav-open");
      elements.mobileNavToggle?.setAttribute("aria-expanded", "false");
    }
  });
  elements.paymentModal.addEventListener("click", (event) => {
    if (event.target === elements.paymentModal) {
      closePaymentModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.paymentModal.hidden) {
      closePaymentModal();
    }

    if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
      document.body.classList.remove("nav-open");
      elements.mobileNavToggle?.setAttribute("aria-expanded", "false");
    }
  });

  elements.orderHistory.addEventListener("click", (event) => {
    const button = event.target.closest(".reorder-button");
    if (!button) {
      return;
    }

    const orderId = button.dataset.orderId;
    if (!orderId) {
      return;
    }

    reorderFromOrder(orderId);
  });

  elements.navAnchors.forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const targetSelector = anchor.getAttribute("href");
      if (!targetSelector) {
        return;
      }

      const target = document.querySelector(targetSelector);
      if (!target) {
        return;
      }

      event.preventDefault();
      document.body.classList.remove("nav-open");
      elements.mobileNavToggle?.setAttribute("aria-expanded", "false");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  renderAuthState();
  renderOrderHistory();
  renderAdminState();
  renderAdminOrders();
  renderCart();
  renderCheckoutDraft();

  Promise.all([loadRestaurants(), restoreUserSession(), refreshAdminOrders()]).catch((error) => {
    elements.cartMessage.textContent = error.message || "Unable to load app data.";
  });

  window.setInterval(() => {
    if (state.userToken) {
      refreshOrders();
    }

    if (state.adminToken) {
      refreshAdminOrders();
    }
  }, 15000);
});

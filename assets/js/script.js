document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    cart: "zomato-demo-cart",
  };

  const DELIVERY_FEE = 40;
  const restaurants = [
    {
      id: "spice-story",
      name: "Spice Story",
      cuisine: "Indian",
      rating: 4.7,
      deliveryTime: "25-30 min",
      costForTwo: 450,
      offer: "20% OFF",
      description: "Comfort Indian meals, biryani bowls, and smoky kebabs.",
      menu: [
        { id: "ss-biryani", name: "Chicken Biryani", price: 280, description: "Fragrant basmati rice with spiced chicken." },
        { id: "ss-paneer", name: "Paneer Butter Masala", price: 250, description: "Creamy tomato gravy with soft paneer cubes." },
      ],
    },
    {
      id: "urban-pizza",
      name: "Urban Pizza Co.",
      cuisine: "Italian",
      rating: 4.5,
      deliveryTime: "30-35 min",
      costForTwo: 550,
      offer: "Buy 1 Get 1",
      description: "Stone-baked pizzas, cheesy pasta, and garlic sides.",
      menu: [
        { id: "up-margherita", name: "Margherita Pizza", price: 320, description: "Classic mozzarella, basil, and tomato sauce." },
        { id: "up-alfredo", name: "Creamy Alfredo Pasta", price: 290, description: "Rich white sauce pasta with herbs and cheese." },
      ],
    },
    {
      id: "burger-lab",
      name: "Burger Lab",
      cuisine: "Fast Food",
      rating: 4.4,
      deliveryTime: "20-25 min",
      costForTwo: 400,
      offer: "Free Fries",
      description: "Loaded burgers, crunchy sides, and quick cravings.",
      menu: [
        { id: "bl-smash", name: "Double Smash Burger", price: 260, description: "Juicy double patty burger with house sauce." },
        { id: "bl-wrap", name: "Crispy Chicken Wrap", price: 210, description: "Crispy chicken, lettuce, and smoky mayo." },
      ],
    },
    {
      id: "sweet-cloud",
      name: "Sweet Cloud",
      cuisine: "Dessert",
      rating: 4.8,
      deliveryTime: "18-22 min",
      costForTwo: 300,
      offer: "Flat Rs. 75 OFF",
      description: "Cheesecakes, brownies, and late-night dessert boxes.",
      menu: [
        { id: "sc-cheesecake", name: "Blueberry Cheesecake", price: 190, description: "Creamy cheesecake with fresh blueberry glaze." },
        { id: "sc-brownie", name: "Hot Chocolate Brownie", price: 170, description: "Dense brownie served with fudge drizzle." },
      ],
    },
    {
      id: "green-bowl",
      name: "Green Bowl Kitchen",
      cuisine: "Healthy",
      rating: 4.6,
      deliveryTime: "22-28 min",
      costForTwo: 420,
      offer: "Healthy Combo",
      description: "Protein bowls, salads, wraps, and light meals.",
      menu: [
        { id: "gb-bowl", name: "Peri Peri Protein Bowl", price: 240, description: "Rice, grilled chicken, beans, and veggies." },
        { id: "gb-salad", name: "Mediterranean Salad", price: 220, description: "Crisp greens, olives, feta, and lemon dressing." },
      ],
    },
    {
      id: "chai-adda",
      name: "Chai Adda",
      cuisine: "Indian",
      rating: 4.3,
      deliveryTime: "15-20 min",
      costForTwo: 250,
      offer: "Snacks Saver",
      description: "Street-style chai, sandwiches, and evening snacks.",
      menu: [
        { id: "ca-tea", name: "Masala Chai Flask", price: 120, description: "Strong masala chai for two servings." },
        { id: "ca-samosa", name: "Samosa Chaat", price: 150, description: "Crispy samosa topped with chutneys and curd." },
      ],
    },
  ];

  const searchForm = document.querySelector(".search-form");
  const searchInput = document.querySelector("#search");
  const heroBadge = document.querySelector(".hero-badge");
  const heroDescription = document.querySelector(".hero p");
  const restaurantList = document.querySelector("#restaurant-list");
  const resultsSummary = document.querySelector("#results-summary");
  const filterChips = Array.from(document.querySelectorAll(".filter-chip"));
  const cartItemsContainer = document.querySelector("#cart-items");
  const subtotalAmount = document.querySelector("#subtotal-amount");
  const deliveryFee = document.querySelector("#delivery-fee");
  const grandTotal = document.querySelector("#grand-total");
  const cartTotal = document.querySelector("#cart-total");
  const restaurantCount = document.querySelector("#restaurant-count");
  const deliveryTime = document.querySelector("#delivery-time");
  const checkoutButton = document.querySelector("#checkout-button");
  const loginForm = document.querySelector("#login-form");
  const signupForm = document.querySelector("#signup-form");
  const authUserStatus = document.querySelector("#auth-user-status");
  const logoutButton = document.querySelector("#logout-button");
  const navAnchors = Array.from(document.querySelectorAll('.nav-list a[href^="#"]'));

  if (
    !searchForm ||
    !searchInput ||
    !restaurantList ||
    !cartItemsContainer ||
    !subtotalAmount ||
    !grandTotal ||
    !cartTotal ||
    !checkoutButton
  ) {
    return;
  }

  const heroDefault = {
    badge: heroBadge ? heroBadge.textContent.trim() : "",
    description: heroDescription ? heroDescription.textContent.trim() : "",
  };

  const state = {
    query: "",
    activeFilter: "all",
    cart: loadState(STORAGE_KEYS.cart, {}),
    user: null,
    authReady: false,
  };

  const searchStatus = document.createElement("p");
  searchStatus.className = "status-message";
  searchStatus.setAttribute("role", "status");
  searchStatus.setAttribute("aria-live", "polite");
  searchForm.insertAdjacentElement("afterend", searchStatus);

  attachFormStatus(loginForm);
  attachFormStatus(signupForm);

  const auth = initializeFirebaseAuth();

  function loadState(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveState(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function formatCurrency(amount) {
    return `Rs. ${amount}`;
  }

  function isFirebaseConfigured(config) {
    if (!config) {
      return false;
    }

    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
      const value = config[key];
      return typeof value === "string" && value.trim() && !value.startsWith("PASTE_YOUR_");
    });
  }

  function initializeFirebaseAuth() {
    const config = window.__FIREBASE_CONFIG__;

    if (!window.firebase || !isFirebaseConfigured(config)) {
      const message = "Firebase auth is not configured yet. Add your Firebase keys in assets/js/firebase-config.js.";
      setFormStatus(loginForm, message);
      setFormStatus(signupForm, message);
      if (authUserStatus) {
        authUserStatus.textContent = "Firebase auth not configured.";
      }
      return null;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }

    const authInstance = firebase.auth();
    authInstance.onAuthStateChanged((user) => {
      state.user = user
        ? {
            name: user.displayName || user.email || "User",
            email: user.email || "",
            uid: user.uid,
          }
        : null;
      state.authReady = true;
      updateAuthUI();
    });

    return authInstance;
  }

  function getFilteredRestaurants() {
    const query = state.query.trim().toLowerCase();

    return restaurants.filter((restaurant) => {
      const matchesFilter =
        state.activeFilter === "all" || restaurant.cuisine === state.activeFilter;

      if (!query) {
        return matchesFilter;
      }

      const haystack = [
        restaurant.name,
        restaurant.cuisine,
        restaurant.description,
        ...restaurant.menu.map((item) => `${item.name} ${item.description}`),
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && haystack.includes(query);
    });
  }

  function getAverageDeliveryTime() {
    const times = restaurants.flatMap((restaurant) =>
      restaurant.deliveryTime.split("-").map((value) => Number.parseInt(value, 10))
    );
    const min = Math.min(...times);
    const max = Math.max(...times);
    return `${min}-${max} min`;
  }

  function getCartEntries() {
    const entries = [];

    Object.entries(state.cart).forEach(([menuId, quantity]) => {
      if (!quantity) {
        return;
      }

      for (const restaurant of restaurants) {
        const item = restaurant.menu.find((menuItem) => menuItem.id === menuId);

        if (item) {
          entries.push({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            ...item,
            quantity,
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

  function renderRestaurants() {
    const filtered = getFilteredRestaurants();

    restaurantList.innerHTML = "";

    if (!filtered.length) {
      restaurantList.innerHTML = `
        <article class="empty-state">
          <strong>No matching restaurants found.</strong>
          <p class="muted-note">Try a different dish name or switch the cuisine filter.</p>
        </article>
      `;
    } else {
      const fragment = document.createDocumentFragment();

      filtered.forEach((restaurant) => {
        const card = document.createElement("article");
        card.className = "restaurant-card";
        card.innerHTML = `
          <div class="restaurant-top">
            <div>
              <h3>${restaurant.name}</h3>
              <p class="restaurant-copy">${restaurant.description}</p>
            </div>
            <div class="restaurant-meta">
              <span>${restaurant.rating} rating</span>
              <span>${restaurant.deliveryTime}</span>
            </div>
          </div>
          <div class="restaurant-footer">
            <div class="menu-tags">
              <span>${restaurant.cuisine}</span>
              <span>${restaurant.offer}</span>
              <span>Cost for two ${formatCurrency(restaurant.costForTwo)}</span>
            </div>
          </div>
          <div class="menu-items">
            ${restaurant.menu
              .map(
                (item) => `
                  <article class="menu-item">
                    <div>
                      <strong>${item.name}</strong>
                      <p>${item.description}</p>
                    </div>
                    <div class="menu-item-action">
                      <span class="price">${formatCurrency(item.price)}</span>
                      <button
                        type="button"
                        class="secondary-button add-to-cart"
                        data-menu-id="${item.id}"
                      >
                        Add to cart
                      </button>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        `;
        fragment.appendChild(card);
      });

      restaurantList.appendChild(fragment);
    }

    resultsSummary.textContent = `${filtered.length} restaurant${filtered.length === 1 ? "" : "s"} available`;

    if (state.query.trim()) {
      if (heroBadge) {
        heroBadge.textContent = "Search applied";
      }
      if (heroDescription) {
        heroDescription.textContent = `${filtered.length} restaurant${filtered.length === 1 ? "" : "s"} match "${state.query.trim()}". Add items to your cart below.`;
      }
      searchStatus.textContent = `Showing results for "${state.query.trim()}".`;
    } else {
      if (heroBadge) {
        heroBadge.textContent = heroDefault.badge;
      }
      if (heroDescription) {
        heroDescription.textContent = heroDefault.description;
      }
      searchStatus.textContent = auth ? "Search by restaurant, cuisine, or dish." : "Search works now. Add Firebase keys to enable shared login across devices.";
    }
  }

  function renderCart() {
    const entries = getCartEntries();
    const subtotal = getCartSubtotal();
    const total = entries.length ? subtotal + DELIVERY_FEE : 0;

    cartItemsContainer.innerHTML = "";

    if (!entries.length) {
      cartItemsContainer.innerHTML = `
        <article class="empty-state">
          <strong>Your cart is empty.</strong>
          <p class="muted-note">Pick dishes from the restaurant list to build your order.</p>
        </article>
      `;
    } else {
      const fragment = document.createDocumentFragment();

      entries.forEach((item) => {
        const cartItem = document.createElement("article");
        cartItem.className = "cart-item";
        cartItem.innerHTML = `
          <div class="cart-item-head">
            <div>
              <strong>${item.name}</strong>
              <p class="muted-note">${item.restaurantName}</p>
            </div>
            <strong>${formatCurrency(item.price * item.quantity)}</strong>
          </div>
          <div class="cart-item-controls">
            <div class="quantity-controls">
              <button type="button" class="quantity-button" data-action="decrease" data-menu-id="${item.id}">-</button>
              <span>${item.quantity}</span>
              <button type="button" class="quantity-button" data-action="increase" data-menu-id="${item.id}">+</button>
            </div>
            <button type="button" class="ghost-button" data-action="remove" data-menu-id="${item.id}">Remove</button>
          </div>
        `;
        fragment.appendChild(cartItem);
      });

      cartItemsContainer.appendChild(fragment);
    }

    subtotalAmount.textContent = formatCurrency(subtotal);
    deliveryFee.textContent = formatCurrency(entries.length ? DELIVERY_FEE : 0);
    grandTotal.textContent = formatCurrency(total);
    cartTotal.textContent = formatCurrency(total);
    checkoutButton.disabled = !entries.length;
    checkoutButton.textContent = entries.length ? "Place Order" : "Add items to order";
  }

  function updateHeroStats() {
    restaurantCount.textContent = String(restaurants.length);
    deliveryTime.textContent = getAverageDeliveryTime();
  }

  function updateAuthUI() {
    if (!authUserStatus) {
      return;
    }

    if (!auth) {
      authUserStatus.textContent = "Firebase auth not configured. Paste your Firebase keys first.";
      if (logoutButton) {
        logoutButton.hidden = true;
      }
      return;
    }

    if (!state.authReady) {
      authUserStatus.textContent = "Checking sign-in state...";
      if (logoutButton) {
        logoutButton.hidden = true;
      }
      return;
    }

    if (state.user) {
      authUserStatus.textContent = `Signed in as ${state.user.name} (${state.user.email}).`;
      if (logoutButton) {
        logoutButton.hidden = false;
      }
      setFormStatus(loginForm, `Logged in as ${state.user.name}.`);
      setFormStatus(signupForm, `Account ready for ${state.user.email}.`);
    } else {
      authUserStatus.textContent = "Not signed in.";
      if (logoutButton) {
        logoutButton.hidden = true;
      }
    }
  }

  function addToCart(menuId) {
    state.cart[menuId] = (state.cart[menuId] || 0) + 1;
    saveState(STORAGE_KEYS.cart, state.cart);
    renderCart();
    searchStatus.textContent = "Item added to cart.";
  }

  function changeCartQuantity(menuId, action) {
    const currentQty = state.cart[menuId] || 0;

    if (action === "increase") {
      state.cart[menuId] = currentQty + 1;
    } else if (action === "decrease") {
      const nextQty = currentQty - 1;
      if (nextQty > 0) {
        state.cart[menuId] = nextQty;
      } else {
        delete state.cart[menuId];
      }
    } else if (action === "remove") {
      delete state.cart[menuId];
    }

    saveState(STORAGE_KEYS.cart, state.cart);
    renderCart();
  }

  function attachFormStatus(form) {
    if (!form) {
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
    if (status) {
      status.textContent = message;
    }
  }

  async function handleSignup(event) {
    event.preventDefault();

    if (!auth || !signupForm) {
      setFormStatus(signupForm, "Firebase auth is not configured yet.");
      return;
    }

    const formData = new FormData(signupForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);

      if (userCredential.user && name) {
        await userCredential.user.updateProfile({ displayName: name });
      }

      setFormStatus(signupForm, `Account created for ${email}. You can now log in on any device.`);
      signupForm.reset();
    } catch (error) {
      setFormStatus(signupForm, error.message || "Unable to create account.");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!auth || !loginForm) {
      setFormStatus(loginForm, "Firebase auth is not configured yet.");
      return;
    }

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      await auth.signInWithEmailAndPassword(email, password);
      setFormStatus(loginForm, `Logged in as ${email}.`);
      loginForm.reset();
    } catch (error) {
      setFormStatus(loginForm, error.message || "Unable to log in.");
    }
  }

  async function handleLogout() {
    if (!auth) {
      return;
    }

    await auth.signOut();
    setFormStatus(loginForm, "Logged out successfully.");
  }

  function handleCheckout() {
    const entries = getCartEntries();

    if (!entries.length) {
      searchStatus.textContent = "Your cart is empty.";
      return;
    }

    if (!state.user) {
      searchStatus.textContent = "Sign in before placing an order.";
      document.querySelector("#login")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const itemCount = entries.reduce((sum, item) => sum + item.quantity, 0);
    const total = getCartSubtotal() + DELIVERY_FEE;

    searchStatus.textContent = `Order placed for ${itemCount} item${itemCount === 1 ? "" : "s"} totaling ${formatCurrency(total)}.`;
    state.cart = {};
    saveState(STORAGE_KEYS.cart, state.cart);
    renderCart();
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = searchInput.value.trim();
    renderRestaurants();
    document.querySelector("#restaurants")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value.trim();
    renderRestaurants();
  });

  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.activeFilter = chip.dataset.filter || "all";

      filterChips.forEach((button) => {
        button.classList.toggle("is-active", button === chip);
      });

      renderRestaurants();
    });
  });

  restaurantList.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-cart");

    if (!button) {
      return;
    }

    addToCart(button.dataset.menuId);
  });

  cartItemsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const menuId = button.dataset.menuId;
    const action = button.dataset.action;

    if (menuId && action) {
      changeCartQuantity(menuId, action);
    }
  });

  checkoutButton.addEventListener("click", handleCheckout);
  signupForm?.addEventListener("submit", handleSignup);
  loginForm?.addEventListener("submit", handleLogin);
  logoutButton?.addEventListener("click", handleLogout);

  navAnchors.forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const targetSelector = anchor.getAttribute("href");

      if (!targetSelector || !targetSelector.startsWith("#")) {
        return;
      }

      const target = document.querySelector(targetSelector);

      if (!target) {
        return;
      }

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  updateHeroStats();
  updateAuthUI();
  renderRestaurants();
  renderCart();
});

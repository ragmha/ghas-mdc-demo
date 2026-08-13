const form = document.querySelector("#search-form");
const search = document.querySelector("#search");
const orders = document.querySelector("#orders");
const resultCount = document.querySelector("#result-count");

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function render(data) {
  resultCount.textContent = `${data.query.returned} synthetic order${data.query.returned === 1 ? "" : "s"}`;
  orders.innerHTML = data.orders
    .map(
      (order) => `
        <article class="order-card">
          <span class="tag">${escapeHtml(order.dataClassification)}</span>
          <h3>${escapeHtml(order.orderNumber)} · ${escapeHtml(order.productName)}</h3>
          <p class="meta">${escapeHtml(order.customerName)} · ${escapeHtml(order.region)} · ${escapeHtml(order.status)}</p>
          <p class="amount">${currency.format(order.orderTotal)}</p>
          <p>${escapeHtml(order.notePreview)}</p>
        </article>
      `
    )
    .join("");
}

async function loadOrders() {
  const params = new URLSearchParams({
    limit: "9"
  });
  if (search.value.trim()) {
    params.set("search", search.value.trim());
  }

  const response = await fetch(`/api/orders?${params.toString()}`);
  if (!response.ok) {
    const problem = await response.json();
    throw new Error(problem.message ?? "Unable to load synthetic orders.");
  }

  render(await response.json());
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadOrders().catch((error) => {
    resultCount.textContent = "Search failed";
    orders.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  });
});

loadOrders().catch((error) => {
  resultCount.textContent = "Unavailable";
  orders.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
});

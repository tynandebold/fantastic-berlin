// Fantastic Berlin — client-side render of listings.json. No framework, no build.

const state = {
  listings: [],
  generatedDate: "",
  filters: {
    sort: "floor",
    minFloor: "",
    neighborhood: "",
    maxPpsqm: "",
    minRooms: "",
    newOnly: false,
  },
};

const euro = new Intl.NumberFormat("de-DE");

function formatPrice(n) {
  if (n == null) {
    return "On request";
  }

  return euro.format(n) + " €";
}

function floorBadge(floor) {
  if (floor.isTop) {
    const lbl = floor.value != null ? `${floor.value}· top` : "attic / top";

    return { num: "TOP", lbl, cls: "is-top" };
  }

  if (floor.value != null) {
    const lbl = floor.value === 0 ? "ground" : "floor";

    return { num: String(floor.value), lbl, cls: "" };
  }

  return { num: "—", lbl: "floor n/a", cls: "is-unknown" };
}

function floorRank(l) {
  if (l.floor.isTop) {
    return 1000 + (l.floor.value ?? 0);
  }

  return l.floor.value ?? -1000;
}

function isNew(l) {
  return l.firstSeen === state.generatedDate;
}

function priceDropped(l) {
  return l.previousPrice != null && l.price != null && l.price < l.previousPrice;
}

function passesFilters(l) {
  const f = state.filters;

  if (f.minFloor === "top" && !l.floor.isTop) {
    return false;
  }

  if (f.minFloor && f.minFloor !== "top") {
    const min = Number(f.minFloor);
    const ok = l.floor.isTop || (l.floor.value != null && l.floor.value >= min);

    if (!ok) {
      return false;
    }
  }

  if (f.neighborhood && l.neighborhood !== f.neighborhood) {
    return false;
  }

  if (f.maxPpsqm) {
    if (l.pricePerSqm == null || l.pricePerSqm > Number(f.maxPpsqm)) {
      return false;
    }
  }

  if (f.minRooms) {
    if (l.rooms == null || l.rooms < Number(f.minRooms)) {
      return false;
    }
  }

  if (f.newOnly && !isNew(l)) {
    return false;
  }

  return true;
}

function sortListings(list) {
  const f = state.filters;
  const byNullable = (a, b, dir) => {
    if (a == null && b == null) {
      return 0;
    }

    if (a == null) {
      return 1;
    }

    if (b == null) {
      return -1;
    }

    return dir === "asc" ? a - b : b - a;
  };

  const sorted = [...list];

  if (f.sort === "floor") {
    sorted.sort((a, b) => floorRank(b) - floorRank(a));
  } else if (f.sort === "ppsqm") {
    sorted.sort((a, b) => byNullable(a.pricePerSqm, b.pricePerSqm, "asc"));
  } else if (f.sort === "price") {
    sorted.sort((a, b) => byNullable(a.price, b.price, "asc"));
  } else if (f.sort === "price-desc") {
    sorted.sort((a, b) => byNullable(a.price, b.price, "desc"));
  } else if (f.sort === "size") {
    sorted.sort((a, b) => byNullable(a.sizeSqm, b.sizeSqm, "desc"));
  } else if (f.sort === "new") {
    sorted.sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : a.firstSeen > b.firstSeen ? -1 : floorRank(b) - floorRank(a)));
  }

  return sorted;
}

function card(l) {
  const fb = floorBadge(l.floor);

  const badges = [];

  if (isNew(l)) {
    badges.push(`<span class="badge new">New</span>`);
  }

  if (priceDropped(l)) {
    badges.push(`<span class="badge drop">↓ ${formatPrice(l.previousPrice)}</span>`);
  }

  if (l.status === "Coming Soon") {
    badges.push(`<span class="badge soon">Soon</span>`);
  }

  const media = l.imageUrl
    ? `<img src="${l.imageUrl}" alt="${l.title}" loading="lazy" />`
    : `<div class="media"></div>`;

  const was = priceDropped(l) ? `<span class="was">was ${formatPrice(l.previousPrice)}</span>` : "";
  const ppsqm = l.pricePerSqm != null ? `${euro.format(l.pricePerSqm)} €/m²` : "";

  return `
    <a class="card" href="${l.url}" target="_blank" rel="noopener">
      <div class="media">
        ${media}
        <div class="floor-badge ${fb.cls}">
          <span class="num">${fb.num}</span>
          <span class="lbl">${fb.lbl}</span>
        </div>
        <div class="badges">${badges.join("")}</div>
      </div>
      <div class="body">
        <div class="addr">${l.title}</div>
        <div class="hood">${l.neighborhood ?? "Berlin"}</div>
        <div class="stats">
          <div class="stat">
            <span class="v ${l.sizeSqm == null ? "muted" : ""}">${l.sizeSqm != null ? l.sizeSqm + " m²" : "—"}</span>
            <span class="k">Size</span>
          </div>
          <div class="stat">
            <span class="v ${l.rooms == null ? "muted" : ""}">${l.rooms != null ? l.rooms : "—"}</span>
            <span class="k">Rooms</span>
          </div>
        </div>
        <div class="price-row">
          <span class="price">${formatPrice(l.price)}${was}</span>
          <span class="ppsqm">${ppsqm}</span>
        </div>
      </div>
    </a>
  `;
}

function render() {
  const visible = sortListings(state.listings.filter(passesFilters));
  const grid = document.getElementById("grid");
  const status = document.getElementById("status");

  status.textContent = `${visible.length} of ${state.listings.length} listings`;

  if (visible.length === 0) {
    grid.innerHTML = `<div class="empty">No listings match these filters.</div>`;

    return;
  }

  grid.innerHTML = visible.map(card).join("");
}

function populateNeighborhoods() {
  const set = new Set(state.listings.map((l) => l.neighborhood).filter(Boolean));
  const select = document.getElementById("neighborhood");

  for (const n of [...set].sort()) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  }
}

function wireControls() {
  const bind = (id, key, isCheckbox) => {
    const el = document.getElementById(id);

    el.addEventListener("change", () => {
      state.filters[key] = isCheckbox ? el.checked : el.value;
      render();
    });
  };

  bind("sort", "sort");
  bind("minFloor", "minFloor");
  bind("neighborhood", "neighborhood");
  bind("maxPpsqm", "maxPpsqm");
  bind("minRooms", "minRooms");
  bind("newOnly", "newOnly", true);

  document.getElementById("reset").addEventListener("click", () => {
    state.filters = { sort: "floor", minFloor: "", neighborhood: "", maxPpsqm: "", minRooms: "", newOnly: false };
    document.getElementById("sort").value = "floor";
    document.getElementById("minFloor").value = "";
    document.getElementById("neighborhood").value = "";
    document.getElementById("maxPpsqm").value = "";
    document.getElementById("minRooms").value = "";
    document.getElementById("newOnly").checked = false;
    render();
  });
}

async function loadData() {
  // Same-dir in production (workflow copies it here); dev fallback to ../data.
  for (const path of ["./listings.json", "../data/listings.json"]) {
    try {
      const res = await fetch(path, { cache: "no-store" });

      if (res.ok) {
        return res.json();
      }
    } catch {
      // try next path
    }
  }

  throw new Error("could not load listings.json");
}

async function init() {
  try {
    const data = await loadData();

    state.listings = data.listings ?? [];
    state.generatedDate = (data.generatedAt ?? "").slice(0, 10);

    const when = state.generatedDate ? new Date(data.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "unknown";

    document.getElementById("meta").textContent = ` · ${state.listings.length} listings · updated ${when}`;

    populateNeighborhoods();
    wireControls();
    render();
  } catch (err) {
    document.getElementById("status").textContent = `Failed to load listings: ${err.message}`;
  }
}

init();

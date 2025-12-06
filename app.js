/* ============================================================
   GLOBAL STATE
============================================================ */
let user = null;
let experiences = [];
let filtered = [];
let map3d = null;
let addMap = null;
let currentMarker = null;
let markers = [];
let userLocation = null;

let activeFilters = {
  interest: "all",
  mood: "any"
};

/* ============================================================
   AUTH + NAVBAR
============================================================ */
auth.onAuthStateChanged(u => {
  user = u;
  loadNavbar();
});

function loadNavbar() {
  const nav = document.getElementById("navLinks");
  if (!nav) return;

  if (user) {
    nav.innerHTML = `
      <a href="index.html">Home</a>
      <a href="explore.html" class="active-link">Explore</a>
      <a href="add-experience.html">Add Experience</a>
      <a href="itinerary.html">Itinerary</a>
      <a href="profile.html">Profile</a>
      <a href="#" id="logoutBtn">Logout</a>
    `;
    document.getElementById("logoutBtn").onclick = async () => {
      await auth.signOut();
      window.location.href = "index.html";
    };
  } else {
    nav.innerHTML = `
      <a href="index.html">Home</a>
      <a href="explore.html" class="active-link">Explore</a>
      <a href="login.html">Login</a>
      <a href="signup.html">Sign Up</a>
    `;
  }
}

/* ============================================================
   USER LOCATION (GPS IF ALLOWED)
============================================================ */
function detectUserLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve([17.6868, 83.2185]); // Vizag fallback
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve([17.6868, 83.2185])
    );
  });
}

/* ============================================================
   MAPLIBRE 3D MAP FOR EXPLORE PAGE
============================================================ */
async function initExploreMap() {
  const el = document.getElementById("map3d");
  if (!el) return;

  userLocation = await detectUserLocation();

  map3d = new maplibregl.Map({
    container: "map3d",
    style: {
      version: 8,
      sources: {
        esri: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          ],
          tileSize: 256
        }
      },
      layers: [
        {
          id: "esri",
          type: "raster",
          source: "esri"
        }
      ]
    },
    center: [83.2185, 17.6868],
    zoom: 13,
    pitch: 45,
    bearing: -20
  });

  map3d.touchZoomRotate.enable();
  map3d.touchZoomRotate.enableRotation();
}

/* ============================================================
   LOAD EXPERIENCES FROM FIREBASE
============================================================ */
async function loadExperiences() {
  const snap = await db.collection("experiences").get();
  experiences = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  filtered = experiences;
  renderList(filtered);
  updateMapPins(filtered);
}

/* ============================================================
   FILTER EXPERIENCES
============================================================ */
function applyFilters() {
  filtered = experiences.filter(exp => {
    let okInterest =
      activeFilters.interest === "all" ||
      (exp.interest && exp.interest.includes(activeFilters.interest));

    let okMood =
      activeFilters.mood === "any" ||
      exp.mood === activeFilters.mood;

    return okInterest && okMood;
  });

  renderList(filtered);
  updateMapPins(filtered);
}

document.addEventListener("click", e => {
  if (e.target.classList.contains("chip")) {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("chip-active"));
    e.target.classList.add("chip-active");
    activeFilters.interest = e.target.dataset.interest;
    applyFilters();
  }
});

document.addEventListener("change", e => {
  if (e.target.id === "moodFilter") {
    activeFilters.mood = e.target.value;
    applyFilters();
  }
});

/* ============================================================
   MAP PINS FOR EXPLORE
============================================================ */
function updateMapPins(list) {
  if (!map3d) return;

  markers.forEach(m => m.remove());
  markers = [];

  list.forEach((exp, idx) => {
    if (!exp.lat || !exp.lng) return;

    const marker = new maplibregl.Marker({ color: "#ff7b00" })
      .setLngLat([exp.lng, exp.lat])
      .addTo(map3d);

    marker._index = idx;

    marker.getElement().addEventListener("click", () => {
      highlightListItem(idx);

      map3d.flyTo({
        center: [exp.lng, exp.lat],
        zoom: 15,
        pitch: 45
      });
    });

    markers.push(marker);
  });
}

/* ============================================================
   LIST UI + DISTANCE
============================================================ */
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI/180) *
    Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) ** 2;
  return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) * 10) / 10;
}

function renderList(list) {
  const container = document.getElementById("experienceList");
  const count = document.getElementById("resultsCount");
  if (!container) return;

  container.innerHTML = "";

  list.forEach((exp, index) => {
    const dist = getDistanceKm(
      userLocation[0],
      userLocation[1],
      exp.lat,
      exp.lng
    );

    const card = document.createElement("div");
    card.className = "experience-card";

    card.innerHTML = `
      <div class="experience-main">
        <h3>${exp.title}</h3>
        <p>${exp.description || ""}</p>
        <p class="muted tiny">${dist} km</p>
      </div>

      <div class="experience-side">
        <button class="btn-sm" onclick='addToItinerary("${exp.id}")'>Add</button>
      </div>
    `;

    card.addEventListener("click", () => {
      highlightListItem(index);

      if (markers[index]) {
        const e = list[index];
        map3d.flyTo({
          center: [e.lng, e.lat],
          zoom: 15,
          pitch: 45
        });
      }
    });

    container.appendChild(card);
  });

  count.textContent = `${list.length} results`;
}

function highlightListItem(i) {
  const cards = document.querySelectorAll(".experience-card");
  cards.forEach(c => c.classList.remove("active-card"));

  if (cards[i]) {
    cards[i].classList.add("active-card");
    cards[i].scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ============================================================
   ITINERARY
============================================================ */
function addToItinerary(id) {
  const exp = experiences.find(e => e.id === id);
  if (!exp) return;

  let list = JSON.parse(localStorage.getItem("ll_itinerary") || "[]");

  if (list.some(i => i.id === exp.id)) {
    showToast("Already added");
    return;
  }

  list.push(exp);
  localStorage.setItem("ll_itinerary", JSON.stringify(list));
  showToast("Added");
}

/* ============================================================
   ADD EXPERIENCE PAGE — MAP PICKER
============================================================ */
function initAddMap() {
  const el = document.getElementById("addMap");
  if (!el) return;

  addMap = new maplibregl.Map({
    container: "addMap",
    style: {
      version: 8,
      sources: {
        esri: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          ],
          tileSize: 256
        }
      },
      layers: [{ id: "esri", type: "raster", source: "esri" }]
    },
    center: [83.2185, 17.6868],
    zoom: 13,
    pitch: 45,
    bearing: -20
  });

  addMap.on("click", e => {
    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;

    document.getElementById("expLat").value = lat.toFixed(6);
    document.getElementById("expLng").value = lng.toFixed(6);

    if (currentMarker) currentMarker.remove();

    currentMarker = new maplibregl.Marker({ color: "#00ff67" })
      .setLngLat([lng, lat])
      .addTo(addMap);
  });
}

/* ============================================================
   SUBMIT EXPERIENCE
============================================================ */
async function submitExperience() {
  const title = document.getElementById("expTitle").value;
  const city = document.getElementById("expCity").value;
  const description = document.getElementById("expDescription").value;
  const tags = document.getElementById("expTags").value;
  const mood = document.getElementById("expMood").value;
  const rating = parseFloat(document.getElementById("expRating").value);
  const lat = parseFloat(document.getElementById("expLat").value);
  const lng = parseFloat(document.getElementById("expLng").value);

  await db.collection("experiences").add({
    title,
    city,
    description,
    interest: tags.split(",").map(t => t.trim().toLowerCase()),
    mood,
    rating,
    lat,
    lng
  });

  showToast("Experience Published!");
  setTimeout(() => (window.location.href = "explore.html"), 1500);
}

/* ============================================================
   TOAST
============================================================ */
function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("toast-visible");
  setTimeout(() => t.classList.remove("toast-visible"), 1800);
}

/* ============================================================
   INIT PAGE
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initExploreMap();
  initAddMap();
  loadExperiences();
});

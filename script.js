
const API_BASE = "https://producer-consumer-simulator-1s04.onrender.com";

const capacitySelect = document.getElementById("capacity");
const bufferElement = document.getElementById("buffer");
const countElement = document.getElementById("count");
const producedElement = document.getElementById("produced");
const consumedElement = document.getElementById("consumed");
const logElement = document.getElementById("log");
const emptyCountElement = document.getElementById("emptyCount");
const fullCountElement = document.getElementById("fullCount");
const mutexStatusElement = document.getElementById("mutexStatus");

let capacity = 5;
let buffer = [];
let produced = 0;
let consumed = 0;
let automaticMode = false;
let autoTimer = null;
let autoTurn = "produce";
let busy = false;

function log(message) {
  const line = document.createElement("p");
  line.textContent = message;
  logElement.prepend(line);
}

function render() {
  bufferElement.replaceChildren();

  for (let i = 0; i < capacity; i++) {
    const slot = document.createElement("div");
    slot.className = "slot" + (buffer[i] ? " filled" : "");

    const label = document.createElement("small");
    label.textContent = "Slot " + (i + 1);

    const value = document.createElement("strong");
    value.textContent = buffer[i] ?? "EMPTY";

    slot.append(label, value);
    bufferElement.appendChild(slot);
  }

  countElement.textContent = buffer.length;
  producedElement.textContent = produced;
  consumedElement.textContent = consumed;
  emptyCountElement.textContent = capacity - buffer.length;
  fullCountElement.textContent = buffer.length;
  mutexStatusElement.textContent = "Unlocked";
}

async function refreshState() {
  try {
    const response = await fetch(`${API_BASE}/state`);

    if (!response.ok) {
      throw new Error("Could not load simulation state.");
    }

    const state = await response.json();

    capacity = state.capacity;
    buffer = state.buffer;
    produced = state.produced;
    consumed = state.consumed;

    // The Java backend currently uses a fixed capacity of 5.
    if ([...capacitySelect.options].some(
      option => Number(option.value) === capacity
    )) {
      capacitySelect.value = String(capacity);
    }

    capacitySelect.disabled = true;

    render();

    logElement.replaceChildren();

    state.log.forEach(message => {
      const line = document.createElement("p");
      line.textContent = message;
      logElement.appendChild(line);
    });

  } catch (error) {
    console.error(error);
    log("Cannot connect to the backend. Check your internet connection and Render service.");
  }
}

async function performAction(action) {
  if (busy) return;

  busy = true;

  try {
    const response = await fetch(`${API_BASE}/${action}`, {
      method: "POST"
    });

    const state = await response.json();

    if (!response.ok && response.status !== 409) {
      throw new Error(state.error || "Request failed.");
    }

    capacity = state.capacity;
    buffer = state.buffer;
    produced = state.produced;
    consumed = state.consumed;

    render();

    logElement.replaceChildren();

    state.log.forEach(message => {
      const line = document.createElement("p");
      line.textContent = message;
      logElement.appendChild(line);
    });

  } catch (error) {
    console.error(error);
    log("Backend request failed. Please try again.");
  } finally {
    busy = false;
  }
}

document.getElementById("produce").addEventListener("click", () => {
  performAction("produce");
});

document.getElementById("consume").addEventListener("click", () => {
  performAction("consume");
});

document.getElementById("reset").addEventListener("click", async () => {
  stopAutomatic(false);
  await performAction("reset");
});

function runAutomatic() {
  if (!automaticMode) return;

  const action = autoTurn;
  autoTurn = autoTurn === "produce" ? "consume" : "produce";

  performAction(action).finally(() => {
    if (automaticMode) {
      autoTimer = setTimeout(runAutomatic, 1000);
    }
  });
}

document.getElementById("startAuto").addEventListener("click", () => {
  if (automaticMode) return;

  automaticMode = true;
  autoTurn = "produce";

  document.getElementById("startAuto").disabled = true;
  document.getElementById("stopAuto").disabled = false;

  log("Automatic simulation started.");
  runAutomatic();
});

function stopAutomatic(showMessage = true) {
  automaticMode = false;
  clearTimeout(autoTimer);

  document.getElementById("startAuto").disabled = false;
  document.getElementById("stopAuto").disabled = true;

  if (showMessage) {
    log("Automatic simulation stopped.");
  }
}

document.getElementById("stopAuto").addEventListener("click", () => {
  stopAutomatic();
});

document.getElementById("stopAuto").disabled = true;

// Refresh state so multiple visitors see the backend's current state.
refreshState();
setInterval(refreshState, 3000);

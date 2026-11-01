const capacitySelect = document.getElementById("capacity");
const bufferElement = document.getElementById("buffer");
const countElement = document.getElementById("count");
const producedElement = document.getElementById("produced");
const consumedElement = document.getElementById("consumed");
const logElement = document.getElementById("log");
const emptyCountElement = document.getElementById("emptyCount");
const fullCountElement = document.getElementById("fullCount");
const mutexStatusElement = document.getElementById("mutexStatus");

let capacity = Number(capacitySelect.value);
let buffer = [];
let produced = 0;
let consumed = 0;
let nextId = 1;

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

document.getElementById("produce").addEventListener("click", () => {
  if (buffer.length >= capacity) {
    log("Buffer FULL: producer cannot add an item.");
    return;
  }

  const item = "Item-" + nextId++;
  buffer.push(item);
  produced++;

  log("Produced " + item);
  render();
});

document.getElementById("consume").addEventListener("click", () => {
  if (buffer.length === 0) {
    log("Buffer EMPTY: consumer has no item.");
    return;
  }

  const item = buffer.shift();
  consumed++;

  log("Consumed " + item);
  render();
});

capacitySelect.addEventListener("change", () => {
  const newCapacity = Number(capacitySelect.value);

  if (buffer.length > newCapacity) {
    log("Consume items before reducing the capacity.");
    capacitySelect.value = String(capacity);
    return;
  }

  capacity = newCapacity;
  render();
});

document.getElementById("reset").addEventListener("click", () => {
  buffer = [];
  produced = 0;
  consumed = 0;
  nextId = 1;

  log("Simulation reset.");
  render();
});
render();
log("Simulator ready.");
let automaticMode = false;
let autoTimer = null;
let autoTurn = "produce";

document.getElementById("startAuto").addEventListener("click", () => {
  if (automaticMode) return;

  automaticMode = true;
  autoTurn = "produce";

  document.getElementById("startAuto").disabled = true;
  document.getElementById("stopAuto").disabled = false;

  log("Automatic simulation started.");
  runAutomatic();
});

function runAutomatic() {
  if (!automaticMode) return;

  if (autoTurn === "produce") {
    if (buffer.length < capacity) {
      const item = "Item-" + nextId++;
      buffer.push(item);
      produced++;
      log("Producer created " + item);
    } else {
      log("Producer waiting: buffer full.");
    }

    autoTurn = "consume";
  } else {
    if (buffer.length > 0) {
      const item = buffer.shift();
      consumed++;
      log("Consumer processed " + item);
    } else {
      log("Consumer waiting: buffer empty.");
    }

    autoTurn = "produce";
  }

  render();
  autoTimer = setTimeout(runAutomatic, 1000);
}

document.getElementById("stopAuto").addEventListener("click", () => {
  automaticMode = false;
  clearTimeout(autoTimer);

  document.getElementById("startAuto").disabled = false;
  document.getElementById("stopAuto").disabled = true;

  log("Automatic simulation stopped.");
});
capacitySelect.addEventListener("change", () => {
  const newCapacity = Number(capacitySelect.value);

  if (newCapacity < buffer.length) {
    log("Cannot reduce capacity below the current number of items.");
    capacitySelect.value = capacity;
    return;
  }

  capacity = newCapacity;
  render();

  log("Buffer capacity changed to " + capacity);
});
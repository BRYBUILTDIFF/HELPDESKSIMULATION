const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../../infrastructure/guacamole/guac-launch.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function launcher(search) {
  const messages = [];
  const cover = { hidden: false };
  const message = { textContent: "" };
  let tick;
  const clients = { lab: { clientState: { connectionState: "CONNECTING" } } };
  const frame = { contentWindow: {
    document: { querySelector: () => ({}), body: {} },
    angular: { element: () => ({ injector: () => ({ get: () => ({ getManagedClients: () => clients }) }) }) }
  } };
  const store = { length: 0 };
  const sandbox = {
    URL, URLSearchParams, Date,
    location: { search },
    parent: { postMessage: (data, origin) => messages.push({ data, origin }) },
    localStorage: store, sessionStorage: store,
    document: { getElementById: () => message, querySelector: () => cover, createElement: () => frame, body: { appendChild() {} } },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {},
    window: { addEventListener() {} }
  };
  vm.runInNewContext(script, sandbox);
  return { messages, cover, message, clients, tick: () => tick?.() };
}

test("launcher covers startup errors and requests only one retry per failure", () => {
  const lab = launcher("?data=test&parentOrigin=http%3A%2F%2Flocalhost%3A5173");
  lab.clients.lab.clientState.connectionState = "CLIENT_ERROR";
  lab.tick(); lab.tick();
  assert.equal(lab.cover.hidden, false);
  assert.equal(lab.messages.length, 1);
  assert.equal(lab.messages[0].data.state, "RETRY");
  assert.equal(lab.messages[0].origin, "http://localhost:5173");
});

test("launcher reveals only a connected desktop and covers a later disconnect", () => {
  const lab = launcher("?data=test&parentOrigin=https%3A%2F%2Fhelpdesk.example.com");
  lab.tick();
  assert.equal(lab.cover.hidden, false);
  lab.clients.lab.clientState.connectionState = "CONNECTED";
  lab.tick(); lab.tick();
  assert.equal(lab.cover.hidden, true);
  assert.ok(lab.messages.every(item => item.data.state === "CONNECTED"));
  lab.clients.lab.clientState.connectionState = "TUNNEL_ERROR";
  lab.tick();
  assert.equal(lab.cover.hidden, false);
  assert.equal(lab.messages.at(-1).data.state, "RETRY");
});

test("launcher rejects a missing connection token", () => {
  const lab = launcher("?parentOrigin=https%3A%2F%2Fhelpdesk.example.com");
  assert.match(lab.message.textContent, /not provided/);
  assert.equal(lab.messages.length, 0);
});

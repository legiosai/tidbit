// A minimal MCP client for Tidbit, for agents that cannot add an MCP server: it sends the same JSON-RPC an MCP
// client would and prints only what that client would put in the model's context.
//   node bench/tidbit.mjs tools                                   # tools/list (what a client loads once)
//   node bench/tidbit.mjs define '{"terms":["API","data lake"],"lang":"es"}'
//   node bench/tidbit.mjs get_term '{"term":"rag","detail":"full"}'
const URL = process.env.TIDBIT_MCP ?? "https://tidbit.legios.com.ar/mcp";
const [cmd, raw = "{}"] = process.argv.slice(2);
if (!cmd) { console.error("usage: node bench/tidbit.mjs <tools|tool-name> '<json arguments>'"); process.exit(2); }

const rpc = async (method, params) => {
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const msg = await r.json();
  if (msg.error) { console.error(`error ${msg.error.code}: ${msg.error.message}`); process.exit(1); }
  return msg.result;
};

if (cmd === "tools") {
  const { tools } = await rpc("tools/list", {});
  console.log(JSON.stringify(tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))));
} else {
  const result = await rpc("tools/call", { name: cmd, arguments: JSON.parse(raw) });
  console.log(result.content.map((c) => c.text).join("\n"));
  if (result.isError) process.exit(1);
}

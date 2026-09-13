// Legacy endpoint is intentionally retired. The browser now previews files and calls
// the authenticated atomic RPC. No service-role key, untrusted actor, or duplicate parser.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: "Actualiza la aplicación. La importación ahora se confirma desde la vista previa mediante import_treasury_records." }), { status: 410, headers });
});

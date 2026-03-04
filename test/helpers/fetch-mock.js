export function jsonResponse(
  payload,
  { headers = {}, status = 200, statusText = "OK" } = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    statusText,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function installFetchStub(handler) {
  if (typeof handler !== "function") {
    throw new TypeError("installFetchStub expects a function.");
  }

  const originalFetch = global.fetch;
  global.fetch = async (...args) => handler(...args);

  return () => {
    global.fetch = originalFetch;
  };
}

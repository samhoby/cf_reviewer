interface Env {
  API: Fetcher;
}

// Proxy every /api/* request to the backend Worker via service binding.
export const onRequest: PagesFunction<Env> = ({ request, env }) => env.API.fetch(request);

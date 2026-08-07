// Worker entry point. fetch/scheduled routing wired in T008/T009/T030.

export default {
  fetch(_request: Request): Response {
    return new Response("not implemented", { status: 501 });
  },
} satisfies ExportedHandler;

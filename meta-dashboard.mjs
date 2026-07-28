import handler from "./meta.mjs";

export default async request => {
  const url = new URL(request.url);
  url.searchParams.set("mode", "dashboard");
  return handler(new Request(url.toString(), request));
};

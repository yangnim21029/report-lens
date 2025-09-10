import NextAuth from "next-auth";
import { cache } from "react";
import { authConfig } from "./config";

const disableAuth = process.env.DISABLE_AUTH === "true";

let auth: any;
let handlers: { GET: any; POST: any };
let signIn: any;
let signOut: any;

if (disableAuth) {
  auth = async () => null as any;
  handlers = {
    GET: async () => new Response("Auth disabled", { status: 404 }),
    POST: async () => new Response("Auth disabled", { status: 404 }),
  };
  signIn = async () => undefined as any;
  signOut = async () => undefined as any;
} else {
  const next = NextAuth(authConfig);
  const { auth: uncachedAuth } = next;
  auth = cache(uncachedAuth);
  handlers = next.handlers;
  signIn = next.signIn;
  signOut = next.signOut;
}

export { auth, handlers, signIn, signOut };

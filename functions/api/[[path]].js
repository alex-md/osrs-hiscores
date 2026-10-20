import { forwardApiRequest } from "../../workers/src/gateway.js";
export const onRequest = (context) =>
  forwardApiRequest(context.request, context.env, context);

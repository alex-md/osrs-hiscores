import { handleApiRequest } from "../../workers/src/index.js";
export const onRequest = (context) =>
  handleApiRequest(context.request, context.env, context);

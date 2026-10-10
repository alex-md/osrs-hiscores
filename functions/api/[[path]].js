import { handleApiRequest } from "../../workers/src/index.js";
export const onRequest = ({ request, env }) => handleApiRequest(request, env);

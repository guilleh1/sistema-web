// oa-ui/src/api/client.js
import axios from "axios";

const baseURL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// console.log("[API] baseURL =", baseURL);

export default api;   // permite: import client from "../api/client.js"
export { api };       // permite: import { api } from "../api/client.js"

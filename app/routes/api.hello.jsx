import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  return json({
    success: true,
    message: "Hello from API!",
    timestamp: new Date().toISOString()
  });
};

export const loader = async ({ request }) => {
  return json({
    success: true,
    message: "Hello from API via GET!",
    timestamp: new Date().toISOString()
  });
};
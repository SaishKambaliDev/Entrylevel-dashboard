export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

async function getReferenceData(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load reference data. Please try again.");
  }

  return payload.data || [];
}

export function searchInstitutions(query) {
  return getReferenceData(`/institutions/search?q=${encodeURIComponent(query)}`);
}

export function searchIndustries(query) {
  return getReferenceData(`/industries/search?q=${encodeURIComponent(query)}`);
}

export function getDistricts() {
  return getReferenceData("/districts");
}

export function getSubdivisions(districtId) {
  return getReferenceData(`/subdivisions?districtId=${encodeURIComponent(districtId)}`);
}

export function getBlocks(districtId) {
  return getReferenceData(`/blocks?districtId=${encodeURIComponent(districtId)}`);
}

export function getUlbs(districtId) {
  return getReferenceData(`/ulbs?districtId=${encodeURIComponent(districtId)}`);
}

export function getVillages(blockId) {
  return getReferenceData(`/villages?blockId=${encodeURIComponent(blockId)}`);
}

export async function getDomains() {
  const domains = await getReferenceData("/domains");
  return domains.map((domain) => ({ id: domain.id, label: domain.name }));
}

export async function postAuth(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Unable to reach the server. Please try again.");
  }

  return payload.data;
}

export async function authenticatedRequest(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem("jansamadhanAuthToken");
  const isFormData = body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body && !isFormData ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(payload.message || "Unable to reach the server. Please try again.");
  return payload.data;
}

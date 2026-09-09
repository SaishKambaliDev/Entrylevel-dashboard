export const PREDEFINED_DOMAINS = [
  { id: "EDUCATION", name: "Education" },
  { id: "HEALTHCARE", name: "Healthcare" },
  { id: "AGRICULTURE_LIVELIHOOD", name: "Agriculture & Livelihood" },
  { id: "WATER_SANITATION", name: "Water & Sanitation" },
  { id: "ENVIRONMENT", name: "Environment" },
  { id: "ROADS_TRANSPORT", name: "Roads & Transport" },
  { id: "RURAL_DEVELOPMENT", name: "Rural Development" },
  { id: "URBAN_INFRASTRUCTURE", name: "Urban Infrastructure" },
  { id: "PUBLIC_SERVICES", name: "Public Services" },
  { id: "ACCESSIBILITY_INCLUSION", name: "Accessibility & Inclusion" },
  { id: "WOMEN_CHILD_WELFARE", name: "Women & Child Welfare" },
  { id: "ENERGY_ELECTRICITY", name: "Energy & Electricity" },
  { id: "DIGITAL_CONNECTIVITY", name: "Digital Connectivity" },
  { id: "OTHER", name: "Other" },
];

export const DOMAIN_IDS = PREDEFINED_DOMAINS.map((domain) => domain.id);

export function isValidDomain(domainId) {
  return DOMAIN_IDS.includes(domainId);
}

export function getDomainDisplayName(domainId) {
  const match = PREDEFINED_DOMAINS.find((domain) => domain.id === domainId);
  return match ? match.name : domainId || "Other";
}


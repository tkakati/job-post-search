function normalizeTextPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeRole(role: string) {
  return normalizeTextPart(role);
}

export function normalizeLocation(location: string) {
  return normalizeTextPart(location);
}

export function roleLocationKey(role: string, location: string) {
  return `${normalizeRole(role)}::${normalizeLocation(location)}`;
}

export function splitRoleLocationKey(key: string) {
  const [role = "", location = ""] = key.split("::", 2);
  return { role, location };
}


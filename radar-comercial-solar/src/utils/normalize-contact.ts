const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TLDs that are file extensions, not real email domains
const FILE_EXTENSION_TLDS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "pdf", "zip", "mp4", "mp3"]);

// Domains used by error-tracking platforms or known placeholder providers
const BLOCKED_DOMAINS = new Set(["domain.com", "example.com", "wixpress.com", "sentry.io", "sentry-next.wixpress.com"]);

// Local parts that are clearly file names or generic placeholders
const BLOCKED_LOCAL_PATTERNS = [/^logo(@|$)/, /^exemplo(@|$)/, /^example(@|$)/, /^placeholder(@|$)/];

// Sentry/error-tracking hashes: 32+ hex chars in local part
const HASH_LOCAL_RE = /^[0-9a-f]{32,}$/;

export const normalizeEmail = (value?: string): string | undefined => {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
};

export const isValidEmail = (value?: string): boolean => {
  const normalized = normalizeEmail(value);
  if (!normalized) return false;
  if (!emailPattern.test(normalized)) return false;

  const [local, domain] = normalized.split("@");
  if (!local || !domain) return false;

  const tld = domain.split(".").pop() ?? "";
  if (FILE_EXTENSION_TLDS.has(tld)) return false;
  if (BLOCKED_DOMAINS.has(domain)) return false;
  if (HASH_LOCAL_RE.test(local)) return false;
  if (BLOCKED_LOCAL_PATTERNS.some((re) => re.test(local))) return false;

  return true;
};

export const normalizePhone = (value?: string): string | undefined => {
  const digits = value?.replace(/\D/g, "");

  if (!digits || digits.length < 10) {
    return undefined;
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }

  return digits;
};

const SAFETY_KEY = 'applySafetyMeta';

export type SafetyMeta = {
  blockedUntil?: string | null;
  stealthCooldownUntil?: string | null;
};

export async function getSafetyMeta(): Promise<SafetyMeta> {
  const data = await chrome.storage.local.get(SAFETY_KEY);
  return (data[SAFETY_KEY] as SafetyMeta | undefined) ?? {};
}

export async function setSafetyMeta(partial: Partial<SafetyMeta>): Promise<void> {
  const current = await getSafetyMeta();
  await chrome.storage.local.set({
    [SAFETY_KEY]: { ...current, ...partial },
  });
}

export async function isBlocked(): Promise<boolean> {
  const meta = await getSafetyMeta();
  if (!meta.blockedUntil) return false;
  return Date.parse(meta.blockedUntil) > Date.now();
}

export async function setBlockedCooldown(until: Date): Promise<void> {
  await setSafetyMeta({ blockedUntil: until.toISOString() });
}

export async function clearBlockedCooldown(): Promise<void> {
  await setSafetyMeta({ blockedUntil: null });
}

export async function isStealthCooldownActive(): Promise<boolean> {
  const meta = await getSafetyMeta();
  if (!meta.stealthCooldownUntil) return false;
  return Date.parse(meta.stealthCooldownUntil) > Date.now();
}

export async function setStealthCooldown(until: Date): Promise<void> {
  await setSafetyMeta({ stealthCooldownUntil: until.toISOString() });
}

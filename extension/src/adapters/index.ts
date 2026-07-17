import type { PlatformAdapter } from './types';
import { NaukriAdapter } from './naukriAdapter';

/** Stubs for future platforms — same interface, no DOM logic yet. */
class StubAdapter implements PlatformAdapter {
  constructor(
    readonly platform: PlatformAdapter['platform'],
    private hostIncludes: string
  ) {}

  matches(url: string): boolean {
    return url.includes(this.hostIncludes);
  }

  isLoggedIn(): boolean {
    return false;
  }

  readJob() {
    return null;
  }

  detectApplicationStatus() {
    return null;
  }
}

const adapters: PlatformAdapter[] = [
  new NaukriAdapter(),
  new StubAdapter('linkedin', 'linkedin.com'),
  new StubAdapter('foundit', 'foundit.in'),
  new StubAdapter('indeed', 'indeed.com'),
  new StubAdapter('wellfound', 'wellfound.com'),
  new StubAdapter('internshala', 'internshala.com'),
];

export function resolveAdapter(url: string): PlatformAdapter | null {
  return adapters.find((a) => a.matches(url)) ?? null;
}

export { adapters };
